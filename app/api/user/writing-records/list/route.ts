import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { parseBand } from '@/lib/ielts-scoring'
import type { WritingRecordListItem } from '@/lib/writing-records'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCriterionScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const match = value.match(/\d+(?:\.\d+)?/)
    if (match) return Number(match[0])
  }
  if (isObject(value)) {
    const obj = value as Record<string, unknown>
    if ('score' in obj) return parseCriterionScore(obj.score)
    if ('band' in obj) return parseCriterionScore(obj.band)
    if ('value' in obj) return parseCriterionScore(obj.value)
  }
  return null
}

function extractCriterionFromEvaluation(
  evaluation: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!evaluation) return null
  for (const key of keys) {
    const direct = evaluation[key]
    const score = parseCriterionScore(direct)
    if (score !== null) return formatScore(score)

    const criteria = evaluation.criteria
    if (isObject(criteria)) {
      const nested = (criteria as Record<string, unknown>)[key]
      const nestedScore = parseCriterionScore(nested)
      if (nestedScore !== null) return formatScore(nestedScore)
    }

    const scores = evaluation.scores
    if (isObject(scores)) {
      const fromScores = (scores as Record<string, unknown>)[key]
      const scoresVal = parseCriterionScore(fromScores)
      if (scoresVal !== null) return formatScore(scoresVal)
    }

    const bandScores = evaluation.bandScores
    if (isObject(bandScores)) {
      const fromBand = (bandScores as Record<string, unknown>)[key]
      const bandVal = parseCriterionScore(fromBand)
      if (bandVal !== null) return formatScore(bandVal)
    }
  }
  return null
}

function formatScore(value: number): string {
  return value % 1 === 0 ? value.toFixed(1) : String(value)
}

function extractOverallBand(evaluation: Record<string, unknown> | null | undefined): string | null {
  if (!evaluation) return null
  const candidates = [
    evaluation.overallBand,
    evaluation.bandEstimate,
    evaluation.overall_band,
    evaluation.overall,
    isObject(evaluation.scores) ? (evaluation.scores as Record<string, unknown>).overall : undefined,
    isObject(evaluation.bandScores) ? (evaluation.bandScores as Record<string, unknown>).overall : undefined
  ]
  for (const candidate of candidates) {
    const parsed = parseBand(candidate as string | number | null | undefined)
    if (parsed !== null) return formatScore(parsed)
  }
  return null
}

function extractSummary(evaluation: Record<string, unknown> | null | undefined): string | null {
  if (!evaluation) return null
  if (typeof evaluation.summary === 'string' && evaluation.summary.trim()) return evaluation.summary
  if (typeof evaluation.overallFeedback === 'string' && evaluation.overallFeedback.trim()) return evaluation.overallFeedback
  return null
}

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select([
      'id',
      'task_type',
      'title',
      'submitted_at',
      'processing_status',
      'request_id',
      'evaluation',
      'evaluation->>summary',
      "record_data->>'studyPlanTaskId'"
    ].join(', '))
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(50)

  if (error) {
    return json({ success: false, message: '历史记录读取失败' }, { status: 500 })
  }

  const records: WritingRecordListItem[] = (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>
    const evaluation = isObject(r.evaluation) ? r.evaluation as Record<string, unknown> : null

    return {
      id: r.id as string,
      taskType: r.task_type as string,
      title: r.title as string,
      submittedAt: r.submitted_at as string,
      processingStatus: r.processing_status as string,
      requestId: r.request_id as string | null,
      overallBand: extractOverallBand(evaluation),
      summary: (typeof r.summary === 'string' && r.summary.trim()) ? r.summary : extractSummary(evaluation),
      taScore: extractCriterionFromEvaluation(evaluation, 'taskAchievement', 'task_achievement'),
      trScore: extractCriterionFromEvaluation(evaluation, 'taskResponse', 'task_response'),
      ccScore: extractCriterionFromEvaluation(evaluation, 'coherenceCohesion', 'coherence_cohesion'),
      lrScore: extractCriterionFromEvaluation(evaluation, 'lexicalResource', 'lexical_resource'),
      graScore: extractCriterionFromEvaluation(evaluation, 'grammaticalRangeAccuracy', 'grammatical_range_accuracy'),
      studyPlanTaskId: (r.studyPlanTaskId as string) || null
    }
  })

  return json({ success: true, records })
}
