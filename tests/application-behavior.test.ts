import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { AiProviderError, apiStatusForAiError } from '../lib/ai'
import { resolveAuthRedirect } from '../lib/auth/route-access'
import { isExpiredAt } from '../lib/ielts-scoring'
import { countWords, normalizeEvaluation } from '../lib/writing-records'
import {
  getEffectiveBindingStatus,
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '../lib/web-license/admin-license-data'
import { readStorageValue } from '../lib/user-storage'
import { accountDisplayName, maskPhone, normalizeMainlandPhone } from '../lib/phone-auth'

test('Word count handles punctuation and contractions', () => {
  assert.equal(countWords("It's a well-developed, high-scoring essay."), 5)
})

test('Expiry date parser rejects past licenses', () => {
  assert.equal(isExpiredAt('2026-01-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), true)
  assert.equal(isExpiredAt('2026-12-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), false)
})

test('legacy browser storage values migrate without deleting the original value', () => {
  const values = new Map<string, string>([['aerowrite-writing-records-v1:user:user-a', '[{"id":"record-1"}]']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  } as Storage

  const currentKey = 'ielts-writing-writing-records-v1:user:user-a'
  assert.equal(readStorageValue(storage, currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem(currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem('aerowrite-writing-records-v1:user:user-a'), '[{"id":"record-1"}]')
})

test('grading and question routes expose only the authenticated web flow', async () => {
  const [evaluationRoute, promptRoute] = await Promise.all([
    readFile(new URL('../app/api/ai/evaluate/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/generate-prompt/route.ts', import.meta.url), 'utf8')
  ])

  for (const source of [evaluationRoute, promptRoute]) {
    assert.match(source, /requireActiveWebLicense/)
    assert.doesNotMatch(source, /x-device-id|desktop|licenseToken|LICENSE_SERVER_URL/i)
  }
})

test('provider authentication failures stay server errors while rate limits remain retryable', () => {
  assert.equal(apiStatusForAiError(new AiProviderError('bad key', 401, 'ai_api_key_invalid')), 502)
  assert.equal(apiStatusForAiError(new AiProviderError('busy', 429, 'ai_rate_limited')), 429)
  assert.equal(apiStatusForAiError(new AiProviderError('slow', undefined, 'ai_request_timeout')), 504)
})

test('settings and support pages use browser services only', async () => {
  const [settingsPage, supportPage] = await Promise.all([
    readFile(new URL('../app/settings/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/support/page.tsx', import.meta.url), 'utf8')
  ])

  for (const source of [settingsPage, supportPage]) {
    assert.doesNotMatch(source, /desktopApp|desktopLicense|desktopUpdater|nativeBridge/i)
  }
  assert.match(settingsPage, /\/api\/license\/status/)
})

test('Stored legacy evaluations normalize into the new result shape', () => {
  const normalized = normalizeEvaluation({
    bandEstimate: '6.5',
    criteria: { taskAchievement: { score: '6.0', feedback: 'overview is limited' } },
    overallFeedback: '旧记录评价。',
    sentenceErrors: [],
    suggestions: ['写清 overview'],
    feedback: ['旧记录评价。']
  })
  assert.equal(normalized?.overallBand, '6.5')
  assert.equal(normalized?.summary, '旧记录评价。')
  assert.deepEqual(normalized?.criteria?.taskAchievement?.evidence, undefined)
  assert.equal(normalized?.criteria?.taskAchievement?.whyNotHigher, undefined)
  assert.deepEqual(normalized?.nextSteps, [])
  assert.deepEqual(normalized?.suggestions, ['写清 overview'])
})

test('Admin routes use the dedicated admin login before license routing', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: false }), '/admin/login')
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: true, role: 'user', licenseActive: false }),
    '/admin/login?reason=not_admin'
  )
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: true, role: 'user', licenseActive: true }),
    '/admin/login?reason=not_admin'
  )
})

test('Admin login never sends ordinary users into the user activation flow', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: false }), null)
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: true, role: 'user', licenseActive: false }),
    null
  )
  assert.equal(resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
})

test('Admin and ordinary login redirects remain separate', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
  assert.equal(resolveAuthRedirect({ pathname: '/dashboard', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
  assert.equal(
    resolveAuthRedirect({ pathname: '/login', isAuthenticated: true, role: 'user', licenseActive: false }),
    '/activate'
  )
  assert.equal(
    resolveAuthRedirect({ pathname: '/login', isAuthenticated: true, role: 'user', licenseActive: true }),
    '/dashboard'
  )
})

test('User Home navigation targets the account center without a client redirect page', async () => {
  const [nextConfig, sidebar, commandPalette, appShell] = await Promise.all([
    readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/interaction-system.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
  ])

  assert.match(nextConfig, /source:\s*['"]\/['"][\s\S]*?destination:\s*['"]\/dashboard['"][\s\S]*?permanent:\s*false/)
  assert.match(sidebar, /id:\s*['"]home['"],\s*href:\s*['"]\/dashboard['"]/)
  assert.match(commandPalette, /id:\s*['"]home['"][\s\S]*?href:\s*['"]\/dashboard['"]/)
  assert.doesNotMatch(appShell, /写作概览/)
})

test('shared app header keeps creation access and removes the top-right avatar', async () => {
  const [header, shell, css] = await Promise.all([
    readFile(new URL('../components/layout/AppHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(header, /href="\/practice"[\s\S]*?开始创作/)
  assert.match(header, /MaterialIcon name="share"/)
  assert.match(header, /MaterialIcon name="settings"/)
  assert.doesNotMatch(header, /ProfileAvatar|useUserProfile/)
  assert.match(shell, /<AppHeader title=\{meta\.title\} subtitle=\{meta\.subtitle\}/)
  assert.match(css, /\.app-header\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?z-index:\s*40;/)
})

test('auth forms require explicit agreement consent and record versions server-side', async () => {
  const [loginPage, registerPage, loginRoute, registerRoute, migration] = await Promise.all([
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260619232239_account_records_and_agreements.sql', import.meta.url), 'utf8')
  ])

  for (const source of [loginPage, registerPage]) {
    assert.match(source, /AgreementConsent/)
    assert.match(source, /agreementsAccepted/)
    assert.match(source, /disabled=\{[^}]*!agreementsAccepted/)
  }
  for (const source of [loginRoute, registerRoute]) {
    assert.match(source, /agreementsAccepted:\s*z\.literal\(true\)/)
    assert.match(source, /recordUserAgreements/)
  }
  assert.match(migration, /create table if not exists public\.user_agreements/i)
  assert.match(migration, /unique \(user_id, agreement_type, agreement_version\)/i)
})

test('mainland phone numbers normalize to E.164 and account labels never render blank', () => {
  assert.equal(normalizeMainlandPhone('138 1234-5678'), '+8613812345678')
  assert.equal(normalizeMainlandPhone('+86 13812345678'), '+8613812345678')
  assert.equal(maskPhone('+8613812345678'), '+86138****5678')
  assert.equal(accountDisplayName({ id: '12345678-abcd', email: null, phone: '+8613812345678' }), '+86138****5678')
  assert.equal(accountDisplayName({ id: '12345678-abcd', email: null, phone: null }), '用户 12345678')
  assert.throws(() => normalizeMainlandPhone('12345'))
})

test('phone OTP routes preserve email auth and never auto-create users from the login entry', async () => {
  const [sendRoute, verifyRoute, loginPage, registerPage] = await Promise.all([
    readFile(new URL('../app/api/auth/phone/send/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/phone/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8')
  ])

  assert.match(sendRoute, /shouldCreateUser:\s*body\.mode === 'register'/)
  assert.match(sendRoute, /body\.mode === 'login' && !existingProfile/)
  assert.match(verifyRoute, /verifyOtp\(\{[\s\S]*type:\s*'sms'/)
  assert.match(verifyRoute, /recordUserAgreements/)
  assert.match(sendRoute, /console\.error\('\[phone-otp-send\]', \{ error: error instanceof Error \? error\.name/)
  assert.match(verifyRoute, /console\.error\('\[phone-otp-verify\]', \{ error: error instanceof Error \? error\.name/)
  assert.match(loginPage, /邮箱登录/)
  assert.match(loginPage, /手机号登录/)
  assert.match(registerPage, /邮箱注册/)
  assert.match(registerPage, /手机号注册/)
})

test('agreement controls use one centered dialog and shared legal content without navigation', async () => {
  const [consent, terms, privacy] = await Promise.all([
    readFile(new URL('../components/auth/AgreementConsent.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/terms/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/privacy/page.tsx', import.meta.url), 'utf8')
  ])

  assert.match(consent, /CenteredDialog/)
  assert.match(consent, /setOpenDocument\('terms'\)/)
  assert.match(consent, /setOpenDocument\('privacy'\)/)
  assert.doesNotMatch(consent, /next\/link|href="\/terms"|href="\/privacy"/)
  assert.match(terms, /TermsSections/)
  assert.match(privacy, /PrivacySections/)
})

test('practice settings share one responsive grid and include the authenticated custom-task upload flow', async () => {
  const [selector, uploadPanel, parseRoute, writePage, migration, css] = await Promise.all([
    readFile(new URL('../components/practice/WritingModeSelector.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/practice/UploadedTaskPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/parse-uploaded-writing-task/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/write/[mode]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260620131332_custom_task_uploads_and_phone_profiles.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(selector, /function PracticeSettingRow/)
  assert.match(selector, /practice-setting-row/)
  assert.match(selector, /<UploadedTaskPanel/)
  assert.match(css, /\.practice-setting-row\s*\{[\s\S]*?grid-template-columns:/)
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.practice-setting-row,[\s\S]*?grid-template-columns:\s*1fr/)
  assert.match(uploadPanel, /image\/png,image\/jpeg,image\/webp/)
  assert.match(uploadPanel, /questionText/)
  assert.match(uploadPanel, /确认题目并开始练习/)
  assert.match(parseRoute, /requireActiveWebLicense/)
  assert.match(parseRoute, /validateImageUpload/)
  assert.match(parseRoute, /createSignedUrl/)
  assert.match(writePage, /customTask/)
  assert.match(writePage, /normalizeGeneratedQuestion/)
  assert.match(migration, /'writing-task-uploads',[\s\S]*?false,[\s\S]*?10485760/)
  assert.match(migration, /writing-task-uploads/)
  assert.match(migration, /storage\.foldername\(name\)/)
})

test('writing heatmap positions the latest date at the right edge before paint', async () => {
  const [heatmap, css] = await Promise.all([
    readFile(new URL('../components/dashboard/WritingActivityHeatmap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])
  assert.match(heatmap, /useLayoutEffect/)
  assert.match(heatmap, /scrollWidth - container\.clientWidth/)
  assert.match(heatmap, /\[latestDate, range, weeks\.length\]/)
  assert.match(css, /\.activity-chart\s*\{[\s\S]*?margin:\s*0 0 0 auto;/)
  assert.match(css, /\.activity-scroll::\-webkit-scrollbar[\s\S]*?display:\s*none;/)
})

test('result annotations open in one centered dialog without scrollIntoView', async () => {
  const [resultPage, annotatedEssay, dialog, layout] = await Promise.all([
    readFile(new URL('../app/result/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/AnnotatedEssay.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/AnnotationDialog.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/EvaluationLayout.tsx', import.meta.url), 'utf8')
  ])

  assert.match(resultPage, /<AnnotationDialog/)
  assert.doesNotMatch(resultPage, /AnnotationInspector|inspector=/)
  assert.doesNotMatch(annotatedEssay, /scrollIntoView/)
  assert.match(dialog, /CenteredDialog/)
  assert.match(dialog, /onClose/)
  assert.doesNotMatch(layout, /evaluation-inspector-column/)
})

test('grading pipeline parallelizes annotation blocks and leaves essays on demand', async () => {
  const [pipeline, provider, derivativeRoute] = await Promise.all([
    readFile(new URL('../lib/ielts-evaluation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ai-provider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/essay-derivative/route.ts', import.meta.url), 'utf8')
  ])

  assert.match(pipeline, /Promise\.allSettled/)
  assert.match(pipeline, /requestId:\s*`\$\{requestId\}-block-\$\{block\.index\}`/)
  assert.match(pipeline, /blockId:\s*block\.id/)
  assert.doesNotMatch(pipeline, /requestRewrite\(config/)
  assert.match(provider, /enable_thinking:\s*false/)
  assert.match(provider, /modelEnv:\s*'QWEN_GRADING_MODEL'/)
  assert.match(derivativeRoute, /kind:\s*z\.enum\(\['revised', 'model'\]\)/)
})

test('Admin license status distinguishes unused, partial, exhausted, and expired', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 0, max_activations: 3 }, now), 'unused')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 1, max_activations: 3 }, now), 'partial')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 3, max_activations: 3 }, now), 'exhausted')
  assert.equal(getEffectiveLicenseStatus({
    status: 'active',
    activation_count: 0,
    max_activations: 3,
    expires_at: '2026-06-17T00:00:00.000Z'
  }, now), 'expired')
})

test('Admin binding status distinguishes valid, expiring, expired, revoked, and unbound', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'active')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-25T00:00:00.000Z' }, now), 'expiring')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-17T00:00:00.000Z' }, now), 'expired')
  assert.equal(getEffectiveBindingStatus({ status: 'revoked', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'revoked')
  assert.equal(getEffectiveBindingStatus({
    status: 'active',
    expires_at: '2026-08-18T00:00:00.000Z',
    license_status: 'disabled'
  }, now), 'revoked')
  assert.equal(getEffectiveBindingStatus({
    status: 'revoked',
    expires_at: '2026-08-18T00:00:00.000Z',
    revoked_reason: UNBOUND_BINDING_REASON
  }, now), 'unbound')
})
