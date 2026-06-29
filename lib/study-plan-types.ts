export type StudyPlanStatus = 'active' | 'replaced' | 'completed' | 'paused'

export type StudyPlanTaskType =
  | 'task1' | 'task2' | 'full_test'
  | 'grammar_drill' | 'vocabulary_drill' | 'review'
  | 'diagnostic' | 'error_review' | 'model_answer_review'
  | 'timed_practice'

export type StudyPlanTaskSource = 'past_paper' | 'built_in' | 'weakness_drill' | 'review' | 'diagnostic'

export type StudyPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'rescheduled'

export type DataSufficiency = 'none' | 'limited' | 'sufficient'

export type PlanPhase = 'foundation' | 'focused' | 'integrated' | '冲刺' | 'sprint'

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
  intensity: 'relaxed' | 'standard' | 'intensive'
  allowTimedPractice: boolean
  currentLevel: number | null
}

export type StudyPlanDiagnosis = {
  currentAverage: number | null
  task1Average: number | null
  task2Average: number | null
  taTr: number | null
  cc: number | null
  lr: number | null
  gra: number | null
  strongestCriteria: string[]
  weakestCriteria: string[]
  priorityErrorTags: Array<{
    tag: string
    frequency: number
    priority: 'high' | 'medium' | 'low'
  }>
  dataSufficiency: DataSufficiency
  profileConfidence: 'low' | 'medium' | 'high'
  task1SubtypePerformance: Record<string, number | null>
  task2SubtypePerformance: Record<string, number | null>
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
  intensity?: 'relaxed' | 'standard' | 'intensive'
  allowTimedPractice?: boolean
}

export type StudyPlanTask = {
  id: string
  planId: string
  userId: string
  scheduledDate: string
  taskType: StudyPlanTaskType
  source: StudyPlanTaskSource
  questionId: string | null
  title: string
  description: string
  focusCriteria: string[]
  focusErrorTags: string[]
  estimatedMinutes: number
  difficulty: 'easy' | 'medium' | 'hard'
  priority: number
  status: StudyPlanTaskStatus
  writingRecordId: string | null
  draftId: string | null
  startedAt: string | null
  completedAt: string | null
  skipReason: string | null
  generatedReason: string
  writingMode: string | null
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
  currentPhase: PlanPhase
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

export type WeeklyReview = {
  id: string
  planId: string
  userId: string
  weekStart: string
  completionRate: number
  averageBand: number | null
  task1Band: number | null
  task2Band: number | null
  taTr: number | null
  cc: number | null
  lr: number | null
  gra: number | null
  summary: string
  adjustments: Record<string, unknown>
  createdAt: string
}

export type AICoachingSuggestion = {
  icon: string
  title: string
  detail: string
}

export const StudyPlanTaskTypeLabels: Record<StudyPlanTaskType, string> = {
  task1: 'Task 1',
  task2: 'Task 2',
  full_test: '完整测试',
  grammar_drill: '语法专项',
  vocabulary_drill: '词汇专项',
  review: '复习回顾',
  diagnostic: '诊断测试',
  error_review: '错误复盘',
  model_answer_review: '范文学习',
  timed_practice: '限时训练'
}

export const StudyPlanTaskSourceLabels: Record<StudyPlanTaskSource, string> = {
  past_paper: '真题',
  built_in: '题库',
  weakness_drill: '弱项训练',
  review: '复习',
  diagnostic: '诊断'
}

export const StudyPlanTaskStatusLabels: Record<StudyPlanTaskStatus, string> = {
  pending: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  skipped: '已跳过',
  rescheduled: '已延期'
}

export const PlanPhaseLabels: Record<PlanPhase, string> = {
  foundation: '基础修复',
  focused: '专项提升',
  integrated: '综合训练',
  '冲刺': '考前冲刺',
  sprint: '考前冲刺'
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

export const SkipReasonLabels: Record<string, string> = {
  no_time: '今天没时间',
  too_hard: '任务太难',
  not_interested: '不想练这个题型',
  already_mastered: '已经掌握',
  other: '其他原因'
}

export const CriterionLabels: Record<string, string> = {
  taskAchievement: 'Task Achievement',
  taskResponse: 'Task Response',
  coherenceCohesion: 'Coherence & Cohesion',
  lexicalResource: 'Lexical Resource',
  grammaticalRangeAccuracy: 'Grammar'
}

export const ShortCriterionLabels: Record<string, string> = {
  taskAchievement: 'TA',
  taskResponse: 'TR',
  coherenceCohesion: 'CC',
  lexicalResource: 'LR',
  grammaticalRangeAccuracy: 'GRA'
}

export function isWritableTaskType(taskType: StudyPlanTaskType): boolean {
  return taskType === 'task1' || taskType === 'task2' || taskType === 'full_test'
    || taskType === 'timed_practice'
}

export function taskTypeToWriteMode(taskType: StudyPlanTaskType): string | null {
  if (taskType === 'task1') return 'task1'
  if (taskType === 'task2') return 'task2'
  if (taskType === 'full_test') return 'mock'
  if (taskType === 'timed_practice') return 'task2'
  return null
}
