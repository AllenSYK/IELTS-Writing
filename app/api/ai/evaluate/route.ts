import {
  AiConfigurationError,
  AiProviderError,
  apiStatusForAiError,
  evaluateEssayWithAi
} from '@/lib/ai'
import { recordAiUsage } from '@/lib/ai-usage'
import { apiError, json } from '@/lib/http'
import { EssayEvaluationInputSchema, type EssayEvaluationInput } from '@/lib/ielts-evaluation'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export const maxDuration = 300

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json(
      {
        success: false,
        code: check.code === 'NOT_AUTHENTICATED' ? 'NOT_AUTHENTICATED' : 'LICENSE_REQUIRED',
        message: check.code === 'NOT_AUTHENTICATED' ? '请先登录后再使用批改功能' : '请先激活账号后再使用批改功能'
      },
      { status: check.status === 401 ? 401 : 403 }
    )
  }

  let body: EssayEvaluationInput
  try {
    body = EssayEvaluationInputSchema.parse(await request.json())
  } catch (error) {
    return apiError(error, 'AI evaluation failed.')
  }

  try {
    const evaluation = await evaluateEssayWithAi(body)
    await recordAiUsage({
      check,
      action: 'evaluate',
      inputCharacters: `${body.prompt || ''}\n${body.essay}`.length,
      result: evaluation
    })
    return json({
      ...evaluation,
      protected: true
    })
  } catch (error) {
    await recordAiUsage({
      check,
      action: 'evaluate',
      inputCharacters: `${body.prompt || ''}\n${body.essay}`.length,
      result: null,
      error
    })
    if (error instanceof AiConfigurationError) {
      return json(
        {
          error: 'ai_not_configured',
          missing: error.missing
        },
        { status: 503 }
      )
    }
    if (error instanceof AiProviderError) {
      return json(
        {
          error: error.code,
          message: error.message,
          providerStatus: error.status
        },
        { status: apiStatusForAiError(error) }
      )
    }
    return apiError(error, 'AI evaluation failed.')
  }
}
