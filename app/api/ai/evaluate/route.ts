import { z } from 'zod'
import { AiConfigurationError, AiProviderError, evaluateEssayWithAi } from '@/lib/ai'
import { apiError, json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense, type WebLicenseCheck } from '@/lib/web-license/auth'

const EvaluateSchema = z.object({
  essay: z.string().min(50).max(12000),
  taskType: z.enum(['task1', 'task2']).default('task2'),
  prompt: z.string().max(4000).optional(),
  questionType: z.string().max(80).optional(),
  phase: z.enum(['quick', 'detailed', 'full']).default('full')
})

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

  let body: z.infer<typeof EvaluateSchema>
  try {
    body = EvaluateSchema.parse(await request.json())
  } catch (error) {
    return apiError(error, 'AI evaluation failed.')
  }

  try {
    const evaluation = await evaluateEssayWithAi(body)
    await recordWebUsage(check, 'evaluate', body, evaluation)
    return json({
      ...evaluation,
      protected: true
    })
  } catch (error) {
    await recordWebUsage(check, 'evaluate', body, null, error)
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
      const statusCode = error.status || (error.code === 'ai_request_timeout' ? 504 : 502)
      return json(
        {
          error: error.code,
          message: error.message,
          providerStatus: error.status
        },
        { status: statusCode }
      )
    }
    return apiError(error, 'AI evaluation failed.')
  }
}

async function recordWebUsage(
  check: Extract<WebLicenseCheck, { ok: true }>,
  action: string,
  body: z.infer<typeof EvaluateSchema>,
  result: unknown,
  error?: unknown
) {
  const service = createSupabaseServiceRoleClient()
  const nowIso = new Date().toISOString()
  const inputTokens = Math.ceil(`${body.prompt || ''}\n${body.essay}`.length / 4)
  const outputTokens = result ? Math.ceil(JSON.stringify(result).length / 4) : null
  const errorMessage = error instanceof Error ? error.message.slice(0, 500) : null

  await Promise.all([
    service
      .from('license_activations')
      .update({ last_used_at: nowIso })
      .eq('id', check.activation.id),
    service
      .from('usage_records')
      .insert({
        user_id: check.user.id,
        license_id: check.activation.license_id,
        action,
        model: process.env.AI_MODEL || null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        success: !error,
        error_message: errorMessage
      })
  ])
}
