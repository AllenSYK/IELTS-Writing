export type PastPaperStatus = 'draft' | 'analyzing' | 'review_pending' | 'published' | 'unpublished' | 'archived' | 'analysis_failed'

export type PastPaperTaskType = 'task1_academic' | 'task1_general' | 'task2' | 'full_test' | 'unknown'

export type PastPaperSourceType = 'official' | 'published_collection' | 'recalled' | 'curated'

export type PastPaperFrequencyLevel = 'high' | 'medium_high' | 'normal' | 'low'

export type PastPaperDifficulty = 'easy' | 'medium' | 'hard'

export type Task1VisualType = 'line' | 'bar' | 'pie' | 'table' | 'map' | 'process' | 'mixed' | 'letter' | 'unknown'

export type ExamSession = 'morning' | 'afternoon' | 'evening' | 'unknown'

export type ExamMode = 'computer' | 'paper' | 'unknown'

export type QuestionCompleteness = 'complete' | 'mostly_complete' | 'partial' | 'summary_only' | 'missing'

export type ExamSetReliability = 'confirmed' | 'multiple_reports' | 'single_report' | 'uncertain'

export type ExamSetStatus = 'draft' | 'review_pending' | 'published' | 'archived'

export type ExamWritingSet = {
  id: string
  examDate: string | null
  examSession: ExamSession
  examTimeLocal: string | null
  examTimezone: string | null
  examMode: ExamMode
  examCountry: string | null
  examRegion: string | null
  examCity: string | null
  venueNote: string | null
  sourceType: PastPaperSourceType
  sourceReference: string | null
  reliability: ExamSetReliability
  status: ExamSetStatus
  createdBy: string
  reviewedBy: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export type PastPaperQuestion = {
  id: string
  status: PastPaperStatus
  taskType: PastPaperTaskType
  title: string
  questionText: string
  summary: string
  sourceType: PastPaperSourceType
  sourceName: string | null
  sourceYear: number | null
  sourceReference: string | null
  frequencyLevel: PastPaperFrequencyLevel
  frequencySource: 'admin' | 'ai_suggested'
  difficulty: PastPaperDifficulty | null
  task1VisualTypes: Task1VisualType[] | null
  task1VisualData: Record<string, unknown> | null
  task2QuestionType: string | null
  topics: string[]
  keywords: string[]
  sourceImagePath: string | null
  showSourceImage: boolean
  aiAnalysis: Record<string, unknown> | null
  aiModel: string | null
  aiAnalyzedAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  publishedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  examWritingSetId: string | null
  examDate: string | null
  examSession: ExamSession
  examTimeLocal: string | null
  examTimezone: string | null
  examMode: ExamMode
  examCountry: string | null
  examRegion: string | null
  examCity: string | null
  venueNote: string | null
  completeness: QuestionCompleteness
  missingFields: string[]
  uncertainties: string[]
  primaryTopic: string | null
  secondaryTopics: string[]
}

export type PastPaperListItem = Pick<
  PastPaperQuestion,
  'id' | 'status' | 'taskType' | 'title' | 'summary' | 'sourceType' | 'sourceName' | 'sourceYear' |
  'frequencyLevel' | 'difficulty' | 'task1VisualTypes' | 'task2QuestionType' | 'topics' | 'createdAt' |
  'examDate' | 'examSession' | 'examMode' | 'examRegion' | 'completeness' | 'primaryTopic' | 'secondaryTopics'
>

export type PastPaperAIAnalysis = {
  detectedTask: PastPaperTaskType
  questionText: string
  title: string
  summary: string
  task1VisualTypes?: Task1VisualType[]
  task2QuestionType?: string
  topics: string[]
  keywords: string[]
  suggestedFrequency: PastPaperFrequencyLevel
  difficulty: PastPaperDifficulty
  possibleDuplicateIds: string[]
  sourceHints: {
    sourceName?: string
    year?: number
    testNumber?: string
    confidence: number
  }
  uncertainties: string[]
}

export type RecalledTask1Result = {
  questionText?: string
  summary?: string
  visualTypes: Task1VisualType[]
  completeness: QuestionCompleteness
  topics: string[]
  missingFields: string[]
  uncertainties: string[]
}

export type RecalledTask2Result = {
  questionText?: string
  questionType: string
  primaryTopic?: string
  secondaryTopics: string[]
  completeness: QuestionCompleteness
  missingFields: string[]
  uncertainties: string[]
}

export type RecalledExamRecord = {
  examDate?: string
  examSession: ExamSession
  examTimeLocal?: string
  examMode: ExamMode
  examCountry?: string
  examRegion?: string
  examCity?: string
  task1?: RecalledTask1Result
  task2?: RecalledTask2Result
  reliability: ExamSetReliability
  sourceNotes?: string
}

export type RecalledExamImportResult = {
  examRecords: RecalledExamRecord[]
}

export type ExamImportBatch = {
  id: string
  rawText: string
  defaultYear: number | null
  defaultRegion: string | null
  defaultMode: ExamMode
  aiModel: string | null
  aiResult: RecalledExamImportResult | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  setsCreated: number
  questionsCreated: number
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export const PastPaperStatusLabels: Record<PastPaperStatus, string> = {
  draft: '草稿',
  analyzing: '分析中',
  review_pending: '待审核',
  published: '已发布',
  unpublished: '已下架',
  archived: '已归档',
  analysis_failed: '分析失败'
}

export const PastPaperTaskTypeLabels: Record<PastPaperTaskType, string> = {
  task1_academic: 'Task 1 Academic',
  task1_general: 'Task 1 General',
  task2: 'Task 2',
  full_test: '完整套题',
  unknown: '未知'
}

export const PastPaperSourceTypeLabels: Record<PastPaperSourceType, string> = {
  official: '官方真题',
  published_collection: '出版合集',
  recalled: '考试回忆',
  curated: '平台整理'
}

export const PastPaperFrequencyLabels: Record<PastPaperFrequencyLevel, string> = {
  high: '高频',
  medium_high: '次高频',
  normal: '常规',
  low: '低频'
}

export const PastPaperDifficultyLabels: Record<PastPaperDifficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
}

export const Task1VisualTypeLabels: Record<Task1VisualType, string> = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  table: '表格',
  map: '地图',
  process: '流程图',
  mixed: '组合图',
  letter: '书信',
  unknown: '未知'
}

export const Task2QuestionTypeLabels: Record<string, string> = {
  agree_disagree: '同意或不同意',
  discussion_opinion: '讨论双方观点',
  advantages_disadvantages: '优缺点',
  outweigh: '是否利大于弊',
  problem_solution: '问题与解决方案',
  cause_solution: '原因与解决方案',
  two_part: '双问题',
  direct_question: '直接问题',
  positive_negative: '积极/消极发展',
  opinion: '观点',
  discussion: '讨论'
}

export const PastPaperTopicLabels: Record<string, string> = {
  education: '教育',
  technology: '科技',
  environment: '环境',
  society: '社会',
  government: '政府',
  media: '媒体',
  work: '工作',
  health: '健康',
  crime: '犯罪',
  city: '城市',
  transport: '交通',
  globalization: '全球化',
  culture: '文化',
  family: '家庭',
  economy: '经济',
  tourism: '旅游',
  children: '儿童',
  elderly: '老年人',
  sports: '体育'
}

export const ExamSessionLabels: Record<ExamSession, string> = {
  morning: '上午场',
  afternoon: '下午场',
  evening: '晚场',
  unknown: '未注明'
}

export const ExamModeLabels: Record<ExamMode, string> = {
  computer: '机考',
  paper: '纸笔',
  unknown: '未注明'
}

export const CompletenessLabels: Record<QuestionCompleteness, string> = {
  complete: '完整原题',
  mostly_complete: '基本完整',
  partial: '部分回忆',
  summary_only: '仅题型回忆',
  missing: '无题目内容'
}

export const ReliabilityLabels: Record<ExamSetReliability, string> = {
  confirmed: '已确认',
  multiple_reports: '多个来源报告',
  single_report: '单一来源',
  uncertain: '不确定'
}

export type PastPaperListResponse = {
  success: true
  items: PastPaperListItem[]
  total: number
  page: number
  pageSize: number
}

export type PastPaperDetailResponse = {
  success: true
  question: PastPaperQuestion
}
