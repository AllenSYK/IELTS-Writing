import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { getEffectiveStudyPlanAiConfig, AiProviderError, AiConfigurationError } from '@/lib/ai-provider'
import type { RecalledExamImportResult, ExamMode, ExamSession, QuestionCompleteness } from '@/lib/past-paper-types'

const AnalyzeSchema = z.object({
  rawText: z.string().min(10).max(50000),
  defaultYear: z.number().int().min(2020).max(2030).optional(),
  defaultRegion: z.string().max(100).optional(),
  defaultMode: z.enum(['computer', 'paper', 'unknown']).default('unknown')
})

export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireWebAdmin>>
  try {
    admin = await requireWebAdmin(request)
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = AnalyzeSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  try {
    const config = await getEffectiveStudyPlanAiConfig()
    const result = await analyzeRecalledExam(config, body.rawText, body.defaultYear, body.defaultRegion, body.defaultMode)

    const { service } = admin
    const { data: batch, error: batchError } = await service
      .from('exam_import_batches')
      .insert({
        raw_text: body.rawText,
        default_year: body.defaultYear ?? null,
        default_region: body.defaultRegion ?? null,
        default_mode: body.defaultMode,
        ai_model: config.model,
        ai_result: result,
        status: 'completed',
        sets_created: result.examRecords.length,
        questions_created: result.examRecords.reduce((sum, r) => sum + (r.task1 ? 1 : 0) + (r.task2 ? 1 : 0), 0),
        created_by: admin.user.id
      })
      .select('id')
      .single()

    if (batchError) {
      return json({ success: true, analysis: result, batchId: null })
    }

    return json({ success: true, analysis: result, batchId: batch?.id })
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return json({ success: false, message: `AI not configured: ${error.missing.join(', ')}` }, { status: 503 })
    }
    if (error instanceof AiProviderError) {
      return json({ success: false, message: error.message }, { status: 502 })
    }
    return json({ success: false, message: 'Analysis failed' }, { status: 500 })
  }
}

async function analyzeRecalledExam(
  config: { apiKey: string; baseUrl: string; model: string },
  rawText: string,
  defaultYear?: number,
  defaultRegion?: string,
  defaultMode: ExamMode = 'unknown'
): Promise<RecalledExamImportResult> {
  const systemPrompt = `You are an IELTS exam recall data parser. Analyze the raw text containing recalled IELTS writing exam questions and extract structured data.

RULES:
1. Split the text into individual exam records by date/session.
2. For each record, extract Task 1 and Task 2 separately.
3. Determine exam session (morning/afternoon/evening/unknown) from context.
4. Determine exam mode (computer/paper/unknown) if mentioned.
5. For Task 1: identify visual type(s), completeness level, topics. Do NOT fabricate data for incomplete Task 1.
6. For Task 2: extract full question text, classify question type, identify primary and secondary topics.
7. Assess completeness honestly: complete/mostly_complete/partial/summary_only/missing.
8. List missing fields and uncertainties for each task.
9. Assess reliability: confirmed/multiple_reports/single_report/uncertain.
10. Do NOT invent country names, years, numbers, or chart data that isn't in the source text.

Return JSON with this structure:
{
  "examRecords": [
    {
      "examDate": "YYYY-MM-DD" or null if unknown,
      "examSession": "morning" | "afternoon" | "evening" | "unknown",
      "examTimeLocal": "HH:MM" or null,
      "examMode": "computer" | "paper" | "unknown",
      "examCountry": string or null,
      "examRegion": string or null,
      "examCity": string or null,
      "task1": {
        "questionText": string or null,
        "summary": string or null,
        "visualTypes": ["line", "bar", ...],
        "completeness": "complete" | "mostly_complete" | "partial" | "summary_only" | "missing",
        "topics": [string],
        "missingFields": [string],
        "uncertainties": [string]
      } or null,
      "task2": {
        "questionText": string or null,
        "questionType": "agree_disagree" | "discussion_opinion" | ...,
        "primaryTopic": string or null,
        "secondaryTopics": [string],
        "completeness": "complete" | "mostly_complete" | "partial" | "summary_only" | "missing",
        "missingFields": [string],
        "uncertainties": [string]
      } or null,
      "reliability": "confirmed" | "multiple_reports" | "single_report" | "uncertain",
      "sourceNotes": string or null
    }
  ]
}`

  let userPrompt = `Analyze the following IELTS exam recall data:\n\n${rawText}`
  if (defaultYear) userPrompt += `\n\nDefault year if not specified: ${defaultYear}`
  if (defaultRegion) userPrompt += `\nDefault region if not specified: ${defaultRegion}`
  if (defaultMode !== 'unknown') userPrompt += `\nDefault exam mode if not specified: ${defaultMode}`

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
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(120000)
  })

  if (!response.ok) throw new AiProviderError('Recalled exam analysis failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as Partial<RecalledExamImportResult>

  if (!Array.isArray(parsed.examRecords)) {
    return { examRecords: [] }
  }

  const validExamSessions: ExamSession[] = ['morning', 'afternoon', 'evening', 'unknown']
  const validExamModes: ExamMode[] = ['computer', 'paper', 'unknown']
  const validCompleteness: QuestionCompleteness[] = ['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']

  return {
    examRecords: parsed.examRecords.map(record => ({
      examDate: record.examDate ?? undefined,
      examSession: validExamSessions.includes(record.examSession) ? record.examSession : 'unknown',
      examTimeLocal: record.examTimeLocal ?? undefined,
      examMode: validExamModes.includes(record.examMode) ? record.examMode : defaultMode,
      examCountry: record.examCountry ?? defaultRegion ?? undefined,
      examRegion: record.examRegion ?? defaultRegion ?? undefined,
      examCity: record.examCity ?? undefined,
      task1: record.task1 ? {
        questionText: record.task1.questionText ?? undefined,
        summary: record.task1.summary ?? undefined,
        visualTypes: Array.isArray(record.task1.visualTypes) ? record.task1.visualTypes : [],
        completeness: validCompleteness.includes(record.task1.completeness) ? record.task1.completeness : 'partial',
        topics: Array.isArray(record.task1.topics) ? record.task1.topics : [],
        missingFields: Array.isArray(record.task1.missingFields) ? record.task1.missingFields : [],
        uncertainties: Array.isArray(record.task1.uncertainties) ? record.task1.uncertainties : []
      } : undefined,
      task2: record.task2 ? {
        questionText: record.task2.questionText ?? undefined,
        questionType: record.task2.questionType ?? 'unknown',
        primaryTopic: record.task2.primaryTopic ?? undefined,
        secondaryTopics: Array.isArray(record.task2.secondaryTopics) ? record.task2.secondaryTopics : [],
        completeness: validCompleteness.includes(record.task2.completeness) ? record.task2.completeness : 'partial',
        missingFields: Array.isArray(record.task2.missingFields) ? record.task2.missingFields : [],
        uncertainties: Array.isArray(record.task2.uncertainties) ? record.task2.uncertainties : []
      } : undefined,
      reliability: record.reliability ?? 'single_report',
      sourceNotes: record.sourceNotes ?? undefined
    }))
  }
}
