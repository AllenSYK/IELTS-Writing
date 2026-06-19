import { z } from 'zod'
import {
  AiConfigurationError,
  AiProviderError,
  apiStatusForAiError,
  generateWritingPromptWithAi
} from '@/lib/ai'
import { recordAiUsage } from '@/lib/ai-usage'
import { apiError, json } from '@/lib/http'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
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
    await recordAiUsage({
      check,
      action: 'generate_prompt',
      inputCharacters: JSON.stringify(body).length,
      result: question
    })
    return json({ ok: true, question })
  } catch (error) {
    await recordAiUsage({
      check,
      action: 'generate_prompt',
      inputCharacters: JSON.stringify(body).length,
      result: null,
      error
    })
    if (error instanceof AiConfigurationError) {
      return json({ error: 'ai_not_configured', missing: error.missing }, { status: 503 })
    }
    if (error instanceof AiProviderError) {
      return json(
        { error: error.code, message: error.message, providerStatus: error.status },
        { status: apiStatusForAiError(error) }
      )
    }
    return apiError(error, 'AI prompt generation failed.')
  }
}
