import { z } from 'zod'
import { AiConfigurationError, AiProviderError, generateWritingPromptWithAi } from '@/lib/ai'
import { apiError, json } from '@/lib/http'
import { verifyLicenseToken } from '@/lib/license/token'
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
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return json({ error: 'license_required' }, { status: 401 })

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
