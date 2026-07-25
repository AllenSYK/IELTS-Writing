import { parseBand, roundToHalfBand } from '@/lib/ielts-scoring'

export type StudyPlanAnalysisRow = {
  task_type: string
  submitted_at: string
  evaluation: unknown
}

function evaluationBand(value: unknown) {
  let evaluation = value
  if (typeof evaluation === 'string') {
    try {
      evaluation = JSON.parse(evaluation)
    } catch {
      return null
    }
  }
  if (!evaluation || typeof evaluation !== 'object') return null
  const record = evaluation as Record<string, unknown>
  return parseBand(
    (record.overallBand ?? record.bandEstimate ?? record.overall_band ?? record.overall) as string | number | null | undefined
  )
}

function average(values: number[]) {
  if (values.length === 0) return null
  return roundToHalfBand(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function buildLiveStudyPlanAnalysis(
  rows: StudyPlanAnalysisRow[],
  manualAverageScore?: number | null,
  now = new Date()
) {
  const records = rows
    .map((row) => ({ ...row, band: evaluationBand(row.evaluation) }))
    .filter((row): row is StudyPlanAnalysisRow & { band: number } => row.band !== null)
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
  const task1 = records.filter((row) => row.task_type === 'task1')
  const task2 = records.filter((row) => row.task_type === 'task2')
  const cutoff7 = now.getTime() - 7 * 86_400_000
  const cutoff30 = now.getTime() - 30 * 86_400_000
  const overall = manualAverageScore ?? average(records.map((row) => row.band))

  return {
    counts: {
      total: records.length,
      task1: task1.length,
      task2: task2.length,
      fullTests: records.filter((row) => row.task_type === 'mock').length,
      last7Days: records.filter((row) => new Date(row.submitted_at).getTime() >= cutoff7).length,
      last30Days: records.filter((row) => new Date(row.submitted_at).getTime() >= cutoff30).length
    },
    scores: {
      overall,
      recent5: average(records.slice(0, 5).map((row) => row.band)),
      recent10: average(records.slice(0, 10).map((row) => row.band)),
      task1: average(task1.map((row) => row.band)),
      task2: average(task2.map((row) => row.band)),
      highest: records.length > 0 ? Math.max(...records.map((row) => row.band)) : null,
      latest: records[0]?.band ?? null
    },
    recordCount: records.length,
    latestRecordAt: records[0]?.submitted_at ?? null,
    updatedAt: now.toISOString()
  }
}
