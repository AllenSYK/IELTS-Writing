import { z } from 'zod'
import { json } from '@/lib/http'
import { requireAdminService, adminApiError } from '@/lib/web-license/admin-api'
import { AiModelSettingsSchema } from '@/lib/ai-model-settings'
import {
  AiConfigurationError,
  AiProviderError,
  apiStatusForAiError,
  createAiRequestId,
  fetchAiNonStreamingCompletion,
  getAiConfig
} from '@/lib/ai-provider'

export async function POST(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || createAiRequestId('gen')

  try {
    await requireAdminService(request)
    const settings = AiModelSettingsSchema.parse(await request.json())
    const environmentConfig = getAiConfig()
    const startedAt = Date.now()

    await fetchAiNonStreamingCompletion({
      ...environmentConfig,
      provider: settings.provider,
      baseUrl: settings.baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, ''),
      model: settings.promptModel
    }, [
      { role: 'system', content: 'Reply with the single word OK.' },
      { role: 'user', content: 'Connection test.' }
    ], {
      maxTokens: 8,
      requestId,
      stage: 'admin-ai-connection-test'
    })

    return json({
      success: true,
      latencyMs: Date.now() - startedAt,
      model: settings.promptModel,
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
    if (error instanceof AiConfigurationError) {
      return json({
        success: false,
        code: 'AI_KEY_MISSING',
        message: '服务端尚未配置 AI_API_KEY，暂时无法测试连接。',
        requestId
      }, { status: 400 })
    }
    if (error instanceof AiProviderError) {
      return json({
        success: false,
        code: error.code,
        message: error.message,
        requestId
      }, { status: apiStatusForAiError(error) })
    }
    return adminApiError(error, '模型连接测试失败')
  }
}
