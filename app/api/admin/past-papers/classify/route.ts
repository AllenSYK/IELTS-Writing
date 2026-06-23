import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getAiConfig, AiProviderError, AiConfigurationError } from '@/lib/ai-provider'

const ClassifySchema = z.object({
  questionIds: z.array(z.string().uuid()).max(50).optional(),
  scope: z.enum(['unclassified', 'all']).default('unclassified'),
  forceRecalculate: z.boolean().default(false)
})

type ClassificationResult = {
  questionId: string
  current: {
    taskType: string
    frequencyLevel: string
    sourceType: string
    topics: string[]
    task2QuestionType: string | null
    completeness: string | null
  }
  suggestion: {
    taskType: string
    taskTypeConfidence: number
    task1VisualTypes?: string[]
    task2QuestionType?: string
    primaryTopic?: string
    secondaryTopics?: string[]
    keywords?: string[]
    frequency: string
    frequencyConfidence: number
    frequencyReason?: string
    sourceType: string
    sourceReliability: string
    completeness: string
    suggestedTags?: string[]
    missingFields?: string[]
    uncertainties?: string[]
    warnings?: string[]
  }
  changed: boolean
}

export async function POST(request: Request) {
  try {
    await requireWebAdmin()
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = ClassifySchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()

  let query = service
    .from('past_paper_questions')
    .select('id, task_type, title, question_text, summary, source_type, source_name, source_year, frequency_level, frequency_source, topics, keywords, task2_question_type, completeness, primary_topic, secondary_topics, classification_status, classification_sources')

  if (body.questionIds && body.questionIds.length > 0) {
    query = query.in('id', body.questionIds)
  } else if (body.scope === 'unclassified') {
    query = query.or('classification_status.eq.unclassified,classification_status.eq.failed')
  }

  const { data: questions, error: fetchError } = await query.limit(50)
  if (fetchError) return json({ success: false, message: fetchError.message }, { status: 500 })
  if (!questions || questions.length === 0) {
    return json({ success: true, results: [], message: '没有需要分类的题目' })
  }

  const questionsToClassify = body.forceRecalculate
    ? questions
    : questions.filter((q) => {
        const sources = (q.classification_sources as Record<string, string>) ?? {}
        const hasAdminValue = Object.values(sources).some((v) => v === 'admin')
        return !hasAdminValue || q.classification_status === 'unclassified' || q.classification_status === 'failed'
      })

  if (questionsToClassify.length === 0) {
    return json({ success: true, results: [], message: '所有题目已有管理员确认的分类' })
  }

  let config
  try {
    config = getAiConfig({ modelEnv: 'QWEN_STUDY_PLAN_MODEL', defaultModel: 'qwen3.5-plus' })
  } catch {
    return json({ success: false, message: 'AI not configured' }, { status: 503 })
  }

  const batchSize = 10
  const results: ClassificationResult[] = []

  for (let i = 0; i < questionsToClassify.length; i += batchSize) {
    const batch = questionsToClassify.slice(i, i + batchSize)
    const batchResults = await classifyBatch(config, batch)
    results.push(...batchResults)
  }

  return json({ success: true, results, total: results.length })
}

async function classifyBatch(
  config: { apiKey: string; baseUrl: string; model: string },
  questions: Record<string, unknown>[]
): Promise<ClassificationResult[]> {
  const questionSummaries = questions.map((q) => ({
    id: q.id as string,
    taskType: q.task_type as string,
    title: (q.title as string) || '',
    questionText: (q.question_text as string)?.slice(0, 1000) || '',
    summary: (q.summary as string)?.slice(0, 300) || '',
    currentTopics: (q.topics as string[]) ?? [],
    currentFrequency: q.frequency_level as string,
    currentSourceType: q.source_type as string,
    currentTask2Type: q.task2_question_type as string | null,
    currentCompleteness: q.completeness as string | null
  }))

  const systemPrompt = `You are classifying IELTS Writing questions for an administrator.
Do not rewrite the question.
Do not invent missing information.
Do not claim a source is official without explicit evidence.
Do not infer exam dates from upload time.
Do not fabricate chart data.
Return JSON only.

For each question, return a classification object with these fields:
- taskType: "task1_academic" | "task1_general" | "task2" | "full_test" | "unknown"
- taskTypeConfidence: 0.0-1.0
- task1VisualTypes: array of visual types if task1 (line, bar, pie, table, map, process, mixed, letter, other)
- task2QuestionType: if task2 (agree_disagree, discussion_opinion, advantages_disadvantages, outweigh, problem_solution, cause_solution, two_part, direct_question, positive_negative, other, unknown)
- primaryTopic: one main topic
- secondaryTopics: max 3 additional topics
- keywords: max 8 keywords
- frequency: "high" | "medium_high" | "regular" | "low" | "unknown" (suggestion only, based on topic/type commonality)
- frequencyConfidence: 0.0-1.0
- frequencyReason: brief explanation
- sourceType: "official_public" | "published_book" | "exam_recall" | "platform_curated" | "user_submitted" | "other" | "unknown"
- sourceReliability: "confirmed" | "multiple_reports" | "single_report" | "uncertain"
- completeness: "complete" | "mostly_complete" | "partial" | "summary_only" | "missing"
- suggestedTags: max 6 tags
- missingFields: max 10 items
- uncertainties: max 8 items
- warnings: max 6 items

Frequency is only a suggestion based on available evidence. If evidence is insufficient, return "unknown".
Do not overwrite fields marked as admin-confirmed. Return suggestions separately.

Return a JSON object with a "classifications" array containing one object per input question, keyed by question id.`

  const userPayload = JSON.stringify({
    questions: questionSummaries,
    availableTopics: ['education', 'technology', 'environment', 'society', 'government', 'media', 'work', 'health', 'crime', 'city', 'transport', 'globalization', 'culture', 'family', 'economy', 'tourism', 'children', 'elderly', 'sports'],
    task2QuestionTypes: ['agree_disagree', 'discussion_opinion', 'advantages_disadvantages', 'outweigh', 'problem_solution', 'cause_solution', 'two_part', 'direct_question', 'positive_negative', 'other', 'unknown']
  })

  try {
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
          { role: 'user', content: userPayload }
        ],
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      }),
      signal: AbortSignal.timeout(120000)
    })

    if (!response.ok) throw new AiProviderError('Classification failed', response.status)
    const data = await response.json() as { choices: Array<{ message: { content: string } }> }
    const content = data.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(content) as { classifications?: Array<Record<string, unknown>> }

    const classifications = parsed.classifications ?? []
    const results: ClassificationResult[] = []

    for (const q of questions) {
      const aiResult = classifications.find((c) => c.questionId === q.id) ?? classifications.shift()
      if (!aiResult) {
        results.push({
          questionId: q.id as string,
          current: extractCurrent(q),
          suggestion: fallbackSuggestion(q),
          changed: false
        })
        continue
      }

      const suggestion = normalizeSuggestion(aiResult)
      const current = extractCurrent(q)
      results.push({
        questionId: q.id as string,
        current,
        suggestion,
        changed: hasChanges(current, suggestion)
      })
    }

    return results
  } catch {
    return questions.map((q) => ({
      questionId: q.id as string,
      current: extractCurrent(q),
      suggestion: fallbackSuggestion(q),
      changed: false
    }))
  }
}

function extractCurrent(q: Record<string, unknown>) {
  return {
    taskType: (q.task_type as string) ?? 'unknown',
    frequencyLevel: (q.frequency_level as string) ?? 'normal',
    sourceType: (q.source_type as string) ?? 'curated',
    topics: (q.topics as string[]) ?? [],
    task2QuestionType: (q.task2_question_type as string) ?? null,
    completeness: (q.completeness as string) ?? null
  }
}

function fallbackSuggestion(q: Record<string, unknown>) {
  return {
    taskType: (q.task_type as string) ?? 'unknown',
    taskTypeConfidence: 0,
    frequency: 'unknown' as const,
    frequencyConfidence: 0,
    sourceType: 'unknown' as const,
    sourceReliability: 'uncertain' as const,
    completeness: (q.completeness as string) ?? 'complete' as const
  }
}

function normalizeSuggestion(raw: Record<string, unknown>) {
  const validTaskTypes = ['task1_academic', 'task1_general', 'task2', 'full_test', 'unknown']
  const validFrequencies = ['high', 'medium_high', 'regular', 'low', 'unknown']
  const validSourceTypes = ['official_public', 'published_book', 'exam_recall', 'platform_curated', 'user_submitted', 'other', 'unknown']
  const validReliability = ['confirmed', 'multiple_reports', 'single_report', 'uncertain']
  const validCompleteness = ['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']

  return {
    taskType: validTaskTypes.includes(raw.taskType as string) ? (raw.taskType as string) : 'unknown',
    taskTypeConfidence: clampConfidence(raw.taskTypeConfidence),
    task1VisualTypes: Array.isArray(raw.task1VisualTypes) ? raw.task1VisualTypes.slice(0, 8) as string[] : undefined,
    task2QuestionType: typeof raw.task2QuestionType === 'string' ? raw.task2QuestionType : undefined,
    primaryTopic: typeof raw.primaryTopic === 'string' ? raw.primaryTopic : undefined,
    secondaryTopics: Array.isArray(raw.secondaryTopics) ? raw.secondaryTopics.slice(0, 3) as string[] : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 8) as string[] : [],
    frequency: validFrequencies.includes(raw.frequency as string) ? (raw.frequency as string) : 'unknown',
    frequencyConfidence: clampConfidence(raw.frequencyConfidence),
    frequencyReason: typeof raw.frequencyReason === 'string' ? raw.frequencyReason : undefined,
    sourceType: validSourceTypes.includes(raw.sourceType as string) ? (raw.sourceType as string) : 'unknown',
    sourceReliability: validReliability.includes(raw.sourceReliability as string) ? (raw.sourceReliability as string) : 'uncertain',
    completeness: validCompleteness.includes(raw.completeness as string) ? (raw.completeness as string) : 'complete',
    suggestedTags: Array.isArray(raw.suggestedTags) ? raw.suggestedTags.slice(0, 6) as string[] : [],
    missingFields: Array.isArray(raw.missingFields) ? raw.missingFields.slice(0, 10) as string[] : [],
    uncertainties: Array.isArray(raw.uncertainties) ? raw.uncertainties.slice(0, 8) as string[] : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.slice(0, 6) as string[] : []
  }
}

function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : 0
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100))
}

function hasChanges(current: { taskType: string; frequencyLevel: string; sourceType: string; topics: string[] }, suggestion: { taskType: string; frequency: string; sourceType: string; primaryTopic?: string }): boolean {
  return (
    current.taskType !== suggestion.taskType ||
    current.frequencyLevel !== suggestion.frequency ||
    current.sourceType !== suggestion.sourceType ||
    Boolean(suggestion.primaryTopic && !current.topics.includes(suggestion.primaryTopic))
  )
}
