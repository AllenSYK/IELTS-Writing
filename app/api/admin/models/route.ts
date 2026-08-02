import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'
import {
  AI_MODEL_SETTINGS_ID,
  AiModelSettingsSchema,
  type AiModelSettings
} from '@/lib/ai-model-settings'
import { getAiModelEnvironmentDefaults } from '@/lib/ai-provider'

const ParseableTimestampSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: '更新时间格式无效'
  })

const UpdateAiModelSettingsSchema = AiModelSettingsSchema.extend({
  expectedUpdatedAt: ParseableTimestampSchema.optional()
})

function toIsoTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp).toISOString()
}

type StoredModelSettings = {
  setting_value: Record<string, unknown>
  updated_at: string
}

export async function GET(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined

  try {
    const { service } = await requireAdminService(request)
    const { data, error } = await service
      .from('admin_settings')
      .select('setting_value, updated_at')
      .eq('id', AI_MODEL_SETTINGS_ID)
      .maybeSingle()

    if (error) throw error
    const stored = AiModelSettingsSchema.safeParse(data?.setting_value)
    const environmentDefaults = getAiModelEnvironmentDefaults()

    return json({
      success: true,
      settings: stored.success ? stored.data : environmentDefaults,
      updatedAt: toIsoTimestamp(data?.updated_at),
      source: stored.success ? 'admin' : 'environment',
      apiKeyConfigured: Boolean(process.env.AI_API_KEY?.trim()),
      requestId
    })
  } catch (error) {
    return adminApiError(error, '无法加载模型配置')
  }
}

export async function PATCH(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)

  try {
    const { user, service } = await requireAdminService(request)
    const body = UpdateAiModelSettingsSchema.parse(await request.json())
    const { expectedUpdatedAt, ...settings } = body
    const normalizedExpectedUpdatedAt = expectedUpdatedAt
      ? new Date(expectedUpdatedAt).toISOString()
      : undefined
    let data: StoredModelSettings | null = null

    if (normalizedExpectedUpdatedAt) {
      const result = await service
        .from('admin_settings')
        .update({
          setting_value: settings,
          updated_at: new Date().toISOString()
        })
        .eq('id', AI_MODEL_SETTINGS_ID)
        .eq('updated_at', normalizedExpectedUpdatedAt)
        .select('setting_value, updated_at')
        .maybeSingle()

      if (result.error) throw result.error
      data = result.data
    } else {
      const result = await service
        .from('admin_settings')
        .upsert({
          id: AI_MODEL_SETTINGS_ID,
          setting_key: AI_MODEL_SETTINGS_ID,
          setting_value: settings,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        })
        .select('setting_value, updated_at')
        .single()

      if (result.error) throw result.error
      data = result.data
    }

    if (!data) {
      return json({
        success: false,
        code: 'CONFLICT',
        message: '模型配置已被其他管理员更新，请刷新后重试。',
        requestId
      }, { status: 409 })
    }

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_ai_models',
      resourceType: 'settings',
      resourceId: AI_MODEL_SETTINGS_ID,
      requestId,
      result: 'success',
      changedFields: {
        fields: Object.keys(settings),
        enabled: settings.enabled,
        provider: settings.provider
      },
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })

    return json({
      success: true,
      settings: data.setting_value as AiModelSettings,
      updatedAt: toIsoTimestamp(data.updated_at),
      source: 'admin',
      apiKeyConfigured: Boolean(process.env.AI_API_KEY?.trim()),
      requestId
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({
        success: false,
        code: 'INVALID_INPUT',
        message: error.issues[0]?.message || '模型配置参数无效',
        requestId
      }, { status: 400 })
    }
    return adminApiError(error, '无法保存模型配置')
  }
}
