import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { json } from '@/lib/http'
import {
  AI_MODEL_SETTINGS_ID, AiApiKeyInputSchema, AiModelSettingsSchema,
  AiModelSlotSchema, ParseableTimestampSchema
} from '@/lib/ai-model-settings'
import {
  aiApiKeyStatus, AiModelSecretError, encryptAiApiKey, resolveAiApiKey, storedAiApiKey
} from '@/lib/ai-model-secrets'
import {
  AiConfigurationError, AiProviderError, apiStatusForAiError, createAiRequestId,
  fetchAiCompletion, fetchAiNonStreamingCompletion, getAiModelEnvironmentDefaults, parseAiJsonObject
} from '@/lib/ai-provider'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

const credentialFields = { apiKey: AiApiKeyInputSchema.optional(), clearApiKey: z.boolean().optional() }
const checkCredentials = (value: { apiKey?: string; clearApiKey?: boolean }, ctx: z.RefinementCtx) => {
  if (value.apiKey && value.clearApiKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '不能同时更换和移除 API 密钥', path: ['apiKey'] })
  }
}
const UpdateSchema = AiModelSettingsSchema.extend({
  // Preserve PostgreSQL's microseconds: this value is also the optimistic lock.
  expectedUpdatedAt: ParseableTimestampSchema.optional(),
  ...credentialFields
}).superRefine(checkCredentials)
const TestSchema = z.object({ settings: AiModelSettingsSchema, slot: AiModelSlotSchema, ...credentialFields }).superRefine(checkCredentials)

type StoredSettings = { setting_value: Record<string, unknown>; updated_at: string }
type Dependencies = {
  authorize: (request: Request) => Promise<{ user: { id: string }; service: SupabaseClient }>
  errorResponse: (error: unknown, fallback: string) => Response
}

async function readSettings(service: SupabaseClient): Promise<StoredSettings | null> {
  const { data, error } = await service.from('admin_settings')
    .select('setting_value, updated_at').eq('id', AI_MODEL_SETTINGS_ID).maybeSingle()
  if (error) throw error
  return data
}

function publicSettings(data: StoredSettings | null) {
  const parsed = AiModelSettingsSchema.safeParse(data?.setting_value)
  return {
    success: true as const,
    // Explicitly strip server-only fields from every response and SWR cache.
    settings: parsed.success ? parsed.data : getAiModelEnvironmentDefaults(),
    updatedAt: data?.updated_at || null,
    source: parsed.success ? 'admin' as const : 'environment' as const,
    ...aiApiKeyStatus(data?.setting_value)
  }
}

function conflict(requestId: string) {
  return json({ success: false, code: 'CONFLICT', message: '模型配置已被其他管理员更新，请刷新后重试。', requestId }, { status: 409 })
}

// A 64×64 red PNG. Vision tests send a real image and check its colour.
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC'

export function createAdminModelsHandlers(dependencies: Dependencies) {
  function handleError(error: unknown, fallback: string, requestId: string) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return json({
        success: false, code: 'INVALID_INPUT',
        message: error instanceof z.ZodError ? error.issues[0]?.message || '模型配置参数无效' : '请求内容不是有效的 JSON', requestId
      }, { status: 400 })
    }
    if (error instanceof AiModelSecretError) {
      return json({ success: false, code: 'AI_KEY_UNREADABLE', message: error.message, requestId }, { status: 400 })
    }
    if (error instanceof AiConfigurationError) {
      return json({ success: false, code: 'AI_KEY_MISSING', message: '请在管理端输入 API 密钥，或配置服务端 AI_API_KEY。', requestId }, { status: 400 })
    }
    if (error instanceof AiProviderError) {
      return json({ success: false, code: error.code, message: error.message, requestId }, { status: apiStatusForAiError(error) })
    }
    return dependencies.errorResponse(error, fallback)
  }

  return {
    async GET(request: Request) {
      const requestId = request.headers.get('X-Request-Id') || createAiRequestId('gen')
      try {
        const { service } = await dependencies.authorize(request)
        return json({ ...publicSettings(await readSettings(service)), requestId })
      } catch (error) {
        return handleError(error, '无法加载模型配置', requestId)
      }
    },

    async PATCH(request: Request) {
      const requestId = request.headers.get('X-Request-Id') || createAiRequestId('gen')
      try {
        const { user, service } = await dependencies.authorize(request)
        const { expectedUpdatedAt, apiKey, clearApiKey, ...settings } = UpdateSchema.parse(await request.json())
        const current = await readSettings(service)
        if (current ? expectedUpdatedAt !== current.updated_at : Boolean(expectedUpdatedAt)) return conflict(requestId)

        const encrypted = apiKey ? encryptAiApiKey(apiKey) : clearApiKey ? null : storedAiApiKey(current?.setting_value)
        const value = { ...settings, ...(encrypted ? { encryptedApiKey: encrypted } : {}) }
        if (settings.enabled && !resolveAiApiKey(value)) throw new AiConfigurationError(['AI_API_KEY'])

        const row = { setting_value: value, updated_at: new Date().toISOString() }
        const result = current
          ? await service.from('admin_settings').update(row)
              .eq('id', AI_MODEL_SETTINGS_ID).eq('updated_at', current.updated_at)
              .select('setting_value, updated_at').maybeSingle()
          : await service.from('admin_settings').upsert({ ...row, id: AI_MODEL_SETTINGS_ID, setting_key: AI_MODEL_SETTINGS_ID }, {
              onConflict: 'id', ignoreDuplicates: true
            }).select('setting_value, updated_at').maybeSingle()
        if (result.error) throw result.error
        if (!result.data) return conflict(requestId)

        const auditInfo = extractAuditInfo(request)
        await logAdminAudit(service, {
          adminUserId: user.id, action: 'update_ai_models', resourceType: 'settings', resourceId: AI_MODEL_SETTINGS_ID,
          requestId, result: 'success',
          changedFields: { fields: [...Object.keys(settings), ...(apiKey || clearApiKey ? ['apiKey'] : [])], enabled: settings.enabled, provider: settings.provider },
          ipHash: auditInfo.ip, userAgentSummary: auditInfo.userAgent
        })
        return json({ ...publicSettings(result.data), requestId })
      } catch (error) {
        return handleError(error, '无法保存模型配置', requestId)
      }
    },

    async TEST(request: Request) {
      const requestId = request.headers.get('X-Request-Id') || createAiRequestId('gen')
      try {
        const { service } = await dependencies.authorize(request)
        const { settings, slot, apiKey, clearApiKey } = TestSchema.parse(await request.json())
        const key = resolveAiApiKey((await readSettings(service))?.setting_value, { apiKey, clearApiKey })
        if (!key) throw new AiConfigurationError(['AI_API_KEY'])
        const model = settings[slot]
        const config = { apiKey: key, provider: settings.provider, baseUrl: settings.baseUrl, model }
        const vision = slot === 'visionModel' || slot === 'visionFallbackModel'
        const startedAt = Date.now()
        const completion = vision ? fetchAiNonStreamingCompletion : fetchAiCompletion
        const response = await completion(config, [{
          role: 'user',
          content: vision ? [
            { type: 'text', text: 'Identify the dominant colour in the image. Return only a JSON object with the English colour name in the "color" field.' },
            { type: 'image_url', image_url: { url: TEST_IMAGE } }
          ] : 'Connection test. Return only this JSON object: {"ok":true}'
        }], { maxTokens: 128, requestId, stage: 'admin-ai-connection-test', timeoutMs: 30_000, responseFormat: { type: 'json_object' } })
        const result = parseAiJsonObject(response)
        const valid = vision
          ? z.object({ color: z.string().transform((v) => v.trim().toLowerCase()).pipe(z.literal('red')) }).safeParse(result).success
          : z.object({ ok: z.literal(true) }).safeParse(result).success
        if (!valid) throw new AiProviderError('模型已响应，但未通过 JSON 输出或图片识别测试，请检查模型能力。', undefined, 'ai_capability_test_failed')
        return json({ success: true, latencyMs: Date.now() - startedAt, model, slot, capability: vision ? 'image-json' : 'json-stream', requestId })
      } catch (error) {
        return handleError(error, '模型连接测试失败', requestId)
      }
    }
  }
}
