export type ErrorCategory =
  | 'article'
  | 'tense'
  | 'subject_verb_agreement'
  | 'singular_plural'
  | 'preposition'
  | 'sentence_structure'
  | 'punctuation'
  | 'spelling'
  | 'word_choice'
  | 'collocation'
  | 'cohesion'
  | 'task_response'
  | 'idea_development'
  | 'overview'
  | 'data_comparison'
  | 'map_tense'
  | 'process_sequence'
  | 'other'

export type ErrorPatternStatus = 'active' | 'improving' | 'mastered' | 'archived'

export type ErrorReviewType = 'rewrite' | 'fill_blank' | 'identify' | 'explain' | 'multiple_choice'

export type ErrorReviewResult = 'correct' | 'partial' | 'incorrect' | 'attempted'

export type ErrorPattern = {
  id: string
  userId: string
  category: ErrorCategory
  subcategory: string | null
  normalizedKey: string
  title: string
  description: string
  exampleWrong: string | null
  exampleCorrect: string | null
  occurrenceCount: number
  firstSeenAt: string
  lastSeenAt: string
  status: ErrorPatternStatus
  masteryLevel: number
  lastReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ErrorOccurrence = {
  id: string
  errorPatternId: string
  userId: string
  writingRecordId: string
  sentenceExcerpt: string | null
  correction: string | null
  explanation: string | null
  createdAt: string
}

export type ErrorReview = {
  id: string
  errorPatternId: string
  userId: string
  reviewType: ErrorReviewType
  result: ErrorReviewResult
  score: number | null
  reviewedAt: string
}

export const ErrorCategoryLabels: Record<ErrorCategory, string> = {
  article: '冠词',
  tense: '时态',
  subject_verb_agreement: '主谓一致',
  singular_plural: '单复数',
  preposition: '介词',
  sentence_structure: '句子结构',
  punctuation: '标点',
  spelling: '拼写',
  word_choice: '用词',
  collocation: '搭配',
  cohesion: '衔接',
  task_response: '任务回应',
  idea_development: '论证展开',
  overview: '概述',
  data_comparison: '数据比较',
  map_tense: '地图时态',
  process_sequence: '流程顺序',
  other: '其他'
}

export const ErrorCategoryGroups: Record<string, ErrorCategory[]> = {
  grammar: ['article', 'tense', 'subject_verb_agreement', 'singular_plural', 'preposition', 'sentence_structure', 'punctuation'],
  vocabulary: ['spelling', 'word_choice', 'collocation'],
  task: ['task_response', 'idea_development', 'overview', 'data_comparison'],
  coherence: ['cohesion'],
  special: ['map_tense', 'process_sequence'],
  other: ['other']
}

export const ErrorCategoryGroupLabels: Record<string, string> = {
  grammar: '语法',
  vocabulary: '词汇',
  task: '任务回应',
  coherence: '连贯性',
  special: '特殊题型',
  other: '其他'
}

export const ErrorPatternStatusLabels: Record<ErrorPatternStatus, string> = {
  active: '活跃',
  improving: '改善中',
  mastered: '已掌握',
  archived: '已归档'
}

export const ErrorReviewTypeLabels: Record<ErrorReviewType, string> = {
  rewrite: '改写句子',
  fill_blank: '填空',
  identify: '识别错误',
  explain: '解释原因',
  multiple_choice: '选择题'
}
