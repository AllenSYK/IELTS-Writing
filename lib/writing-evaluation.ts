import {
  calculateWritingOverall,
  formatBandNumber,
  parseBand,
  weightedCriterionScore
} from '@/lib/ielts-scoring'
import { normalizeEvaluation } from '@/lib/writing-records'
import type {
  CriterionKey,
  CriterionScore,
  EssayAnnotation,
  EssayEvaluation
} from '@/lib/writing-record-types'

export type EssayEvaluationRequest = {
  essay: string
  taskType: 'task1' | 'task2'
  prompt: string
  questionType: string
}

export type EvaluationErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'authentication'
  | 'license'
  | 'configuration'
  | 'api-key'
  | 'model'
  | 'quota'
  | 'rate-limit'
  | 'service'
  | 'invalid-response'
  | 'unknown'

export class WritingEvaluationError extends Error {
  readonly kind: EvaluationErrorKind

  constructor(kind: EvaluationErrorKind, message: string) {
    super(message)
    this.name = 'WritingEvaluationError'
    this.kind = kind
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function providerErrorKind(status: number, code: string | undefined): EvaluationErrorKind {
  if (status === 401) return 'authentication'
  if (code === 'AI_KEY_MISSING') return 'configuration'
  if (code === 'ai_api_key_invalid') return 'api-key'
  if (code === 'ai_model_or_endpoint_invalid') return 'model'
  if (code === 'ai_quota_exhausted') return 'quota'
  if (status === 403) return 'license'
  if (status === 429 || code === 'ai_rate_limited') return 'rate-limit'
  if (status === 504 || code === 'ai_request_timeout') return 'timeout'
  if (code === 'ai_network_error') return 'network'
  if (
    code === 'ai_json_parse_error' ||
    code === 'ai_scoring_schema_error' ||
    code === 'ai_scoring_incomplete'
  ) {
    return 'invalid-response'
  }
  if (status >= 500) return 'service'
  return 'unknown'
}

export function evaluationErrorMessage(error: unknown) {
  if (!(error instanceof WritingEvaluationError)) {
    return { title: '批改失败', message: '批改失败，请稍后重试。' }
  }

  const messages: Record<EvaluationErrorKind, { title: string; message: string }> = {
    cancelled: { title: '已取消', message: '批改已取消。' },
    timeout: { title: '响应超时', message: '批改服务响应超时，请稍后重试。' },
    network: { title: '网络错误', message: '网络连接失败，作文已保存在本地，请检查网络后重试。' },
    authentication: { title: '请先登录', message: '请先登录后再使用批改功能。' },
    license: { title: '需要激活', message: '请先激活账号后再使用批改功能。' },
    configuration: { title: '服务未配置', message: '服务端尚未配置 AI_API_KEY，请在 Vercel 环境变量中配置。' },
    'api-key': { title: '密钥无效', message: '服务端 API Key 无效，请检查 Vercel 环境变量 AI_API_KEY。' },
    model: { title: '模型配置错误', message: '模型名称或 API Base URL 不正确。' },
    quota: { title: '模型额度已耗尽', message: '模型服务额度已耗尽，请充值或更换有额度的 API Key。' },
    'rate-limit': { title: '请求限制', message: '请求过于频繁，请等待一分钟后重试。' },
    service: { title: '服务繁忙', message: '批改服务繁忙，请稍后重试。' },
    'invalid-response': { title: '格式异常', message: '批改结果解析失败，请重新提交。' },
    unknown: { title: '批改失败', message: '批改失败，请稍后重试。' }
  }
  
  // Log technical error for debugging
  if (error.kind === 'unknown') {
    console.error('[evaluation-error]', {
      kind: error.kind,
      message: error.message,
      name: error.name,
    })
  }
  
  return messages[error.kind]
}

export async function requestEssayEvaluation(
  payload: EssayEvaluationRequest,
  {
    signal,
    timeoutMs
  }: {
    signal?: AbortSignal
    timeoutMs: number
  }
) {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort('cancelled')
  signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeoutId = globalThis.setTimeout(() => controller.abort('timeout'), timeoutMs)

  try {
    const response = await fetch('/api/ai/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const raw: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const code = isRecord(raw) && typeof raw.error === 'string' ? raw.error : undefined
      const message = isRecord(raw) && typeof raw.message === 'string'
        ? raw.message
        : '批改失败，请稍后重试。'
      throw new WritingEvaluationError(providerErrorKind(response.status, code), message)
    }

    const evaluation = normalizeEvaluation(raw)
    if (!evaluation) {
      throw new WritingEvaluationError('invalid-response', '批改结果缺少必要字段。')
    }
    return evaluation
  } catch (error) {
    if (error instanceof WritingEvaluationError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      const kind = signal?.aborted ? 'cancelled' : 'timeout'
      throw new WritingEvaluationError(kind, kind === 'cancelled' ? '批改已取消。' : '批改服务响应超时。')
    }
    if (error instanceof TypeError) {
      throw new WritingEvaluationError('network', '网络连接失败。')
    }
    throw new WritingEvaluationError('unknown', error instanceof Error ? error.message : '批改失败。')
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

function criterionFrom(evaluation: EssayEvaluation, key: CriterionKey) {
  return evaluation.criteria?.[key] ?? evaluation[key]
}

function weightedCriterion(
  task1: EssayEvaluation,
  task2: EssayEvaluation,
  key: Extract<CriterionKey, 'coherenceCohesion' | 'lexicalResource' | 'grammaticalRangeAccuracy'>
): CriterionScore {
  const first = criterionFrom(task1, key)
  const second = criterionFrom(task2, key)
  return {
    score: weightedCriterionScore(first?.score, second?.score) || second?.score || first?.score || '—',
    feedback: [`Task 1: ${first?.feedback || '未返回'}`, `Task 2: ${second?.feedback || '未返回'}`].join('\n')
  }
}

function offsetAnnotations(annotations: EssayAnnotation[] | undefined, offset: number) {
  return (annotations ?? []).map((annotation) => ({
    ...annotation,
    start: annotation.unresolved ? annotation.start : annotation.start + offset,
    end: annotation.unresolved ? annotation.end : annotation.end + offset
  }))
}

export function combineMockEvaluation(
  task1: EssayEvaluation,
  task2: EssayEvaluation,
  task1Essay = ''
): EssayEvaluation {
  const task1Band = parseBand(task1.overallBand || task1.bandEstimate)
  const task2Band = parseBand(task2.overallBand || task2.bandEstimate)
  if (task1Band === null || task2Band === null) {
    throw new WritingEvaluationError('invalid-response', '模考评分结果无法计算，请重新批改。')
  }

  const overall = formatBandNumber(calculateWritingOverall(task1Band, task2Band))
  const taskAchievement = criterionFrom(task1, 'taskAchievement')
  const taskResponse = criterionFrom(task2, 'taskResponse')
  const criteria: Partial<Record<CriterionKey, CriterionScore>> = {
    taskAchievement,
    taskResponse,
    coherenceCohesion: weightedCriterion(task1, task2, 'coherenceCohesion'),
    lexicalResource: weightedCriterion(task1, task2, 'lexicalResource'),
    grammaticalRangeAccuracy: weightedCriterion(task1, task2, 'grammaticalRangeAccuracy')
  }
  const annotations = [
    ...offsetAnnotations(task1.annotations, 'Task 1\n'.length),
    ...offsetAnnotations(task2.annotations, `Task 1\n${task1Essay}\n\nTask 2\n`.length)
  ]

  return {
    overallBand: overall,
    bandEstimate: overall,
    taskAchievement,
    taskResponse,
    coherenceCohesion: criteria.coherenceCohesion,
    lexicalResource: criteria.lexicalResource,
    grammaticalRangeAccuracy: criteria.grammaticalRangeAccuracy,
    criteria,
    summary: `完整模考预估分数为 ${overall}。Task 2 按约两倍权重计入总分。`,
    overallFeedback: `完整模考预估分数为 ${overall}。Task 2 按约两倍权重计入总分。`,
    strengths: [...(task1.strengths ?? []), ...(task2.strengths ?? [])].slice(0, 6),
    weaknesses: [...(task1.weaknesses ?? []), ...(task2.weaknesses ?? [])].slice(0, 6),
    annotations,
    annotationVersion: Math.max(task1.annotationVersion ?? 1, task2.annotationVersion ?? 1),
    sentenceAnnotations: [...(task1.sentenceAnnotations ?? task1.sentenceErrors ?? []), ...(task2.sentenceAnnotations ?? task2.sentenceErrors ?? [])],
    sentenceErrors: [...(task1.sentenceErrors ?? []), ...(task2.sentenceErrors ?? [])],
    suggestions: [...(task1.nextSteps ?? task1.suggestions ?? []), ...(task2.nextSteps ?? task2.suggestions ?? [])].slice(0, 6),
    correctedEssay: `Task 1\n${task1.correctedEssay || task1.improvedEssay || ''}\n\nTask 2\n${task2.correctedEssay || task2.improvedEssay || ''}`,
    improvedEssay: `Task 1\n${task1.improvedEssay || ''}\n\nTask 2\n${task2.improvedEssay || ''}`,
    revisedEssay: `Task 1\n${task1.improvedEssay || ''}\n\nTask 2\n${task2.improvedEssay || ''}`,
    modelEssay: `Task 1\n${task1.modelEssay || ''}\n\nTask 2\n${task2.modelEssay || ''}`,
    nextSteps: [...(task1.nextSteps ?? []), ...(task2.nextSteps ?? [])].slice(0, 6),
    feedback: [`Task 1: ${task1.summary || task1.overallFeedback || ''}`, `Task 2: ${task2.summary || task2.overallFeedback || ''}`].filter(Boolean),
    annotationWarnings: [...(task1.annotationWarnings ?? []), ...(task2.annotationWarnings ?? [])],
    provider: task2.provider || task1.provider,
    model: task2.model || task1.model
  }
}
