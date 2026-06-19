export type WritingTaskType = 'task1' | 'task2' | 'mock'

export const CriterionKeys = [
  'taskAchievement',
  'taskResponse',
  'coherenceCohesion',
  'lexicalResource',
  'grammaticalRangeAccuracy'
] as const

export type CriterionKey = (typeof CriterionKeys)[number]

export const Task1CriterionKeys = [
  'taskAchievement',
  'coherenceCohesion',
  'lexicalResource',
  'grammaticalRangeAccuracy'
] as const satisfies readonly CriterionKey[]

export const Task2CriterionKeys = [
  'taskResponse',
  'coherenceCohesion',
  'lexicalResource',
  'grammaticalRangeAccuracy'
] as const satisfies readonly CriterionKey[]

export type CriterionScore = {
  score: string
  feedback: string
  evidence?: string[]
  whyNotHigher?: string
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

export const EssayAnnotationSeverities = ['low', 'medium', 'high'] as const

export type EssayAnnotationSeverity = (typeof EssayAnnotationSeverities)[number]

export const EssayScoreCriteria = [
  'Task Achievement',
  'Task Response',
  'Coherence and Cohesion',
  'Lexical Resource',
  'Grammatical Range and Accuracy'
] as const

export type EssayScoreCriterion = (typeof EssayScoreCriteria)[number]

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
  blockIndex?: number
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
  annotationWarnings?: string[]
  feedback: string[]
  provider?: string
  model?: string
  _cacheHit?: boolean
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
