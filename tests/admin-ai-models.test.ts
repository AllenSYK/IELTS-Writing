import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test, { type TestContext } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createAdminModelsHandlers } from '@/lib/admin/ai-models-handler'
import { DEFAULT_AI_MODEL_SETTINGS, AiModelSlotSchema } from '@/lib/ai-model-settings'
import { decryptAiApiKey, encryptAiApiKey, resolveAiApiKey, AiModelSecretError } from '@/lib/ai-model-secrets'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import {
  getEffectiveAiConfig, getEffectiveGradingAiConfig, getEffectivePromptAiConfig,
  getEffectiveStudyPlanAiConfig, getEffectiveVisionAiConfig, getEffectiveVisionFallbackAiConfig,
  fetchAiCompletion, AiProviderError
} from '@/lib/ai-provider'

const SAVED_KEY = 'sk-admin-test-secret'
type Row = { setting_value: Record<string, unknown>; updated_at: string }

async function fixture(t: TestContext, initial: Row | null = null) {
  const originalEnv = { ...process.env }
  let row = initial
  let version = 100000
  let race = false
  let databaseDown = false
  let providerStatus = 200
  let providerError = ''
  let providerContent: string | null = null
  const writes: unknown[] = []
  const audits: unknown[] = []
  const calls: Array<{ authorization: string | undefined; body: Record<string, unknown>; path: string }> = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : null
    const url = new URL(req.url || '/', 'http://localhost')
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/rest/v1/admin_settings') {
      if (databaseDown) { res.statusCode = 503; res.end('{"message":"unavailable"}'); return }
      if (req.method === 'GET') { res.end(JSON.stringify(row ? [row] : [])); return }
      if (race) { race = false; res.end('[]'); return }
      if (req.method === 'PATCH' && url.searchParams.get('updated_at') !== `eq.${row?.updated_at}`) {
        res.end('[]'); return
      }
      if (req.method === 'POST' && row) { res.end('[]'); return }
      writes.push(body)
      row = { setting_value: body.setting_value, updated_at: `2026-10-24T12:00:00.${++version}+00:00` }
      res.end(JSON.stringify([row])); return
    }
    if (url.pathname === '/rest/v1/rpc/log_admin_action') {
      audits.push(body); res.end(JSON.stringify('audit-test-id')); return
    }
    if (url.pathname === '/v1/chat/completions') {
      calls.push({ authorization: req.headers.authorization, body, path: url.pathname })
      if (providerStatus !== 200) {
        res.statusCode = providerStatus
        res.end(JSON.stringify({ error: { message: providerError } })); return
      }
      const vision = Array.isArray(body.messages[0].content)
      const content = providerContent ?? (vision ? '{"color":"red"}' : '{"ok":true}')
      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream')
        // Split chunks to cover the production streaming parser too.
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, 5) } }] })}\n\n`)
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(5) }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
      } else res.end(JSON.stringify({ choices: [{ message: { content } }] }))
      return
    }
    res.statusCode = 404; res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  process.env.NEXT_PUBLIC_SUPABASE_URL = origin
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-side-test-service-role'
  delete process.env.AI_SETTINGS_ENCRYPTION_KEY
  delete process.env.AI_API_KEY
  const service = createClient(origin, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  let authStatus = 200
  const handlers = createAdminModelsHandlers({
    authorize: async (request) => {
      assertTrustedAdminMutationRequest(request)
      if (authStatus !== 200) throw new Response('', { status: authStatus })
      return { user: { id: 'admin-test-user' }, service }
    },
    errorResponse: (error) => Response.json({ success: false, code: 'SERVER_ERROR' }, { status: error instanceof Response ? error.status : 500 })
  })
  const settings = { ...DEFAULT_AI_MODEL_SETTINGS, baseUrl: `${origin}/v1` }
  function request(body?: unknown, method = 'PATCH', headers: Record<string, string> = {}) {
    return new Request(`${origin}/api/admin/models`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
    Object.assign(process.env, originalEnv)
  })
  return {
    settings, handlers, request, writes, audits, calls,
    get row() { return row },
    set row(value) { row = value },
    setAuth: (status: number) => { authStatus = status },
    raceNextWrite: () => { race = true },
    failDatabase: () => { databaseDown = true },
    providerFailure: (status: number, message: string) => { providerStatus = status; providerError = message },
    providerResponse: (content: string) => { providerContent = content }
  }
}

test('API keys use randomized authenticated encryption and reject tampering without leaking secrets', async (t) => {
  await fixture(t)
  const first = encryptAiApiKey(SAVED_KEY)
  assert.notEqual(first, encryptAiApiKey(SAVED_KEY))
  assert.ok(!first.includes(SAVED_KEY))
  assert.equal(decryptAiApiKey(first), SAVED_KEY)
  assert.throws(() => decryptAiApiKey(first.replace(/\.[^.]+$/, '.AAAA')), AiModelSecretError)
  process.env.AI_SETTINGS_ENCRYPTION_KEY = 'new-dedicated-encryption-source'
  assert.equal(decryptAiApiKey(first), SAVED_KEY)
  const dedicated = encryptAiApiKey(SAVED_KEY)
  process.env.AI_SETTINGS_ENCRYPTION_KEY = 'rotated-secret'
  assert.throws(() => decryptAiApiKey(dedicated), (error: unknown) => error instanceof AiModelSecretError && !error.message.includes(SAVED_KEY))
})

test('save → reload → all runtime slots use the encrypted admin credential without an environment API key', async (t) => {
  const f = await fixture(t)
  const response = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: `  ${SAVED_KEY}  ` }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const saved = await response.json()
  assert.equal(saved.apiKeySource, 'admin')
  assert.equal(saved.apiKeyConfigured, true)
  assert.ok(!JSON.stringify(saved).includes(SAVED_KEY))
  assert.ok(!JSON.stringify(saved).includes('encryptedApiKey'))
  assert.ok(!JSON.stringify(f.writes).includes(SAVED_KEY))
  assert.ok(!JSON.stringify(f.audits).includes(SAVED_KEY))
  const reloaded = await (await f.handlers.GET(f.request(undefined, 'GET'))).json()
  assert.equal(reloaded.updatedAt, '2026-10-24T12:00:00.100001+00:00')
  assert.ok(!JSON.stringify(reloaded).includes('encryptedApiKey'))
  const resolvers = [getEffectivePromptAiConfig, getEffectiveGradingAiConfig, getEffectiveStudyPlanAiConfig, getEffectiveVisionAiConfig, getEffectiveVisionFallbackAiConfig]
  for (const [i, resolver] of resolvers.entries()) {
    const config = await resolver()
    assert.equal(config.apiKey, SAVED_KEY)
    assert.equal(config.model, f.settings[AiModelSlotSchema.options[i]])
    assert.equal(config.baseUrl, f.settings.baseUrl)
  }
  const config = await getEffectiveGradingAiConfig()
  assert.equal(await fetchAiCompletion(config, [{ role: 'user', content: 'Test JSON' }], { maxTokens: 128, requestId: 'runtime' }), '{"ok":true}')
  assert.equal(f.calls[0].authorization, `Bearer ${SAVED_KEY}`)
})

test('subsequent saves preserve keys, keep exact database timestamps, replace keys, and reject stale updates', async (t) => {
  const f = await fixture(t)
  const first = await (await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }))).json()
  const cipher = f.row?.setting_value.encryptedApiKey
  const second = await f.handlers.PATCH(f.request({ ...f.settings, gradingModel: 'custom/model-v2', apiKey: '', expectedUpdatedAt: first.updatedAt }))
  assert.equal(second.status, 200)
  assert.equal(f.row?.setting_value.encryptedApiKey, cipher)
  assert.equal((await getEffectiveGradingAiConfig()).model, 'custom/model-v2')
  const stale = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: 'sk-stale', expectedUpdatedAt: first.updatedAt }))
  assert.equal(stale.status, 409)
  assert.equal((await getEffectiveGradingAiConfig()).apiKey, SAVED_KEY)
  const replaced = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: 'sk-replacement', expectedUpdatedAt: f.row?.updated_at }))
  assert.equal(replaced.status, 200)
  assert.equal((await getEffectiveGradingAiConfig()).apiKey, 'sk-replacement')
  f.raceNextWrite()
  const raced = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: 'sk-lost-race', expectedUpdatedAt: f.row?.updated_at }))
  assert.equal(raced.status, 409)
  assert.equal((await getEffectiveGradingAiConfig()).apiKey, 'sk-replacement')
  assert.equal((await f.handlers.PATCH(f.request({ ...f.settings }))).status, 409)
})

test('first-time create races do not overwrite another administrator configuration', async (t) => {
  const f = await fixture(t)
  f.raceNextWrite()
  const result = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }))
  assert.equal(result.status, 409)
  assert.equal(f.writes.length, 0)
})

test('unsaved credentials test every workload using real streaming JSON or image input without saving', async (t) => {
  const f = await fixture(t)
  for (const slot of AiModelSlotSchema.options) {
    const result = await f.handlers.TEST(f.request({ settings: f.settings, slot, apiKey: SAVED_KEY }, 'POST'))
    assert.equal(result.status, 200)
    const data = await result.json()
    assert.equal(data.model, f.settings[slot])
    const vision = slot.startsWith('vision')
    assert.equal(data.capability, vision ? 'image-json' : 'json-stream')
    const call = f.calls.at(-1)
    assert.equal(call?.authorization, `Bearer ${SAVED_KEY}`)
    assert.equal(call?.body.stream, !vision)
    assert.deepEqual(call?.body.response_format, { type: 'json_object' })
    assert.equal(JSON.stringify(call?.body.messages).includes('data:image/png;base64,'), vision)
  }
  assert.equal(f.writes.length, 0)
  assert.equal(f.audits.length, 0)
  assert.equal(f.row, null)
})

test('blank test inputs use saved keys, and explicit removal tests the environment fallback', async (t) => {
  const f = await fixture(t)
  await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }))
  process.env.AI_API_KEY = 'sk-environment'
  assert.equal((await f.handlers.TEST(f.request({ settings: f.settings, slot: 'gradingModel', apiKey: '' }, 'POST'))).status, 200)
  assert.equal(f.calls.at(-1)?.authorization, `Bearer ${SAVED_KEY}`)
  await f.handlers.TEST(f.request({ settings: f.settings, slot: 'gradingModel', clearApiKey: true }, 'POST'))
  assert.equal(f.calls.at(-1)?.authorization, 'Bearer sk-environment')
  const cleared = await f.handlers.PATCH(f.request({ ...f.settings, clearApiKey: true, expectedUpdatedAt: f.row?.updated_at }))
  assert.equal(cleared.status, 200)
  assert.equal((await cleared.json()).apiKeySource, 'environment')
  assert.equal(f.row?.setting_value.encryptedApiKey, undefined)
  assert.equal((await getEffectiveGradingAiConfig()).apiKey, 'sk-environment')
})

test('missing or malformed credentials and URLs fail before any model call or database write', async (t) => {
  const f = await fixture(t)
  for (const body of [
    { ...f.settings },
    { ...f.settings, apiKey: 'sk-with\nnewline' },
    { ...f.settings, apiKey: SAVED_KEY, clearApiKey: true },
    { ...f.settings, apiKey: SAVED_KEY, baseUrl: 'http://localhost.attacker.example/v1' },
    { ...f.settings, apiKey: SAVED_KEY, baseUrl: 'not a URL' },
    { ...f.settings, apiKey: SAVED_KEY, baseUrl: 'https://user:password@example.com/v1' },
    { ...f.settings, apiKey: SAVED_KEY, baseUrl: 'https://example.com/v1?key=secret' }
  ]) assert.equal((await f.handlers.PATCH(f.request(body))).status, 400)
  assert.equal(f.writes.length, 0)
  assert.equal(f.calls.length, 0)
  const normalized = await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY, baseUrl: `${f.settings.baseUrl}/chat/completions/` }))
  assert.equal(normalized.status, 200)
  assert.equal((await normalized.json()).settings.baseUrl, f.settings.baseUrl)
})

test('removing the only key requires disabling the admin configuration, while disabled configs use the environment', async (t) => {
  const f = await fixture(t)
  await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }))
  assert.equal((await f.handlers.PATCH(f.request({ ...f.settings, clearApiKey: true, expectedUpdatedAt: f.row?.updated_at }))).status, 400)
  assert.equal(resolveAiApiKey(f.row?.setting_value), SAVED_KEY)
  assert.equal((await f.handlers.PATCH(f.request({ ...f.settings, enabled: false, clearApiKey: true, expectedUpdatedAt: f.row?.updated_at }))).status, 200)
  process.env.AI_API_KEY = 'sk-environment'
  process.env.AI_MODEL = 'environment-model'
  assert.equal((await getEffectiveAiConfig({ slot: 'promptModel' })).model, 'environment-model')
  assert.equal((await getEffectiveAiConfig({ slot: 'promptModel' })).apiKey, 'sk-environment')
})

test('unreadable saved keys are reported and can be replaced without silently using another credential', async (t) => {
  const f = await fixture(t)
  f.row = { setting_value: { ...f.settings, encryptedApiKey: 123 }, updated_at: '2026-10-24T12:00:00.123456+00:00' }
  process.env.AI_API_KEY = 'sk-environment'
  const data = await (await f.handlers.GET(f.request(undefined, 'GET'))).json()
  assert.equal(data.apiKeyReadable, false)
  assert.equal(data.apiKeyConfigured, false)
  await assert.rejects(getEffectiveGradingAiConfig(), (error: unknown) => error instanceof AiProviderError && error.code === 'ai_api_key_unreadable')
  assert.equal((await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY, expectedUpdatedAt: data.updatedAt }))).status, 200)
  assert.equal((await getEffectiveGradingAiConfig()).apiKey, SAVED_KEY)
})

test('saved configuration read failures fail explicitly instead of switching providers', async (t) => {
  const f = await fixture(t)
  process.env.AI_API_KEY = 'sk-environment'
  f.failDatabase()
  await assert.rejects(getEffectiveGradingAiConfig(), (error: unknown) => error instanceof AiProviderError && error.code === 'ai_settings_unavailable')
})

test('anonymous, non-admin, and cross-origin requests cannot read or change credentials or test models', async (t) => {
  const f = await fixture(t)
  for (const status of [401, 403]) {
    f.setAuth(status)
    assert.equal((await f.handlers.GET(f.request(undefined, 'GET'))).status, status)
    assert.equal((await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }))).status, status)
    assert.equal((await f.handlers.TEST(f.request({ settings: f.settings, slot: 'gradingModel', apiKey: SAVED_KEY }, 'POST'))).status, status)
  }
  f.setAuth(200)
  const crossSite = { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
  assert.equal((await f.handlers.PATCH(f.request({ ...f.settings, apiKey: SAVED_KEY }, 'PATCH', crossSite))).status, 403)
  assert.equal((await f.handlers.TEST(f.request({ settings: f.settings, slot: 'gradingModel', apiKey: SAVED_KEY }, 'POST', crossSite))).status, 403)
  assert.equal(f.writes.length, 0)
  assert.equal(f.calls.length, 0)
})

test('connection errors distinguish invalid credentials, quotas, missing models, and invalid capabilities without leaking key values', async (t) => {
  const f = await fixture(t)
  for (const [status, message, code] of [
    [401, `Invalid API key: ${SAVED_KEY}`, 'ai_api_key_invalid'],
    [403, 'AllocationQuota.FreeTierOnly: quota exhausted', 'ai_quota_exhausted'],
    [404, 'model does not exist', 'ai_model_or_endpoint_invalid'],
    [429, 'too many requests', 'ai_rate_limited']
  ] as const) {
    f.providerFailure(status, message)
    const result = await (await f.handlers.TEST(f.request({ settings: f.settings, slot: 'gradingModel', apiKey: SAVED_KEY }, 'POST'))).json()
    assert.equal(result.code, code)
    assert.ok(!JSON.stringify(result).includes(SAVED_KEY))
  }
  f.providerFailure(200, '')
  f.providerResponse('{"color":"blue"}')
  const invalid = await f.handlers.TEST(f.request({ settings: f.settings, slot: 'visionModel', apiKey: SAVED_KEY }, 'POST'))
  assert.equal((await invalid.json()).code, 'ai_capability_test_failed')
})
