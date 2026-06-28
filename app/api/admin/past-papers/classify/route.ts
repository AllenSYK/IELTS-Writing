import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getAiConfig, AiProviderError, fetchAiNonStreamingCompletion, parseAiJsonObject, type AiConfig } from '@/lib/ai-provider'
import { checkRateLimit, getClientIp, rateLimitResponse, AI_CLASSIFY_RATE_LIMIT } from '@/lib/rate-limit'

const ClassifySchema = z.object({
  questionIds: z.array(z.string().uuid()).max(20).optional(),
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

const MAX_QUESTIONS = 20
const BATCH_SIZE = 5
const BATCH_TIMEOUT_MS = 60_000
const TOTAL_TIME_GUARD_MS = 250_000

export async function POST(request: Request) {
  let user
  try {
    const result = await requireWebAdmin()
    user = result.user
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  // 限流检查：管理员维度
  const ip = getClientIp(request)
  const rateLimitKey = `ai-classify:${user.id}:${ip}`
  const rateLimitResult = checkRateLimit(rateLimitKey, AI_CLASSIFY_RATE_LIMIT)
  
  if (!rateLimitResult.allowed) {
    return rateLimitResponse(rateLimitResult)
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

  const { data: questions, error: fetchError } = await query.limit(MAX_QUESTIONS)
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

  const startTime = Date.now()
  const results: ClassificationResult[] = []

  for (let i = 0; i < questionsToClassify.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > TOTAL_TIME_GUARD_MS) {
      for (let j = i; j < questionsToClassify.length; j++) {
        results.push({
          questionId: questionsToClassify[j].id as string,
          current: extractCurrent(questionsToClassify[j]),
          suggestion: fallbackSuggestion(questionsToClassify[j]),
          changed: false
        })
      }
      break
    }

    const batch = questionsToClassify.slice(i, i + BATCH_SIZE)
    const batchResults = await classifyBatch(config, batch)
    results.push(...batchResults)
  }

  return json({ success: true, results, total: results.length })
}

async function classifyBatch(
  config: AiConfig,
  questions: Record<string, unknown>[]
): Promise<ClassificationResult[]> {
  const questionSummaries = questions.map((q) => ({
    id: q.id as string,
    taskType: q.task_type as string,
    title: (q.title as string) || '',
    questionText: (q.question_text as string)?.slice(0, 500) || '',
    summary: (q.summary as string)?.slice(0, 200) || '',
    currentTopics: (q.topics as string[]) ?? [],
    currentFrequency: q.frequency_level as string,
    currentSourceType: q.source_type as string,
    currentTask2Type: q.task2_question_type as string | null,
    currentCompleteness: q.completeness as string | null
  }))

  const systemPrompt = `Classify IELTS Writing questions. Return JSON only. Do not rewrite questions or invent missing info.

CRITICAL: For every input item, you MUST return exactly the same questionId as provided in the input.
Never omit, modify, reorder, or invent questionId.
Results are matched ONLY by questionId. You may change output order freely.

For each question return:
- questionId: REQUIRED. Exact copy from input.
- taskType: task1_academic|task1_general|task2|full_test|unknown
- taskTypeConfidence: 0.0-1.0
- task1VisualTypes: array (line|bar|pie|table|map|process|mixed|letter|other) if task1
- task2QuestionType: agree_disagree|discussion_opinion|advantages_disadvantages|outweigh|problem_solution|cause_solution|two_part|direct_question|positive_negative|other|unknown
- primaryTopic: one main topic
- secondaryTopics: max 3
- keywords: max 8
- frequency: high|medium_high|regular|low|unknown (suggestion only)
- frequencyConfidence: 0.0-1.0
- frequencyReason: brief
- sourceType: official_public|published_book|exam_recall|platform_curated|user_submitted|other|unknown
- sourceReliability: confirmed|multiple_reports|single_report|uncertain
- completeness: complete|mostly_complete|partial|summary_only|missing
- suggestedTags: max 6
- missingFields: max 10
- uncertainties: max 8
- warnings: max 6

Return {"classifications": [...]} with one object per question.`

  const userPayload = JSON.stringify({
    questions: questionSummaries,
    topics: ['education', 'technology', 'environment', 'society', 'government', 'media', 'work', 'health', 'crime', 'city', 'transport', 'globalization', 'culture', 'family', 'economy', 'tourism', 'children', 'elderly', 'sports'],
    task2Types: ['agree_disagree', 'discussion_opinion', 'advantages_disadvantages', 'outweigh', 'problem_solution', 'cause_solution', 'two_part', 'direct_question', 'positive_negative', 'other', 'unknown']
  })

  try {
    const estimatedTokensPerQuestion = 400
    const dynamicMaxTokens = Math.min(8000, questions.length * estimatedTokensPerQuestion + 500)
    const content = await fetchAiNonStreamingCompletion(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPayload }
    ], {
      maxTokens: dynamicMaxTokens,
      requestId: `classify-${Date.now().toString(36)}`,
      stage: 'past-paper-classify',
      responseFormat: { type: 'json_object' }
    })

    const parsed = parseAiJsonObject(content) as { classifications?: Array<Record<string, unknown>> }

    const classifications = parsed.classifications ?? []
    const results: ClassificationResult[] = []
    const seenIds = new Set<string>()
    const inputIds = new Set(questions.map((q) => q.id as string))

    for (const c of classifications) {
      const qId = typeof c.questionId === 'string' ? c.questionId : null
      if (!qId || !inputIds.has(qId)) continue
      if (seenIds.has(qId)) continue
      seenIds.add(qId)
    }

    for (const q of questions) {
      const qId = q.id as string
      const aiResult = seenIds.has(qId)
        ? classifications.find((c) => c.questionId === qId)
        : undefined
      if (!aiResult) {
        results.push({
          questionId: qId,
          current: extractCurrent(q),
          suggestion: fallbackSuggestion(q),
          changed: false
        })
        continue
      }

      const suggestion = normalizeSuggestion(aiResult)
      const current = extractCurrent(q)
      results.push({
        questionId: qId,
        current,
        suggestion,
        changed: hasChanges(current, suggestion)
      })
    }

    return results
  } catch (error) {
    console.error('[classify-batch]', { error: error instanceof Error ? error.name : 'unknown' })
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

const VALID_TASK2_QUESTION_TYPES = [
  'agree_disagree', 'discussion_opinion', 'advantages_disadvantages', 'outweigh',
  'problem_solution', 'cause_solution', 'two_part', 'direct_question',
  'positive_negative', 'other', 'unknown'
]

function normalizeSuggestion(raw: Record<string, unknown>) {
  const validTaskTypes = ['task1_academic', 'task1_general', 'task2', 'full_test', 'unknown']
  const validFrequencies = ['high', 'medium_high', 'regular', 'low', 'unknown']
  const validSourceTypes = ['official_public', 'published_book', 'exam_recall', 'platform_curated', 'user_submitted', 'other', 'unknown']
  const validReliability = ['confirmed', 'multiple_reports', 'single_report', 'uncertain']
  const validCompleteness = ['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']

  const rawTask2Type = typeof raw.task2QuestionType === 'string' ? raw.task2QuestionType : undefined
  const validatedTask2Type = rawTask2Type && VALID_TASK2_QUESTION_TYPES.includes(rawTask2Type) ? rawTask2Type : rawTask2Type ? 'unknown' : undefined

  return {
    taskType: validTaskTypes.includes(raw.taskType as string) ? (raw.taskType as string) : 'unknown',
    taskTypeConfidence: clampConfidence(raw.taskTypeConfidence),
    task1VisualTypes: Array.isArray(raw.task1VisualTypes) ? raw.task1VisualTypes.slice(0, 8) as string[] : undefined,
    task2QuestionType: validatedTask2Type,
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
