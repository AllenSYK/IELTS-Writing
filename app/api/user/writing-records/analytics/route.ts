import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { parseBand } from '@/lib/ielts-scoring'
import type { CriterionKey, EssayAnnotation } from '@/lib/writing-record-types'

type RawCriterionScore = { score?: unknown; feedback?: unknown }

type AnalyticsRecord = {
  id: string
  taskType: string
  submittedAt: string
  processingStatus: string
  overallBand: number | null
  taskAchievement: { score: string; feedback: string } | null
  taskResponse: { score: string; feedback: string } | null
  coherenceCohesion: { score: string; feedback: string } | null
  lexicalResource: { score: string; feedback: string } | null
  grammaticalRangeAccuracy: { score: string; feedback: string } | null
  annotations: EssayAnnotation[]
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function extractCriterion(
  evaluation: Record<string, unknown> | null | undefined,
  ...keys: string[]
): { score: string; feedback: string } | null {
  if (!evaluation) return null
  for (const key of keys) {
    const direct = evaluation[key]
    if (direct && typeof direct === 'object') {
      const obj = direct as RawCriterionScore
      const score = toStringOrNull(obj.score)
      if (score && typeof obj.feedback === 'string') return { score, feedback: obj.feedback }
    }
    const criteria = evaluation.criteria
    if (criteria && typeof criteria === 'object') {
      const nested = (criteria as Record<string, unknown>)[key]
      if (nested && typeof nested === 'object') {
        const obj = nested as RawCriterionScore
        const score = toStringOrNull(obj.score)
        if (score && typeof obj.feedback === 'string') return { score, feedback: obj.feedback }
      }
    }
  }
  return null
}

function extractOverallBand(evaluation: Record<string, unknown> | null | undefined): number | null {
  if (!evaluation) return null
  const candidates = [
    evaluation.overallBand,
    evaluation.bandEstimate,
    evaluation.overall_band,
    evaluation.overall
  ]
  for (const candidate of candidates) {
    const parsed = parseBand(candidate as string | number | null | undefined)
    if (parsed !== null) return parsed
  }
  return null
}

function isAnnotationObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).originalText === 'string'
}

function normalizeAnnotation(value: unknown): EssayAnnotation | null {
  if (!isAnnotationObject(value)) return null
  const v = value
  const originalText = typeof v.originalText === 'string'
    ? v.originalText
    : typeof v.original === 'string'
      ? v.original
      : ''
  if (!originalText) return null
  return {
    id: typeof v.id === 'string' ? v.id : `ann-${Math.random().toString(36).slice(2, 8)}`,
    start: typeof v.start === 'number' ? v.start : -1,
    end: typeof v.end === 'number' ? v.end : -1,
    originalText,
    replacement: typeof v.replacement === 'string' ? v.replacement : typeof v.correction === 'string' ? v.correction : undefined,
    category: typeof v.category === 'string' ? v.category as EssayAnnotation['category'] : 'grammar',
    severity: typeof v.severity === 'string' ? v.severity as EssayAnnotation['severity'] : 'medium',
    scoreCriterion: typeof v.scoreCriterion === 'string' ? v.scoreCriterion as EssayAnnotation['scoreCriterion'] : 'Grammatical Range and Accuracy',
    explanationZh: typeof v.explanationZh === 'string' ? v.explanationZh : typeof v.explanation === 'string' ? v.explanation : '',
    explanationEn: typeof v.explanationEn === 'string' ? v.explanationEn : undefined,
    impactOnScore: typeof v.impactOnScore === 'string' ? v.impactOnScore : '',
    suggestion: typeof v.suggestion === 'string' ? v.suggestion : ''
  }
}

function safeParseAnnotations(raw: unknown): EssayAnnotation[] {
  let value = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  if (!Array.isArray(value)) return []
  return value.map(normalizeAnnotation).filter((a): a is EssayAnnotation => a !== null)
}

function extractAnnotations(
  evaluation: Record<string, unknown> | null | undefined,
  rowAnnotations: unknown
): EssayAnnotation[] {
  const fromEval = evaluation?.annotations
  if (Array.isArray(fromEval) && fromEval.length > 0) return safeParseAnnotations(fromEval)
  if (typeof fromEval === 'string' && fromEval.trim()) {
    const parsed = safeParseAnnotations(fromEval)
    if (parsed.length > 0) return parsed
  }
  return safeParseAnnotations(rowAnnotations)
}

const COMPLETED_STATUSES = ['complete', 'completed', 'partial']

function buildAnalyticsRecord(row: Record<string, unknown>): AnalyticsRecord | null {
  if (!COMPLETED_STATUSES.includes(row.processing_status as string)) return null

  let evaluation: Record<string, unknown> | null = null
  if (row.evaluation && typeof row.evaluation === 'object') {
    evaluation = row.evaluation as Record<string, unknown>
  } else if (typeof row.evaluation === 'string') {
    try { evaluation = JSON.parse(row.evaluation) as Record<string, unknown> } catch { /* ignore */ }
  }

  const overallBand = extractOverallBand(evaluation)
  const criteriaNames: CriterionKey[] = [
    'taskAchievement', 'taskResponse', 'coherenceCohesion',
    'lexicalResource', 'grammaticalRangeAccuracy'
  ]
  const snakeMap: Record<CriterionKey, string> = {
    taskAchievement: 'task_achievement',
    taskResponse: 'task_response',
    coherenceCohesion: 'coherence_cohesion',
    lexicalResource: 'lexical_resource',
    grammaticalRangeAccuracy: 'grammatical_range_accuracy'
  }

  const result: AnalyticsRecord = {
    id: row.id as string,
    taskType: row.task_type as string,
    submittedAt: row.submitted_at as string,
    processingStatus: row.processing_status as string,
    overallBand,
    taskAchievement: null,
    taskResponse: null,
    coherenceCohesion: null,
    lexicalResource: null,
    grammaticalRangeAccuracy: null,
    annotations: extractAnnotations(evaluation, row.annotations)
  }

  for (const key of criteriaNames) {
    const score = extractCriterion(evaluation, key, snakeMap[key])
    result[key] = score
  }

  return result
}

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select('id, task_type, submitted_at, processing_status, evaluation, annotations')
    .eq('user_id', user.id)
    .in('processing_status', ['complete', 'completed', 'partial'])
    .order('submitted_at', { ascending: false })
    .limit(50)

  if (error) {
    return json({ success: false, message: '学习分析数据读取失败' }, { status: 500 })
  }

  const records = (data ?? [])
    .map((row) => buildAnalyticsRecord(row as Record<string, unknown>))
    .filter((r): r is AnalyticsRecord => r !== null)

  return json({ success: true, records })
}
