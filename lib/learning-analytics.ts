import { averageTaskBand, parseBand, roundToHalfBand } from '@/lib/ielts-scoring'
import {
  averageScore,
  scoreValue,
  type CriterionKey,
  type EssayAnnotation,
  type EssayEvaluation,
  type SentenceError,
  type WritingRecord
} from '@/lib/writing-records'
import type { UserProfile } from '@/lib/user-profile'

export type RadarMetricKey = 'task' | 'coherenceCohesion' | 'lexicalResource' | 'grammaticalRangeAccuracy'
export type ErrorBucketKey = 'grammar' | 'lexical' | 'cohesion' | 'task'

export type EvaluationAttempt = {
  taskType: 'task1' | 'task2' | 'mock'
  evaluation: EssayEvaluation
}

export type RadarMetric = {
  key: RadarMetricKey
  label: string
  shortLabel: string
  current: number | null
  target: number
  count: number
}

export type ErrorDistributionItem = {
  key: ErrorBucketKey
  label: string
  count: number
  percent: number
  color: string
}

export type PracticeRecommendation = {
  key: ErrorBucketKey
  title: string
  reason: string
  duration: string
  difficulty: '基础' | '中等' | '进阶'
  status: '未完成'
  href: string
}

export type GoalStatus = {
  currentAverage: number | null
  targetOverall: number
  distance: number | null
  recentScore: number | null
  task1Average: number | null
  task2Average: number | null
  progressPercent: number
  weeklyCompleted: number
  weeklyTarget: number
  focusDimensions: string[]
}

const radarMeta: Array<{ key: RadarMetricKey; label: string; shortLabel: string }> = [
  { key: 'task', label: 'Task Achievement / Task Response', shortLabel: '任务完成' },
  { key: 'coherenceCohesion', label: 'Coherence and Cohesion', shortLabel: '连贯衔接' },
  { key: 'lexicalResource', label: 'Lexical Resource', shortLabel: '词汇资源' },
  { key: 'grammaticalRangeAccuracy', label: 'Grammatical Range and Accuracy', shortLabel: '语法准确' }
]

const errorMeta: Record<ErrorBucketKey, { label: string; color: string; topic: string }> = {
  grammar: { label: '语法', color: '#ba1a1a', topic: '语法准确性' },
  lexical: { label: '词汇', color: '#d06b00', topic: '词汇资源' },
  cohesion: { label: '衔接', color: '#0058bc', topic: '结构与衔接' },
  task: { label: '任务回应', color: '#6750a4', topic: '任务回应' }
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function collectEvaluationAttempts(records: WritingRecord[]): EvaluationAttempt[] {
  return records.flatMap<EvaluationAttempt>((record) => {
    if (record.taskType === 'mock' && record.components) {
      return (['task1', 'task2'] as const).flatMap((taskType) => {
        const component = record.components?.[taskType]
        return component?.evaluation ? [{ taskType, evaluation: component.evaluation }] : []
      })
    }
    if (record.taskType === 'task1' || record.taskType === 'task2') {
      return [{ taskType: record.taskType, evaluation: record.evaluation }]
    }
    return [{ taskType: 'mock', evaluation: record.evaluation }]
  })
}

function criterionScore(evaluation: EssayEvaluation, key: CriterionKey) {
  return scoreValue(evaluation.criteria?.[key]?.score || evaluation[key]?.score)
}

function taskScore(attempt: EvaluationAttempt) {
  if (attempt.taskType === 'task1') return criterionScore(attempt.evaluation, 'taskAchievement')
  if (attempt.taskType === 'task2') return criterionScore(attempt.evaluation, 'taskResponse')
  const taskAchievement = criterionScore(attempt.evaluation, 'taskAchievement')
  const taskResponse = criterionScore(attempt.evaluation, 'taskResponse')
  const scores = [taskAchievement, taskResponse].filter((score): score is number => score !== null)
  return scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null
}

function scoreForMetric(attempt: EvaluationAttempt, key: RadarMetricKey) {
  if (key === 'task') return taskScore(attempt)
  return criterionScore(attempt.evaluation, key)
}

function targetForMetric(profile: UserProfile, key: RadarMetricKey) {
  if (key === 'task') return (profile.task1Target + profile.task2Target) / 2
  return profile.targetOverall
}

export function buildRadarMetrics(records: WritingRecord[], profile: UserProfile): RadarMetric[] {
  const attempts = collectEvaluationAttempts(records)
  return radarMeta.map((metric) => {
    const scores = attempts
      .map((attempt) => scoreForMetric(attempt, metric.key))
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
    return {
      ...metric,
      current: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      target: targetForMetric(profile, metric.key),
      count: scores.length
    }
  })
}

function bucketFromAnnotation(annotation: EssayAnnotation): ErrorBucketKey {
  if (annotation.category === 'task-response') return 'task'
  if (annotation.category === 'coherence' || annotation.category === 'cohesion' || annotation.category === 'unclear-expression') return 'cohesion'
  if (annotation.category === 'vocabulary' || annotation.category === 'collocation' || annotation.category === 'style' || annotation.category === 'repetition') {
    return 'lexical'
  }
  return 'grammar'
}

function bucketFromSentenceError(error: SentenceError): ErrorBucketKey {
  if (error.category === 'task') return 'task'
  if (error.category === 'cohesion' || error.category === 'other') return 'cohesion'
  if (error.category === 'lexical') return 'lexical'
  return 'grammar'
}

function collectEvaluationErrors(evaluation: EssayEvaluation) {
  const annotations = evaluation.annotations ?? []
  if (annotations.length > 0) return annotations.map(bucketFromAnnotation)
  return (evaluation.sentenceAnnotations ?? evaluation.sentenceErrors ?? []).map(bucketFromSentenceError)
}

export function buildErrorDistribution(records: WritingRecord[]): ErrorDistributionItem[] {
  const counts: Record<ErrorBucketKey, number> = {
    grammar: 0,
    lexical: 0,
    cohesion: 0,
    task: 0
  }

  for (const attempt of collectEvaluationAttempts(records)) {
    for (const bucket of collectEvaluationErrors(attempt.evaluation)) {
      counts[bucket] += 1
    }
  }

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return (Object.keys(counts) as ErrorBucketKey[]).map((key) => ({
    key,
    label: errorMeta[key].label,
    count: counts[key],
    percent: total === 0 ? 0 : clampPercent((counts[key] / total) * 100),
    color: errorMeta[key].color
  }))
}

export function buildGoalStatus(
  records: WritingRecord[],
  profile: UserProfile,
  options: { currentAverageOverride?: number | null } = {}
): GoalStatus {
  const calculatedAverage = averageScore(records)
  const selectedAverage = options.currentAverageOverride ?? calculatedAverage
  const currentAverage = selectedAverage === null ? null : roundToHalfBand(selectedAverage)
  const rawTask1Average = averageTaskBand(records, 'task1')
  const rawTask2Average = averageTaskBand(records, 'task2')
  const task1Average = rawTask1Average === null ? null : roundToHalfBand(rawTask1Average)
  const task2Average = rawTask2Average === null ? null : roundToHalfBand(rawTask2Average)
  const recentScore = records[0] ? parseBand(records[0].evaluation.overallBand || records[0].evaluation.bandEstimate) : null
  const weeklyCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weeklyCompleted = records.filter((record) => new Date(record.submittedAt).getTime() >= weeklyCutoff).length
  const metrics = buildRadarMetrics(records, profile)
  const focusDimensions = metrics
    .filter((metric) => metric.current !== null && metric.current + 0.24 < metric.target)
    .sort((a, b) => (a.current ?? 9) - (b.current ?? 9))
    .slice(0, 2)
    .map((metric) => metric.label)

  return {
    currentAverage,
    targetOverall: profile.targetOverall,
    distance: currentAverage === null ? null : Math.max(0, profile.targetOverall - currentAverage),
    recentScore,
    task1Average,
    task2Average,
    progressPercent: currentAverage === null ? 0 : clampPercent((currentAverage / profile.targetOverall) * 100),
    weeklyCompleted,
    weeklyTarget: profile.weeklyPracticeTarget,
    focusDimensions
  }
}

export function buildPracticeRecommendations(records: WritingRecord[], limit = 3): PracticeRecommendation[] {
  const recentRecords = records.slice(0, 3)
  const distribution = buildErrorDistribution(recentRecords.length > 0 ? recentRecords : records)
  return distribution
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => ({
      key: item.key,
      title: recommendationTitle(item.key),
      reason: `最近${Math.max(1, recentRecords.length || records.length)}篇作文中出现${item.count}次${errorMeta[item.key].label}相关问题。`,
      duration: item.count >= 5 ? '20分钟' : '15分钟',
      difficulty: item.count >= 7 ? '进阶' : item.count >= 3 ? '中等' : '基础',
      status: '未完成',
      href: `/practice?focus=${item.key}`
    }))
}

function recommendationTitle(key: ErrorBucketKey) {
  if (key === 'grammar') return '练习主题：主谓一致与句式准确性'
  if (key === 'lexical') return '练习主题：词汇替换与搭配'
  if (key === 'cohesion') return '练习主题：段落衔接与逻辑推进'
  return '练习主题：任务回应与观点展开'
}
