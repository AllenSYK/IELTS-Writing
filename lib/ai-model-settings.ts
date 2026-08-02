import { z } from 'zod'

export const AI_MODEL_SETTINGS_ID = 'ai_models'

const ModelNameSchema = z.string().trim().min(1, '模型名称不能为空').max(160)

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
  baseUrl: z.string().trim().url('请输入完整的接口地址').max(500).refine(
    (value) => value.startsWith('https://') || value.startsWith('http://localhost') || value.startsWith('http://127.0.0.1'),
    '接口地址必须使用 HTTPS'
  ),
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
