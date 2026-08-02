import { z } from 'zod'
import { prepareTask1ChartSpec, type Task1ChartKind } from '@/lib/task1-chart-schema'
import { readStorageValue, userScopedStorageKey } from '@/lib/user-storage'
import { calculateEssayOverallBand, formatBandNumber } from '@/lib/ielts-scoring'
import {
  CriterionKeys,
  EssayAnnotationCategories,
  EssayAnnotationSeverities,
  EssayScoreCriteria,
  LocalDeviceStorageKey,
  MistakeBookStorageKey,
  SentenceErrorLabels,
  TaskTypeLabels,
  WritingRecordsDedupeMigrationKey,
  WritingRecordsStorageKey,
  WritingRecordsUpdatedEvent,
  type AcceptedAnnotationChange,
  type CriterionKey,
  type CriterionScore,
  type EssayAnnotation,
  type EssayAnnotationCategory,
  type EssayAnnotationSeverity,
  type EssayEvaluation,
  type EssayScoreCriterion,
  type SentenceError,
  type WritingRecord
} from '@/lib/writing-record-types'

export * from '@/lib/writing-record-types'

const StoredWritingRecordSchema = z.object({
  id: z.string(),
  requestId: z.string().optional(),
  ownerUserId: z.string().optional(),
  deviceId: z.string().optional(),
  taskType: z.enum(['task1', 'task2', 'mock']),
  title: z.string(),
  prompt: z.string(),
  essay: z.string(),
  originalEssay: z.string().optional(),
  submittedAt: z.string(),
  durationSeconds: z.number(),
  wordCount: z.number(),
  evaluation: z.unknown(),
  acceptedChanges: z.unknown().optional(),
  annotationVersion: z.number().optional(),
  questionId: z.string().optional(),
  questionType: z.string().optional(),
  trainingType: z.string().optional(),
  components: z.unknown().optional(),
  chartSpec: z.unknown().optional(),
  processSpec: z.unknown().optional(),
  mapSpec: z.unknown().optional(),
  promptLead: z.string().optional(),
  promptDetail: z.string().optional(),
  imageUrl: z.string().optional(),
  questionSource: z.literal('user_upload').optional(),
  uploadedTaskId: z.string().optional(),
  studyPlanTaskId: z.string().optional()
}).passthrough()

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function chartKindForQuestionType(questionType: unknown): Task1ChartKind | undefined {
  if (typeof questionType !== 'string') return undefined
  const map: Record<string, Task1ChartKind> = {
    line_graph: 'line',
    line_chart: 'line',
    bar_chart: 'bar',
    pie_chart: 'pie',
    table: 'table',
    mixed_charts: 'mixed'
  }
  return map[questionType]
}

function normalizeStoredChartSpec(value: unknown, questionType?: unknown): Record<string, unknown> | undefined {
  if (!isObject(value)) return undefined
  const prepared = prepareTask1ChartSpec(value, chartKindForQuestionType(questionType))
  return prepared.success ? prepared.data as Record<string, unknown> : undefined
}

function isEssayAnnotationCategory(value: unknown): value is EssayAnnotationCategory {
  return typeof value === 'string' && EssayAnnotationCategories.includes(value as EssayAnnotationCategory)
}

function normalizeLegacyAnnotationCategory(value: unknown): EssayAnnotationCategory {
  if (isEssayAnnotationCategory(value)) return value
  if (value === 'lexical') return 'vocabulary'
  if (value === 'task') return 'task-response'
  if (value === 'cohesion') return 'cohesion'
  if (value === 'other') return 'unclear-expression'
  return 'grammar'
}

function normalizeSeverity(value: unknown): EssayAnnotationSeverity {
  return typeof value === 'string' && EssayAnnotationSeverities.includes(value as EssayAnnotationSeverity)
    ? value as EssayAnnotationSeverity
    : 'medium'
}

function normalizeScoreCriterion(value: unknown, category: EssayAnnotationCategory): EssayScoreCriterion {
  if (typeof value === 'string' && EssayScoreCriteria.includes(value as EssayScoreCriterion)) {
    return value as EssayScoreCriterion
  }
  if (category === 'task-response') return 'Task Response'
  if (category === 'coherence' || category === 'cohesion' || category === 'unclear-expression' || category === 'repetition') {
    return 'Coherence and Cohesion'
  }
  if (category === 'vocabulary' || category === 'collocation' || category === 'style') return 'Lexical Resource'
  return 'Grammatical Range and Accuracy'
}

function normalizeEssayAnnotation(value: unknown, index: number): EssayAnnotation | null {
  if (!isObject(value)) return null
  // v1 records stored sentence errors as original/correction/suggested/errorType.
  const originalText = typeof value.originalText === 'string'
    ? value.originalText
    : typeof value.original === 'string'
      ? value.original
      : ''
  if (!originalText) return null

  const category = normalizeLegacyAnnotationCategory(value.category || value.errorType)
  const replacement = typeof value.replacement === 'string'
    ? value.replacement
    : typeof value.correction === 'string'
      ? value.correction
      : typeof value.suggested === 'string'
        ? value.suggested
        : undefined
  const start = typeof value.start === 'number' && Number.isFinite(value.start) ? Math.trunc(value.start) : -1
  const end = typeof value.end === 'number' && Number.isFinite(value.end) ? Math.trunc(value.end) : start + originalText.length
  const explanationZh = typeof value.explanationZh === 'string'
    ? value.explanationZh
    : typeof value.chineseExplanation === 'string'
      ? value.chineseExplanation
      : typeof value.explanation === 'string'
        ? value.explanation
        : '暂无中文解释。'
  const suggestion = typeof value.suggestion === 'string'
    ? value.suggestion
    : replacement
      ? `建议改为：${replacement}`
      : explanationZh
  const generatedId = stableHash([
    start,
    end,
    category,
    originalText,
    replacement || '',
    typeof value.blockIndex === 'number' ? value.blockIndex : index
  ].join('|'))

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `annotation-${generatedId}`,
    start,
    end,
    originalText,
    replacement,
    category,
    severity: normalizeSeverity(value.severity),
    scoreCriterion: normalizeScoreCriterion(value.scoreCriterion, category),
    explanationZh,
    explanationEn: typeof value.explanationEn === 'string' ? value.explanationEn : undefined,
    impactOnScore: typeof value.impactOnScore === 'string' ? value.impactOnScore : '该问题会影响对应评分维度的准确性或清晰度。',
    suggestion,
    unresolved: Boolean(value.unresolved) || start < 0 || end <= start,
    blockIndex: typeof value.blockIndex === 'number' && Number.isFinite(value.blockIndex)
      ? Math.max(0, Math.trunc(value.blockIndex))
      : undefined,
    blockId: typeof value.blockId === 'string' && value.blockId.trim()
      ? value.blockId
      : undefined
  }
}

function normalizeCriterionScore(value: unknown): CriterionScore | undefined {
  if (!isObject(value)) return undefined
  const rawScore = value.score
  const score = typeof rawScore === 'string'
    ? rawScore
    : typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? String(rawScore)
      : ''
  if (!score || typeof value.feedback !== 'string') return undefined

  return {
    score,
    feedback: value.feedback,
    evidence: Array.isArray(value.evidence)
      ? value.evidence.filter((item): item is string => typeof item === 'string')
      : undefined,
    whyNotHigher: typeof value.whyNotHigher === 'string' ? value.whyNotHigher : undefined
  }
}

function normalizeAcceptedChange(value: unknown): AcceptedAnnotationChange | null {
  if (!isObject(value)) return null
  if (
    typeof value.annotationId !== 'string' ||
    typeof value.originalText !== 'string' ||
    typeof value.replacement !== 'string' ||
    typeof value.acceptedAt !== 'string'
  ) {
    return null
  }
  const start = typeof value.start === 'number' && Number.isFinite(value.start) ? Math.trunc(value.start) : -1
  const end = typeof value.end === 'number' && Number.isFinite(value.end) ? Math.trunc(value.end) : -1
  return {
    annotationId: value.annotationId,
    start,
    end,
    originalText: value.originalText,
    replacement: value.replacement,
    acceptedAt: value.acceptedAt
  }
}

function isSentenceError(value: unknown): value is SentenceError {
  if (!isObject(value)) return false
  return (
    typeof value.original === 'string' &&
    typeof value.correction === 'string' &&
    typeof value.explanation === 'string' &&
    typeof value.category === 'string'
  )
}

function normalizeSentenceError(value: SentenceError): SentenceError {
  return {
    ...value,
    errorType: value.errorType || SentenceErrorLabels[value.category] || '其他问题',
    chineseExplanation: value.chineseExplanation || value.explanation
  }
}

export function normalizeEvaluation(value: unknown): EssayEvaluation | null {
  if (!isObject(value)) return null
  // v1 records used bandEstimate, overallFeedback, sentenceErrors, suggestions and revisedEssay.
  const criteria = isObject(value.criteria) ? { ...value.criteria } : {}

  for (const key of CriterionKeys) {
    if (!criteria[key] && isObject(value[key])) {
      criteria[key] = value[key]
    }
  }

  const rawBandEstimate = value.bandEstimate ?? value.overallBand ?? value.band ?? value.score
  const bandEstimate = typeof rawBandEstimate === 'string'
    ? rawBandEstimate
    : typeof rawBandEstimate === 'number' && Number.isFinite(rawBandEstimate)
      ? String(rawBandEstimate)
      : ''
  if (!bandEstimate) return null

  const sentenceAnnotations = Array.isArray(value.sentenceAnnotations)
    ? value.sentenceAnnotations.filter(isSentenceError).map(normalizeSentenceError)
    : Array.isArray(value.sentenceErrors)
      ? value.sentenceErrors.filter(isSentenceError).map(normalizeSentenceError)
      : []
  const annotations = Array.isArray(value.annotations)
    ? value.annotations
      .map(normalizeEssayAnnotation)
      .filter((annotation): annotation is EssayAnnotation => annotation !== null)
    : []
  const feedback = isStringArray(value.feedback)
    ? value.feedback
    : typeof value.summary === 'string' && value.summary.trim()
      ? [value.summary]
      : []

  const taskAchievement = normalizeCriterionScore(criteria.taskAchievement)
  const taskResponse = normalizeCriterionScore(criteria.taskResponse)
  const coherenceCohesion = normalizeCriterionScore(criteria.coherenceCohesion)
  const lexicalResource = normalizeCriterionScore(criteria.lexicalResource)
  const grammaticalRangeAccuracy = normalizeCriterionScore(criteria.grammaticalRangeAccuracy)
  const normalizedCriteria: Partial<Record<CriterionKey, CriterionScore>> = {
    ...(taskAchievement ? { taskAchievement } : {}),
    ...(taskResponse ? { taskResponse } : {}),
    ...(coherenceCohesion ? { coherenceCohesion } : {}),
    ...(lexicalResource ? { lexicalResource } : {}),
    ...(grammaticalRangeAccuracy ? { grammaticalRangeAccuracy } : {})
  }
  const hasSingleTaskCriterion = Boolean(taskAchievement) !== Boolean(taskResponse)
  const serverOverall = typeof value.annotationVersion === 'number' && value.annotationVersion >= 2 && hasSingleTaskCriterion
    ? calculateEssayOverallBand([
        taskAchievement?.score ?? taskResponse?.score,
        coherenceCohesion?.score,
        lexicalResource?.score,
        grammaticalRangeAccuracy?.score
      ])
    : null
  const normalizedOverall = serverOverall === null ? bandEstimate : formatBandNumber(serverOverall)

  return {
    overallBand: normalizedOverall,
    bandEstimate: normalizedOverall,
    taskAchievement,
    taskResponse,
    coherenceCohesion,
    lexicalResource,
    grammaticalRangeAccuracy,
    criteria: normalizedCriteria,
    summary: typeof value.summary === 'string' ? value.summary : typeof value.overallFeedback === 'string' ? value.overallFeedback : '',
    overallFeedback: typeof value.overallFeedback === 'string' ? value.overallFeedback : typeof value.summary === 'string' ? value.summary : '',
    strengths: Array.isArray(value.strengths) ? value.strengths.filter((item): item is string => typeof item === 'string') : [],
    weaknesses: Array.isArray(value.weaknesses) ? value.weaknesses.filter((item): item is string => typeof item === 'string') : [],
    annotations,
    annotationVersion: typeof value.annotationVersion === 'number' ? value.annotationVersion : annotations.length > 0 ? 1 : undefined,
    sentenceAnnotations,
    sentenceErrors: sentenceAnnotations,
    suggestions: Array.isArray(value.suggestions)
      ? value.suggestions.filter((item): item is string => typeof item === 'string')
      : Array.isArray(value.nextSteps)
        ? value.nextSteps.filter((item): item is string => typeof item === 'string')
        : [],
    correctedEssay: typeof value.correctedEssay === 'string' ? value.correctedEssay : '',
    improvedEssay: typeof value.improvedEssay === 'string' ? value.improvedEssay : typeof value.revisedEssay === 'string' ? value.revisedEssay : '',
    revisedEssay: typeof value.revisedEssay === 'string' ? value.revisedEssay : typeof value.improvedEssay === 'string' ? value.improvedEssay : '',
    modelEssay: typeof value.modelEssay === 'string' ? value.modelEssay : '',
    annotationWarnings: Array.isArray(value.annotationWarnings)
      ? value.annotationWarnings.filter((item): item is string => typeof item === 'string')
      : [],
    nextSteps: Array.isArray(value.nextSteps) ? value.nextSteps.filter((item): item is string => typeof item === 'string') : [],
    feedback,
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    requestId: typeof value.requestId === 'string' ? value.requestId : undefined,
    _cacheHit: value._cacheHit === true
  }
}

export function createRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getLocalDeviceId() {
  if (typeof window === 'undefined') return 'server'
  const existing = readStorageValue(window.localStorage, LocalDeviceStorageKey)
  if (existing) return existing
  const id = createRecordId().replace(/^record-/, 'device-')
  window.localStorage.setItem(LocalDeviceStorageKey, id)
  return id
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function submittedAtBucket(value: string, bucketMs = 60 * 1000) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return value.slice(0, 19)
  return new Date(Math.floor(time / bucketMs) * bucketMs).toISOString().slice(0, 16)
}

export function getWritingRecordDedupKeys(record: WritingRecord) {
  const rawRecord = record as WritingRecord & Record<string, unknown>
  const keys = new Set<string>()
  const submissionId = typeof rawRecord.submissionId === 'string' ? rawRecord.submissionId.trim() : ''
  const attemptId = typeof rawRecord.attemptId === 'string' ? rawRecord.attemptId.trim() : ''
  if (submissionId) keys.add(`submission:${submissionId}`)
  if (attemptId) keys.add(`attempt:${attemptId}`)
  if (record.id.trim()) keys.add(`id:${record.id.trim()}`)

  const createdAt = typeof rawRecord.createdAt === 'string' ? rawRecord.createdAt : record.submittedAt
  const promptHash = stableHash(record.prompt.trim().replace(/\s+/g, ' ').toLowerCase())
  const essayHash = stableHash(record.essay.trim().replace(/\s+/g, ' ').toLowerCase())
  keys.add(`content:${submittedAtBucket(createdAt)}:${record.taskType}:${promptHash}:${essayHash}`)

  const contentHash = stableHash([
    record.taskType,
    record.title.trim().toLowerCase(),
    record.prompt.trim().toLowerCase(),
    record.essay.trim().replace(/\s+/g, ' ').toLowerCase()
  ].join('\n'))
  keys.add(`legacy-content:${submittedAtBucket(record.submittedAt, 5 * 60 * 1000)}:${record.taskType}:${contentHash}`)

  return [...keys]
}

function sharesDedupKey(a: WritingRecord, b: WritingRecord) {
  const aKeys = new Set(getWritingRecordDedupKeys(a))
  return getWritingRecordDedupKeys(b).some((key) => aKeys.has(key))
}

export function dedupeWritingRecords(records: WritingRecord[]) {
  const seen = new Set<string>()
  const unique: WritingRecord[] = []
  for (const record of records.slice().sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())) {
    const keys = getWritingRecordDedupKeys(record)
    if (keys.some((key) => seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
    unique.push(record)
  }
  return unique
}

function persistDedupeMigration(userId: string, records: WritingRecord[], originalCount: number) {
  if (typeof window === 'undefined') return
  const storageKey = userScopedStorageKey(WritingRecordsStorageKey, userId)
  const migrationKey = userScopedStorageKey(WritingRecordsDedupeMigrationKey, userId)
  const migrated = window.localStorage.getItem(migrationKey)
  const shouldPersist = migrated !== 'done' || records.length !== originalCount
  if (!shouldPersist) return
  window.localStorage.setItem(storageKey, JSON.stringify(records.slice(0, 100)))
  window.localStorage.setItem(migrationKey, 'done')
}

function notifyWritingRecordsUpdated(userId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WritingRecordsUpdatedEvent, { detail: { userId } }))
  }
}

export function loadWritingRecords(userId: string): WritingRecord[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(userScopedStorageKey(WritingRecordsStorageKey, userId))
  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const records = parsed
      .map(parseStoredWritingRecord)
      .filter((record): record is WritingRecord => record !== null)
      .filter((record) => record.ownerUserId === userId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    const deduped = dedupeWritingRecords(records)
    persistDedupeMigration(userId, deduped, parsed.length)
    return deduped
  } catch (error) {
    console.warn('[writing-records-read]', {
      userId,
      error: error instanceof Error ? error.name : 'unknown'
    })
    return []
  }
}

export function normalizeWritingRecord(record: WritingRecord): WritingRecord {
  const rawRecord = record as WritingRecord & Record<string, unknown>
  const acceptedChanges = Array.isArray(rawRecord.acceptedChanges)
    ? rawRecord.acceptedChanges
      .map(normalizeAcceptedChange)
      .filter((change): change is AcceptedAnnotationChange => change !== null)
    : []
  return {
    ...record,
    deviceId: record.deviceId || getLocalDeviceId(),
    originalEssay: typeof rawRecord.originalEssay === 'string' ? rawRecord.originalEssay : record.essay,
    acceptedChanges,
    annotationVersion: typeof rawRecord.annotationVersion === 'number'
      ? rawRecord.annotationVersion
      : (normalizeEvaluation(record.evaluation)?.annotationVersion ?? (acceptedChanges.length > 0 ? 1 : undefined)),
    evaluation: normalizeEvaluation(record.evaluation) || record.evaluation,
    chartSpec: normalizeStoredChartSpec(rawRecord.chartSpec, rawRecord.questionType),
    components: normalizeComponents(record.components)
  }
}

function normalizeComponents(value: unknown): WritingRecord['components'] {
  if (!isObject(value)) return undefined
  const output: WritingRecord['components'] = {}
  for (const key of ['task1', 'task2'] as const) {
    const component = value[key]
    if (!isObject(component)) continue
    const evaluation = normalizeEvaluation(component.evaluation)
    if (!evaluation) continue
    output[key] = {
      taskType: key,
      title: typeof component.title === 'string' ? component.title : TaskTypeLabels[key],
      prompt: typeof component.prompt === 'string' ? component.prompt : '',
      essay: typeof component.essay === 'string' ? component.essay : '',
      durationSeconds: typeof component.durationSeconds === 'number' ? component.durationSeconds : 0,
      wordCount: typeof component.wordCount === 'number' ? component.wordCount : countWords(typeof component.essay === 'string' ? component.essay : ''),
      evaluation,
      questionId: typeof component.questionId === 'string' ? component.questionId : undefined,
      questionType: typeof component.questionType === 'string' ? component.questionType : undefined,
      trainingType: typeof component.trainingType === 'string' ? component.trainingType : undefined,
      chartSpec: normalizeStoredChartSpec(component.chartSpec, component.questionType),
      processSpec: isObject(component.processSpec) ? component.processSpec as Record<string, unknown> : undefined,
      mapSpec: isObject(component.mapSpec) ? component.mapSpec as Record<string, unknown> : undefined,
      imageUrl: typeof component.imageUrl === 'string' ? component.imageUrl : undefined,
      promptLead: typeof component.promptLead === 'string' ? component.promptLead : undefined,
      promptDetail: typeof component.promptDetail === 'string' ? component.promptDetail : undefined,
      questionSource: component.questionSource === 'user_upload' ? 'user_upload' : undefined,
      uploadedTaskId: typeof component.uploadedTaskId === 'string' ? component.uploadedTaskId : undefined
    }
  }
  return Object.keys(output).length > 0 ? output : undefined
}

export function parseStoredWritingRecord(value: unknown): WritingRecord | null {
  const parsed = StoredWritingRecordSchema.safeParse(value)
  if (!parsed.success) return null
  const stored = parsed.data
  const evaluation = normalizeEvaluation(stored.evaluation)
  if (!evaluation) return null

  return normalizeWritingRecord({
    id: stored.id,
    requestId: stored.requestId,
    ownerUserId: stored.ownerUserId,
    deviceId: stored.deviceId || '',
    taskType: stored.taskType,
    title: stored.title,
    prompt: stored.prompt,
    essay: stored.essay,
    originalEssay: stored.originalEssay,
    submittedAt: stored.submittedAt,
    durationSeconds: stored.durationSeconds,
    wordCount: stored.wordCount,
    evaluation,
    acceptedChanges: Array.isArray(stored.acceptedChanges)
      ? stored.acceptedChanges
        .map(normalizeAcceptedChange)
        .filter((change): change is AcceptedAnnotationChange => change !== null)
      : [],
    annotationVersion: stored.annotationVersion,
    questionId: stored.questionId,
    questionType: stored.questionType,
    trainingType: stored.trainingType,
    components: normalizeComponents(stored.components),
    chartSpec: normalizeStoredChartSpec(stored.chartSpec, stored.questionType),
    processSpec: isObject(stored.processSpec) ? stored.processSpec : undefined,
    mapSpec: isObject(stored.mapSpec) ? stored.mapSpec : undefined,
    promptLead: stored.promptLead,
    promptDetail: stored.promptDetail,
    imageUrl: stored.imageUrl,
    questionSource: stored.questionSource,
    uploadedTaskId: stored.uploadedTaskId
  })
}

function canUseAccountApi() {
  return typeof window !== 'undefined' && Boolean(window.location?.origin)
}

async function requestAccountApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    },
    cache: 'no-store'
  })
  const data = await response.json().catch(() => ({})) as T & { message?: string }
  if (!response.ok) throw new Error(data.message || '账号数据请求失败')
  return data
}

export type WritingRecordListItem = {
  id: string
  taskType: string
  title: string
  submittedAt: string
  processingStatus: string
  requestId: string | null
  overallBand: string | null
  summary: string | null
  taScore: string | null
  trScore: string | null
  ccScore: string | null
  lrScore: string | null
  graScore: string | null
  studyPlanTaskId: string | null
}

export async function loadWritingRecordsLightweight(): Promise<WritingRecordListItem[]> {
  if (!canUseAccountApi()) return []
  try {
    const data = await requestAccountApi<{ records?: WritingRecordListItem[] }>('/api/user/writing-records/list')
    return data.records ?? []
  } catch {
    return []
  }
}

export const LegacyWritingRecordsMigrationKey = 'ielts-writing-writing-records-migrated-v1'

export async function migrateLegacyWritingRecordsToServer(userId: string) {
  const localRecords = loadWritingRecords(userId)
  if (!canUseAccountApi()) return { migratedCount: 0, skipped: true }

  const markerKey = userScopedStorageKey(LegacyWritingRecordsMigrationKey, userId)
  if (window.localStorage.getItem(markerKey) === 'complete') {
    return { migratedCount: 0, skipped: true }
  }
  if (localRecords.length === 0) {
    window.localStorage.setItem(markerKey, 'complete')
    return { migratedCount: 0, skipped: false }
  }

  const migrated = await Promise.allSettled(
    localRecords.map((record) => saveWritingRecordToServer(userId, record))
  )
  const failed = migrated.filter((result) => result.status === 'rejected')
  if (failed.length > 0) throw new Error(`仍有 ${failed.length} 条旧记录未迁移，请重试`)

  const uploaded = migrated
    .filter((result): result is PromiseFulfilledResult<WritingRecord> => result.status === 'fulfilled')
    .map((result) => result.value)
  replaceWritingRecords(userId, uploaded)
  window.localStorage.setItem(markerKey, 'complete')
  return { migratedCount: uploaded.length, skipped: false }
}

async function saveWritingRecordToServer(userId: string, record: WritingRecord) {
  const data = await requestAccountApi<{ record?: WritingRecord }>('/api/user/writing-records', {
    method: 'POST',
    body: JSON.stringify({
      record: {
        ...record,
        ownerUserId: userId
      }
    })
  })
  const saved = data.record ? parseStoredWritingRecord(data.record) : null
  if (!saved || saved.ownerUserId !== userId) {
    throw new Error('服务端未返回有效的写作记录')
  }
  return saved
}

export async function saveWritingRecord(userId: string, record: WritingRecord) {
  if (typeof window === 'undefined') return
  const records = loadWritingRecords(userId).filter((item) => !sharesDedupKey(item, record))
  const evaluation = normalizeEvaluation(record.evaluation) || record.evaluation
  const normalizedRecord = normalizeWritingRecord({
    ...record,
    ownerUserId: userId,
    evaluation
  })
  window.localStorage.setItem(
    userScopedStorageKey(WritingRecordsStorageKey, userId),
    JSON.stringify([
      {
        ...normalizedRecord,
        deviceId: normalizedRecord.deviceId || getLocalDeviceId(),
        originalEssay: normalizedRecord.originalEssay || normalizedRecord.essay,
        acceptedChanges: normalizedRecord.acceptedChanges || [],
        annotationVersion: normalizedRecord.annotationVersion || evaluation.annotationVersion
      },
      ...records
    ].slice(0, 100))
  )
  notifyWritingRecordsUpdated(userId)

  if (!canUseAccountApi()) return
  const saved = await saveWritingRecordToServer(userId, normalizedRecord)
  const current = loadWritingRecords(userId).filter((item) => !sharesDedupKey(item, saved))
  replaceWritingRecords(userId, [saved, ...current])
}

export function replaceWritingRecords(userId: string, records: WritingRecord[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    userScopedStorageKey(WritingRecordsStorageKey, userId),
    JSON.stringify(
      dedupeWritingRecords(records.map((record) => ({ ...record, ownerUserId: userId })))
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(0, 100)
    )
  )
  notifyWritingRecordsUpdated(userId)
}

export async function deleteWritingRecord(userId: string, id: string) {
  const records = loadWritingRecords(userId)
  const deleted = records.find((record) => record.id === id) ?? null
  if (!deleted) return null
  if (canUseAccountApi()) {
    await requestAccountApi(`/api/user/writing-records/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }
  replaceWritingRecords(userId, records.filter((record) => record.id !== id))
  return deleted
}

export async function restoreWritingRecord(userId: string, record: WritingRecord) {
  await saveWritingRecord(userId, record)
}

export function getWritingRecord(userId: string, id: string | null) {
  const records = loadWritingRecords(userId)
  if (!id) return records[0] ?? null
  return records.find((record) => record.id === id) ?? null
}

export async function getWritingRecordFromServer(userId: string, id: string | null) {
  if (!id || !canUseAccountApi()) return getWritingRecord(userId, id)
  try {
    const data = await requestAccountApi<{ record?: WritingRecord }>(
      `/api/user/writing-records/${encodeURIComponent(id)}`
    )
    const record = data.record ? parseStoredWritingRecord(data.record) : null
    if (!record || record.ownerUserId !== userId) return null
    const current = loadWritingRecords(userId).filter((item) => item.id !== record.id)
    replaceWritingRecords(userId, [record, ...current])
    return record
  } catch {
    return getWritingRecord(userId, id)
  }
}

export function saveMistakeRecord(userId: string, record: WritingRecord): { saved: boolean; alreadyExists: boolean } {
  if (typeof window === 'undefined') return { saved: false, alreadyExists: false }
  const storageKey = userScopedStorageKey(MistakeBookStorageKey, userId)
  let existing: string[] = []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    existing = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch (error) {
    console.warn('[mistake-book-read]', {
      userId,
      error: error instanceof Error ? error.name : 'unknown'
    })
    existing = []
  }
  const alreadyExists = existing.includes(record.id)
  window.localStorage.setItem(storageKey, JSON.stringify([record.id, ...existing.filter((id) => id !== record.id)].slice(0, 100)))
  return { saved: true, alreadyExists }
}

export function scoreValue(score: string | undefined) {
  if (!score) return null
  const match = score.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

export function recordScoreValue(record: WritingRecord) {
  return scoreValue(record.evaluation.overallBand || record.evaluation.bandEstimate)
}

export function formatBand(score: string | undefined) {
  const value = scoreValue(score)
  return value === null ? '—' : value.toFixed(value % 1 === 0 ? 0 : 1)
}

export function countWords(text: string) {
  const words = text.trim().match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)
  return words?.length ?? 0
}

export function formatDate(isoDate: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(isoDate))
}

export function formatDuration(totalSeconds: number, totalMinutes?: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.max(0, totalSeconds % 60)
  const elapsed = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return totalMinutes ? `${elapsed} / ${totalMinutes}:00` : elapsed
}

export function averageScore(records: WritingRecord[]) {
  const scores = records.map(recordScoreValue).filter((score): score is number => score !== null)
  if (scores.length === 0) return null
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}
