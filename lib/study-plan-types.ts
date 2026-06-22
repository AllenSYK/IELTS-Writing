export type StudyPlanStatus = 'active' | 'replaced' | 'completed'

export type StudyPlanTaskType = 'task1' | 'task2' | 'full_test' | 'grammar_drill' | 'vocabulary_drill' | 'review'

export type StudyPlanTaskSource = 'past_paper' | 'built_in' | 'weakness_drill' | 'review'

export type StudyPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type DataSufficiency = 'none' | 'limited' | 'sufficient'

export type StudyPlanProfile = {
  userId: string
  overallTarget: number
  task1Target: number
  task2Target: number
  examDate: string | null
  sessionsPerWeek: number
  minutesPerSession: number
  preferredDays: number[]
  includeFullTests: boolean
  includePastPapers: boolean
  task1Ratio: number
  task2Ratio: number
  preferWeakness: boolean
  weekendExtended: boolean
  timezone: string
}

export type StudyPlanDiagnosis = {
  currentAverage: number | null
  strongestCriteria: string[]
  weakestCriteria: string[]
  priorityErrorTags: Array<{
    tag: string
    frequency: number
    priority: 'high' | 'medium' | 'low'
  }>
  dataSufficiency: DataSufficiency
}

export type StudyPlanGoals = {
  overallTarget: number
  task1Target?: number
  task2Target?: number
  examDate?: string
}

export type StudyPlanPreferences = {
  sessionsPerWeek: number
  minutesPerSession: number
  preferredDays?: number[]
  includeFullTests: boolean
  includePastPapers: boolean
}

export type StudyPlanTask = {
  id: string
  planId: string
  userId: string
  scheduledDate: string
  taskType: StudyPlanTaskType
  source: StudyPlanTaskSource
  questionId: string | null
  focusCriteria: string[]
  focusErrorTags: string[]
  estimatedMinutes: number
  status: StudyPlanTaskStatus
  writingRecordId: string | null
  draftId: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type StudyPlan = {
  id: string
  userId: string
  version: number
  status: StudyPlanStatus
  periodStart: string
  periodEnd: string
  diagnosis: StudyPlanDiagnosis
  preferencesSnapshot: StudyPlanPreferences
  goalsSnapshot: StudyPlanGoals
  aiModel: string | null
  generatedAt: string
  createdAt: string
  tasks?: StudyPlanTask[]
}

export type StudyPlanGenerationQuota = {
  monthKey: string
  usedCount: number
  remainingCount: number
  limit: number
}

export const StudyPlanTaskTypeLabels: Record<StudyPlanTaskType, string> = {
  task1: 'Task 1',
  task2: 'Task 2',
  full_test: '完整测试',
  grammar_drill: '语法专项',
  vocabulary_drill: '词汇专项',
  review: '复习回顾'
}

export const StudyPlanTaskSourceLabels: Record<StudyPlanTaskSource, string> = {
  past_paper: '真题',
  built_in: '题库',
  weakness_drill: '弱项训练',
  review: '复习'
}

export const StudyPlanTaskStatusLabels: Record<StudyPlanTaskStatus, string> = {
  pending: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  skipped: '已跳过'
}

export const ErrorTagLabels: Record<string, string> = {
  missing_overview: '缺少概述',
  incomplete_task_response: '任务回应不完整',
  unsupported_ideas: '观点缺乏支撑',
  unclear_position: '立场不明确',
  missing_subquestion: '遗漏子问题',
  inaccurate_data_selection: '数据选择不准确',
  insufficient_comparison: '比较不充分',
  weak_paragraphing: '段落结构弱',
  unclear_progression: '推进不清晰',
  overused_linkers: '过度使用连接词',
  incorrect_reference: '指代错误',
  weak_topic_sentence: '主题句弱',
  idea_repetition: '观点重复',
  word_choice: '用词不当',
  collocation: '搭配错误',
  repetition: '表达重复',
  spelling: '拼写错误',
  word_form: '词形错误',
  informal_language: '非正式用语',
  limited_range: '词汇范围有限',
  subject_verb_agreement: '主谓一致',
  article: '冠词错误',
  tense: '时态错误',
  preposition: '介词错误',
  plural: '单复数错误',
  sentence_fragment: '句子片段',
  run_on_sentence: '连写句',
  punctuation: '标点错误',
  relative_clause: '定语从句',
  complex_sentence_control: '复杂句控制',
  other: '其他'
}
