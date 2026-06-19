import { prepareTask1ChartSpec, type Task1ChartKind } from '@/lib/task1-chart-schema'
import { readStorageValue, userScopedStorageKey } from '@/lib/user-storage'

export type WritingTaskType = 'task1' | 'task2' | 'mock'

export type CriterionKey =
  | 'taskAchievement'
  | 'taskResponse'
  | 'coherenceCohesion'
  | 'lexicalResource'
  | 'grammaticalRangeAccuracy'

export type CriterionScore = {
  score: string
  feedback: string
}

export type SentenceErrorCategory = 'grammar' | 'lexical' | 'cohesion' | 'task' | 'other'

export const EssayAnnotationCategories = [
  'grammar',
  'spelling',
  'vocabulary',
  'collocation',
  'coherence',
  'cohesion',
  'task-response',
  'punctuation',
  'sentence-structure',
  'style',
  'repetition',
  'unclear-expression'
] as const

export type EssayAnnotationCategory = (typeof EssayAnnotationCategories)[number]

export type EssayAnnotationSeverity = 'low' | 'medium' | 'high'

export type EssayScoreCriterion =
  | 'Task Achievement'
  | 'Task Response'
  | 'Coherence and Cohesion'
  | 'Lexical Resource'
  | 'Grammatical Range and Accuracy'

export type EssayAnnotation = {
  id: string
  start: number
  end: number
  originalText: string
  replacement?: string
  category: EssayAnnotationCategory
  severity: EssayAnnotationSeverity
  scoreCriterion: EssayScoreCriterion
  explanationZh: string
  explanationEn?: string
  impactOnScore: string
  suggestion: string
  unresolved?: boolean
}

export type AcceptedAnnotationChange = {
  annotationId: string
  start: number
  end: number
  originalText: string
  replacement: string
  acceptedAt: string
}

export type SentenceError = {
  original: string
  correction: string
  explanation: string
  category: SentenceErrorCategory
  errorType?: string
  sentence?: string
  chineseExplanation?: string
}

export type EssayEvaluation = {
  overallBand: string
  bandEstimate: string
  taskAchievement?: CriterionScore
  taskResponse?: CriterionScore
  coherenceCohesion?: CriterionScore
  lexicalResource?: CriterionScore
  grammaticalRangeAccuracy?: CriterionScore
  summary?: string
  strengths?: string[]
  weaknesses?: string[]
  annotations?: EssayAnnotation[]
  annotationVersion?: number
  sentenceAnnotations?: SentenceError[]
  correctedEssay?: string
  improvedEssay?: string
  nextSteps?: string[]
  criteria?: Partial<Record<CriterionKey, CriterionScore>>
  overallFeedback?: string
  sentenceErrors?: SentenceError[]
  suggestions?: string[]
  revisedEssay?: string
  modelEssay?: string
  feedback: string[]
  provider?: string
  model?: string
}

export type WritingRecordComponent = {
  taskType: Exclude<WritingTaskType, 'mock'>
  title: string
  prompt: string
  essay: string
  durationSeconds: number
  wordCount: number
  evaluation: EssayEvaluation
  questionId?: string
  questionType?: string
  trainingType?: string
  chartSpec?: Record<string, unknown>
  processSpec?: Record<string, unknown>
  mapSpec?: Record<string, unknown>
  imageUrl?: string
  promptLead?: string
  promptDetail?: string
}

export type WritingRecord = {
  id: string
  ownerUserId?: string
  deviceId: string
  taskType: WritingTaskType
  title: string
  prompt: string
  essay: string
  originalEssay?: string
  submittedAt: string
  durationSeconds: number
  wordCount: number
  evaluation: EssayEvaluation
  acceptedChanges?: AcceptedAnnotationChange[]
  annotationVersion?: number
  questionId?: string
  questionType?: string
  trainingType?: string
  components?: Partial<Record<Exclude<WritingTaskType, 'mock'>, WritingRecordComponent>>
  chartSpec?: Record<string, unknown>
  processSpec?: Record<string, unknown>
  mapSpec?: Record<string, unknown>
  promptLead?: string
  promptDetail?: string
  imageUrl?: string
}

export const WritingRecordsStorageKey = 'ielts-writing-writing-records-v1'
export const WritingRecordsDedupeMigrationKey = 'ielts-writing-writing-records-dedupe-v2'
export const MistakeBookStorageKey = 'ielts-writing-mistake-book-v1'
export const LocalDeviceStorageKey = 'ielts-writing-local-device-id-v1'
export const WritingRecordsUpdatedEvent = 'ielts-writing:writing-records-updated'

export const TaskTypeLabels: Record<WritingTaskType, string> = {
  task1: 'IELTS Task 1',
  task2: 'IELTS Task 2',
  mock: '完整测试'
}

export const CriterionLabels: Record<CriterionKey, string> = {
  taskAchievement: '写作任务完成度',
  taskResponse: '任务回应',
  coherenceCohesion: '连贯与衔接',
  lexicalResource: '词汇丰富程度',
  grammaticalRangeAccuracy: '语法多样性及准确性'
}

export const SentenceErrorLabels: Record<SentenceErrorCategory, string> = {
  grammar: '语法错误',
  lexical: '词汇问题',
  cohesion: '衔接问题',
  task: '任务回应',
  other: '其他问题'
}

export const EssayAnnotationLabels: Record<EssayAnnotationCategory, string> = {
  grammar: '语法',
  spelling: '拼写',
  vocabulary: '词汇',
  collocation: '搭配',
  coherence: '逻辑连贯',
  cohesion: '衔接',
  'task-response': '任务回应',
  punctuation: '标点',
  'sentence-structure': '句式',
  style: '风格',
  repetition: '重复',
  'unclear-expression': '表达不清'
}

export const EssayAnnotationCriterionLabels: Record<EssayScoreCriterion, string> = {
  'Task Achievement': 'Task Achievement',
  'Task Response': 'Task Response',
  'Coherence and Cohesion': 'Coherence and Cohesion',
  'Lexical Resource': 'Lexical Resource',
  'Grammatical Range and Accuracy': 'Grammatical Range and Accuracy'
}

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
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium'
}

function normalizeScoreCriterion(value: unknown, category: EssayAnnotationCategory): EssayScoreCriterion {
  if (
    value === 'Task Achievement' ||
    value === 'Task Response' ||
    value === 'Coherence and Cohesion' ||
    value === 'Lexical Resource' ||
    value === 'Grammatical Range and Accuracy'
  ) {
    return value
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

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `annotation-${index + 1}`,
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
    unresolved: Boolean(value.unresolved)
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
  const criteria = isObject(value.criteria) ? { ...value.criteria } : {}
  const criterionKeys: CriterionKey[] = [
    'taskAchievement',
    'taskResponse',
    'coherenceCohesion',
    'lexicalResource',
    'grammaticalRangeAccuracy'
  ]

  for (const key of criterionKeys) {
    if (!criteria[key] && isObject(value[key])) {
      criteria[key] = value[key]
    }
  }

  const bandEstimate = typeof value.bandEstimate === 'string' ? value.bandEstimate : typeof value.overallBand === 'string' ? value.overallBand : ''
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

  return {
    overallBand: typeof value.overallBand === 'string' ? value.overallBand : bandEstimate,
    bandEstimate,
    taskAchievement: isObject(criteria.taskAchievement) ? (criteria.taskAchievement as CriterionScore) : undefined,
    taskResponse: isObject(criteria.taskResponse) ? (criteria.taskResponse as CriterionScore) : undefined,
    coherenceCohesion: isObject(criteria.coherenceCohesion) ? (criteria.coherenceCohesion as CriterionScore) : undefined,
    lexicalResource: isObject(criteria.lexicalResource) ? (criteria.lexicalResource as CriterionScore) : undefined,
    grammaticalRangeAccuracy: isObject(criteria.grammaticalRangeAccuracy) ? (criteria.grammaticalRangeAccuracy as CriterionScore) : undefined,
    criteria: criteria as Partial<Record<CriterionKey, CriterionScore>>,
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
    nextSteps: Array.isArray(value.nextSteps) ? value.nextSteps.filter((item): item is string => typeof item === 'string') : [],
    feedback,
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined
  }
}

function isWritingRecord(value: unknown): value is WritingRecord {
  if (!isObject(value)) return false
  const evaluation = normalizeEvaluation(value.evaluation)
  return (
    typeof value.id === 'string' &&
    (value.taskType === 'task1' || value.taskType === 'task2' || value.taskType === 'mock') &&
    typeof value.title === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.essay === 'string' &&
    typeof value.submittedAt === 'string' &&
    typeof value.durationSeconds === 'number' &&
    typeof value.wordCount === 'number' &&
    evaluation !== null
  )
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
      .filter(isWritingRecord)
      .map(normalizeWritingRecord)
      .filter((record) => record.ownerUserId === userId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    const deduped = dedupeWritingRecords(records)
    persistDedupeMigration(userId, deduped, parsed.length)
    return deduped
  } catch {
    return []
  }
}

function normalizeWritingRecord(record: WritingRecord): WritingRecord {
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
    evaluation: normalizeEvaluation(record.evaluation) as EssayEvaluation,
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
      promptDetail: typeof component.promptDetail === 'string' ? component.promptDetail : undefined
    }
  }
  return Object.keys(output).length > 0 ? output : undefined
}

export function saveWritingRecord(userId: string, record: WritingRecord) {
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

export function deleteWritingRecord(userId: string, id: string) {
  const records = loadWritingRecords(userId)
  const deleted = records.find((record) => record.id === id) ?? null
  if (!deleted) return null
  replaceWritingRecords(userId, records.filter((record) => record.id !== id))
  return deleted
}

export function restoreWritingRecord(userId: string, record: WritingRecord) {
  saveWritingRecord(userId, record)
}

export function getWritingRecord(userId: string, id: string | null) {
  const records = loadWritingRecords(userId)
  if (!id) return records[0] ?? null
  return records.find((record) => record.id === id) ?? null
}

export function saveMistakeRecord(userId: string, record: WritingRecord) {
  if (typeof window === 'undefined') return
  const storageKey = userScopedStorageKey(MistakeBookStorageKey, userId)
  let existing: string[] = []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    existing = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    existing = []
  }
  window.localStorage.setItem(storageKey, JSON.stringify([record.id, ...existing.filter((id) => id !== record.id)].slice(0, 100)))
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
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
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
