import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getEffectiveVisionAiConfig, getEffectiveAiConfig, AiProviderError, AiConfigurationError } from '@/lib/ai-provider'

const AnalyzeSchema = z.object({
  questionId: z.string().uuid(),
  imageUrl: z.string().url().optional(),
  rawText: z.string().max(20000).optional()
})

export async function POST(request: Request) {
  try {
    await requireWebAdmin(request)
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = AnalyzeSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()

  await service
    .from('past_paper_questions')
    .update({ status: 'analyzing' })
    .eq('id', body.questionId)

  try {
    let analysisResult: Record<string, unknown>

    if (body.imageUrl) {
      const visionConfig = await getEffectiveVisionAiConfig()
      analysisResult = await analyzeWithVision(visionConfig, body.imageUrl)
    } else if (body.rawText) {
      const textConfig = await getEffectiveAiConfig({
        slot: 'studyPlanModel',
        modelEnv: 'QWEN_STUDY_PLAN_MODEL',
        defaultModel: 'qwen-plus'
      })
      analysisResult = await analyzeWithText(textConfig, body.rawText)
    } else {
      return json({ success: false, message: 'Either imageUrl or rawText required' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      status: 'review_pending',
      ai_analysis: analysisResult,
      ai_model: body.imageUrl ? 'qwen-vl-plus' : 'qwen-plus',
      ai_analyzed_at: new Date().toISOString()
    }

    if (analysisResult.title) updates.title = analysisResult.title
    if (analysisResult.questionText) updates.question_text = analysisResult.questionText
    if (analysisResult.summary) updates.summary = analysisResult.summary
    if (analysisResult.detectedTask) updates.task_type = analysisResult.detectedTask
    if (analysisResult.topics) updates.topics = analysisResult.topics
    if (analysisResult.keywords) updates.keywords = analysisResult.keywords
    if (analysisResult.suggestedFrequency) updates.frequency_level = analysisResult.suggestedFrequency
    if (analysisResult.difficulty) updates.difficulty = analysisResult.difficulty
    if (analysisResult.task1VisualTypes) updates.task1_visual_types = analysisResult.task1VisualTypes
    if (analysisResult.task2QuestionType) updates.task2_question_type = analysisResult.task2QuestionType
    if (analysisResult.sourceHints && typeof analysisResult.sourceHints === 'object') {
      const hints = analysisResult.sourceHints as Record<string, unknown>
      if (hints.sourceName) updates.source_name = hints.sourceName
      if (hints.year) updates.source_year = hints.year
    }
    updates.frequency_source = 'ai_suggested'

    await service
      .from('past_paper_questions')
      .update(updates)
      .eq('id', body.questionId)

    return json({ success: true, analysis: analysisResult })
  } catch (error) {
    await service
      .from('past_paper_questions')
      .update({ status: 'analysis_failed' })
      .eq('id', body.questionId)

    if (error instanceof AiConfigurationError) {
      return json({ success: false, message: `AI not configured: ${error.missing.join(', ')}` }, { status: 503 })
    }
    if (error instanceof AiProviderError) {
      return json({ success: false, message: error.message }, { status: 502 })
    }
    return json({ success: false, message: 'Analysis failed' }, { status: 500 })
  }
}

async function analyzeWithVision(config: { apiKey: string; baseUrl: string; model: string }, imageUrl: string): Promise<Record<string, unknown>> {
  const systemPrompt = `You are an IELTS question analyzer. Analyze the image and return JSON with these fields:
- detectedTask: "task1_academic" | "task1_general" | "task2" | "unknown"
- questionText: full question text extracted
- title: short descriptive title
- summary: one sentence summary
- task1VisualTypes: array of visual types if Task 1 (line, bar, pie, table, map, process, mixed, letter)
- task2QuestionType: if Task 2, the essay type (agree_disagree, discussion_opinion, advantages_disadvantages, problem_solution, two_part, direct_question, etc.)
- topics: array of topic tags (education, technology, environment, society, etc.)
- keywords: array of key terms
- suggestedFrequency: "high" | "medium_high" | "normal" | "low" based on how common this type is
- difficulty: "easy" | "medium" | "hard"
- sourceHints: { sourceName?: string, year?: number, testNumber?: string, confidence: 0-1 }
- uncertainties: array of things you're unsure about
- possibleDuplicateIds: always empty array
Do NOT fabricate source or year if not clearly visible. Return ONLY valid JSON.`

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'text', text: 'Analyze this IELTS question image.' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ] }
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(60000)
  })

  if (!response.ok) throw new AiProviderError('Vision analysis failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
}

async function analyzeWithText(config: { apiKey: string; baseUrl: string; model: string }, rawText: string): Promise<Record<string, unknown>> {
  const systemPrompt = `You are an IELTS question analyzer. Analyze the question text and return JSON with these fields:
- detectedTask: "task1_academic" | "task1_general" | "task2" | "unknown"
- questionText: the cleaned question text
- title: short descriptive title
- summary: one sentence summary
- task2QuestionType: if Task 2, the essay type
- topics: array of topic tags
- keywords: array of key terms
- suggestedFrequency: "high" | "medium_high" | "normal" | "low"
- difficulty: "easy" | "medium" | "hard"
- sourceHints: { sourceName?: string, year?: number, confidence: 0-1 }
- uncertainties: array of things you're unsure about
- possibleDuplicateIds: always empty array
Return ONLY valid JSON.`

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText }
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) throw new AiProviderError('Text analysis failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
}
