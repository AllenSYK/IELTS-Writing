import { z } from 'zod'

export const AI_MODEL_SETTINGS_ID = 'ai_models'

const ModelNameSchema = z.string().trim().min(1, '模型名称不能为空').max(160)

export function normalizeAiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
}

export const AiApiKeyInputSchema = z.string().trim().max(4096, 'API 密钥过长').refine(
  (value) => /^[!-~]*$/.test(value),
  'API 密钥不能包含空白或非 ASCII 字符'
)

export const AiCredentialUpdateSchema = z.object({
  // Empty input preserves the saved key. Clearing is always explicit.
  apiKey: AiApiKeyInputSchema.optional(),
  clearApiKey: z.boolean().optional()
}).refine((value) => !(value.apiKey && value.clearApiKey), {
  message: '不能同时更换和移除 API 密钥',
  path: ['apiKey']
})

export const ParseableTimestampSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: '更新时间格式无效'
  })

export function normalizeAiModelSettingsTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp).toISOString()
}

export const AiModelSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.string().trim().min(1, '服务商不能为空').max(80),
  baseUrl: z.string().trim().url('请输入完整的接口地址').max(500).refine((value) => {
    try {
      const url = new URL(value)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
        !url.username && !url.password && !url.search && !url.hash
    } catch {
      return false
    }
  }, '接口地址必须使用 HTTPS（本机开发除外），且不能包含账号、查询参数或锚点').transform(normalizeAiBaseUrl),
  promptModel: ModelNameSchema,
  gradingModel: ModelNameSchema,
  studyPlanModel: ModelNameSchema,
  visionModel: ModelNameSchema,
  visionFallbackModel: ModelNameSchema
})

export type AiModelSettings = z.infer<typeof AiModelSettingsSchema>

export const AiModelSlotSchema = z.enum([
  'promptModel',
  'gradingModel',
  'studyPlanModel',
  'visionModel',
  'visionFallbackModel'
])

export type AiModelSlot = z.infer<typeof AiModelSlotSchema>

export const DEFAULT_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export const DEFAULT_AI_MODEL_SETTINGS: AiModelSettings = {
  enabled: true,
  provider: 'qwen',
  baseUrl: DEFAULT_QWEN_BASE_URL,
  promptModel: 'qwen-plus',
  gradingModel: 'qwen3.5-plus',
  studyPlanModel: 'qwen3.5-plus',
  visionModel: 'qwen3.5-plus',
  visionFallbackModel: 'qwen3.5-flash'
}
