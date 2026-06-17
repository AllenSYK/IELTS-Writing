import { z } from 'zod'
import { AiConfigurationError, AiProviderError, generateWritingPromptWithAi } from '@/lib/ai'
import { apiError, json } from '@/lib/http'
import { verifyLicenseToken } from '@/lib/license/token'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense, type WebLicenseCheck } from '@/lib/web-license/auth'
import {
  DefaultPromptSelection,
  normalizeTask1ChartType,
  normalizeTask1Subtype,
  normalizeTask2EssayType,
  normalizeTask2Topic
} from '@/lib/writing-options'

const ExcludePromptSchema = z.object({
  taskType: z.string().optional(),
  chartType: z.string().optional(),
  essayType: z.string().optional(),
  topic: z.string().optional(),
  questionHash: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  questionText: z.string().optional()
})

const GeneratePromptSchema = z.object({
  taskType: z.enum(['task1', 'task2']),
  selection: z.object({
    task1ChartType: z.string().optional(),
    task1Subtype: z.string().optional(),
    task2EssayType: z.string().optional(),
    task2Topic: z.string().optional()
  }).optional().default({}),
  excludePromptSummaries: z.array(ExcludePromptSchema).optional().default([])
})

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const deviceId = request.headers.get('x-device-id') || ''

  if (token && deviceId) {
    return handleDesktopPromptGeneration(request, token)
  }

  return handleWebPromptGeneration(request)
}

async function handleDesktopPromptGeneration(request: Request, token: string) {
  try {
    const payload = await verifyLicenseToken(token)
    if (payload.status !== 'active') return json({ error: 'license_inactive' }, { status: 403 })

    const body = GeneratePromptSchema.parse(await request.json())
    const selection = {
      ...DefaultPromptSelection,
      task1ChartType: normalizeTask1ChartType(body.selection.task1ChartType),
      task1Subtype: normalizeTask1Subtype(body.selection.task1Subtype),
      task2EssayType: normalizeTask2EssayType(body.selection.task2EssayType),
      task2Topic: normalizeTask2Topic(body.selection.task2Topic)
    }
    const question = await generateWritingPromptWithAi({
      taskType: body.taskType,
      selection,
      excludePromptSummaries: body.excludePromptSummaries
    })

    return json({ ok: true, question })
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return json({ error: 'ai_not_configured', missing: error.missing }, { status: 503 })
    }
    if (error instanceof AiProviderError) {
      return json({ error: error.code, message: error.message, providerStatus: error.status }, { status: 502 })
    }
    return apiError(error, 'AI prompt generation failed.')
  }
}

async function handleWebPromptGeneration(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json(
      {
        success: false,
        code: check.code === 'NOT_AUTHENTICATED' ? 'NOT_AUTHENTICATED' : 'LICENSE_REQUIRED',
        message: check.code === 'NOT_AUTHENTICATED' ? '请先登录后再生成题目' : '请先激活账号后再生成题目'
      },
      { status: check.status === 401 ? 401 : 403 }
    )
  }

  let body: z.infer<typeof GeneratePromptSchema>
  try {
    body = GeneratePromptSchema.parse(await request.json())
  } catch (error) {
    return apiError(error, 'AI prompt generation failed.')
  }

  try {
    const selection = {
      ...DefaultPromptSelection,
      task1ChartType: normalizeTask1ChartType(body.selection.task1ChartType),
      task1Subtype: normalizeTask1Subtype(body.selection.task1Subtype),
      task2EssayType: normalizeTask2EssayType(body.selection.task2EssayType),
      task2Topic: normalizeTask2Topic(body.selection.task2Topic)
    }
    const question = await generateWritingPromptWithAi({
      taskType: body.taskType,
      selection,
      excludePromptSummaries: body.excludePromptSummaries
    })
    await recordPromptUsage(check, body, question)
    return json({ ok: true, question })
  } catch (error) {
    await recordPromptUsage(check, body, null, error)
    if (error instanceof AiConfigurationError) {
      return json({ error: 'ai_not_configured', missing: error.missing }, { status: 503 })
    }
    if (error instanceof AiProviderError) {
      return json({ error: error.code, message: error.message, providerStatus: error.status }, { status: 502 })
    }
    return apiError(error, 'AI prompt generation failed.')
  }
}

async function recordPromptUsage(
  check: Extract<WebLicenseCheck, { ok: true }>,
  body: z.infer<typeof GeneratePromptSchema>,
  result: unknown,
  error?: unknown
) {
  const service = createSupabaseServiceRoleClient()
  await Promise.all([
    service
      .from('license_activations')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', check.activation.id),
    service
      .from('usage_records')
      .insert({
        user_id: check.user.id,
        license_id: check.activation.license_id,
        action: 'generate_prompt',
        model: process.env.AI_MODEL || null,
        input_tokens: Math.ceil(JSON.stringify(body).length / 4),
        output_tokens: result ? Math.ceil(JSON.stringify(result).length / 4) : null,
        success: !error,
        error_message: error instanceof Error ? error.message.slice(0, 500) : null
      })
  ])
}
