import {
  CriterionKeys,
  Task1CriterionKeys,
  Task2CriterionKeys,
  type CriterionKey,
  type EssayEvaluation,
  type WritingRecord,
  type WritingTaskType
} from '@/lib/writing-record-types'

export function parseBand(score: string | number | null | undefined) {
  if (typeof score === 'number') {
    return Number.isFinite(score) ? score : null
  }
  if (!score) return null
  const match = String(score).match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export function roundToHalfBand(value: number) {
  if (!Number.isFinite(value)) return 0

  const clamped = Math.min(9, Math.max(0, value))
  const whole = Math.floor(clamped)
  const fraction = clamped - whole

  if (fraction < 0.25) return whole
  if (fraction < 0.75) return whole + 0.5
  return Math.min(9, whole + 1)
}

export function calculateEssayOverallBand(scores: Array<string | number | null | undefined>) {
  const parsed = scores.map(parseBand)
  if (parsed.length !== 4 || parsed.some((score) => score === null)) return null

  const validScores = parsed as number[]
  return roundToHalfBand(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
}

export function formatBandNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const rounded = roundToHalfBand(value)
  return rounded.toFixed(rounded % 1 === 0 ? 0 : 1)
}

export function scoreFromEvaluation(evaluation: Pick<EssayEvaluation, 'overallBand' | 'bandEstimate'> | undefined) {
  return parseBand(evaluation?.overallBand ?? evaluation?.bandEstimate)
}

export function calculateWritingOverall(task1Band: number, task2Band: number) {
  return roundToHalfBand((task1Band + task2Band * 2) / 3)
}

export function averageBands(values: Array<number | null | undefined>) {
  const scores = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

export function weightedCriterionScore(task1Score: string | undefined, task2Score: string | undefined) {
  const first = parseBand(task1Score)
  const second = parseBand(task2Score)
  if (first === null && second === null) return undefined
  if (first === null) return formatBandNumber(second)
  if (second === null) return formatBandNumber(first)
  return formatBandNumber(calculateWritingOverall(first, second))
}

export function criterionKeysForTask(taskType: WritingTaskType): CriterionKey[] {
  if (taskType === 'task1') return [...Task1CriterionKeys]
  if (taskType === 'task2') return [...Task2CriterionKeys]
  return [...CriterionKeys]
}

export function collectTaskScores(records: WritingRecord[], taskType: Exclude<WritingTaskType, 'mock'>) {
  return records.flatMap((record) => {
    if (record.taskType === taskType) {
      const score = scoreFromEvaluation(record.evaluation)
      return score === null ? [] : [score]
    }
    const component = record.components?.[taskType]
    const score = scoreFromEvaluation(component?.evaluation)
    return score === null ? [] : [score]
  })
}

export function averageTaskBand(records: WritingRecord[], taskType: Exclude<WritingTaskType, 'mock'>) {
  return averageBands(collectTaskScores(records, taskType))
}

export function isExpiredAt(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return false
  const time = new Date(expiresAt).getTime()
  return Number.isFinite(time) && time <= now
}
