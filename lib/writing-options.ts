import type { WritingTaskType } from '@/lib/writing-records'

export const Task1ChartTypes = [
  'random',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'table',
  'process',
  'map',
  'floor_plan',
  'mixed_charts',
  'dynamic_chart',
  'static_comparison',
  'before_after'
] as const

export type Task1ChartType = (typeof Task1ChartTypes)[number]

export const Task1ProcessSubtypes = ['random', 'natural_process', 'industrial_process', 'life_cycle'] as const
export type Task1ProcessSubtype = (typeof Task1ProcessSubtypes)[number]

export const Task1MapSubtypes = ['random', 'town_change', 'campus_plan', 'building_layout', 'harbour_transport', 'regional_before_after'] as const
export type Task1MapSubtype = (typeof Task1MapSubtypes)[number]

export const Task1MixedSubtypes = ['random', 'bar_pie', 'line_table', 'two_pies', 'multi_year', 'multi_category'] as const
export type Task1MixedSubtype = (typeof Task1MixedSubtypes)[number]

export const Task2EssayTypes = [
  'random',
  'agree_disagree',
  'discussion_opinion',
  'advantages_disadvantages',
  'outweigh',
  'problem_solution',
  'cause_solution',
  'two_part',
  'positive_negative',
  'direct_question'
] as const

export type Task2EssayType = (typeof Task2EssayTypes)[number]

export const Task2Topics = [
  'random',
  'education',
  'technology',
  'environment',
  'society',
  'government',
  'health',
  'work',
  'globalization',
  'media_advertising',
  'transport',
  'urban_development',
  'culture',
  'crime',
  'family',
  'teenagers'
] as const

export type Task2Topic = (typeof Task2Topics)[number]

export type PromptSelection = {
  task1ChartType: Task1ChartType
  task1Subtype: Task1ProcessSubtype | Task1MapSubtype | Task1MixedSubtype
  task2EssayType: Task2EssayType
  task2Topic: Task2Topic
}

export const DefaultPromptSelection: PromptSelection = {
  task1ChartType: 'random',
  task1Subtype: 'random',
  task2EssayType: 'random',
  task2Topic: 'random'
}

export const Task1ChartLabels: Record<Task1ChartType, string> = {
  random: '随机题型',
  line_chart: '折线图',
  bar_chart: '柱状图',
  pie_chart: '饼图',
  table: '表格',
  process: '流程图',
  map: '地图',
  floor_plan: '平面图或布局变化',
  mixed_charts: '多个图表组合',
  dynamic_chart: '动态图表',
  static_comparison: '静态对比图',
  before_after: '前后变化对比'
}

export const Task1SubtypeLabels: Record<PromptSelection['task1Subtype'], string> = {
  random: '随机子类',
  natural_process: '自然过程',
  industrial_process: '工业制造',
  life_cycle: '生命周期',
  town_change: '城镇变化',
  campus_plan: '校园规划',
  building_layout: '建筑布局',
  harbour_transport: '港口或交通改造',
  regional_before_after: '地区前后变化',
  bar_pie: '柱状图 + 饼图',
  line_table: '折线图 + 表格',
  two_pies: '两个饼图',
  multi_year: '多年份图表',
  multi_category: '多类别综合图'
}

export const Task2EssayLabels: Record<Task2EssayType, string> = {
  random: '随机题型',
  agree_disagree: '同意或不同意',
  discussion_opinion: '讨论双方观点并给出看法',
  advantages_disadvantages: '优点和缺点',
  outweigh: '优点是否大于缺点',
  problem_solution: '问题与解决方案',
  cause_solution: '原因与解决方案',
  two_part: '双问题题型',
  positive_negative: '积极还是消极发展',
  direct_question: '直接问题型'
}

export const Task2TopicLabels: Record<Task2Topic, string> = {
  random: '随机主题',
  education: '教育',
  technology: '科技',
  environment: '环境',
  society: '社会',
  government: '政府',
  health: '健康',
  work: '工作',
  globalization: '全球化',
  media_advertising: '媒体与广告',
  transport: '交通',
  urban_development: '城市发展',
  culture: '文化',
  crime: '犯罪',
  family: '家庭',
  teenagers: '青少年'
}

export function normalizeTask1ChartType(value: unknown): Task1ChartType {
  return typeof value === 'string' && Task1ChartTypes.includes(value as Task1ChartType) ? (value as Task1ChartType) : 'random'
}

export function normalizeTask1Subtype(value: unknown): PromptSelection['task1Subtype'] {
  const all = [...Task1ProcessSubtypes, ...Task1MapSubtypes, ...Task1MixedSubtypes]
  return typeof value === 'string' && all.includes(value as PromptSelection['task1Subtype']) ? (value as PromptSelection['task1Subtype']) : 'random'
}

export function normalizeTask2EssayType(value: unknown): Task2EssayType {
  return typeof value === 'string' && Task2EssayTypes.includes(value as Task2EssayType) ? (value as Task2EssayType) : 'random'
}

export function normalizeTask2Topic(value: unknown): Task2Topic {
  return typeof value === 'string' && Task2Topics.includes(value as Task2Topic) ? (value as Task2Topic) : 'random'
}

export function selectionFromSearchParams(params: URLSearchParams): PromptSelection {
  return {
    task1ChartType: normalizeTask1ChartType(params.get('task1Chart')),
    task1Subtype: normalizeTask1Subtype(params.get('task1Subtype')),
    task2EssayType: normalizeTask2EssayType(params.get('task2Essay')),
    task2Topic: normalizeTask2Topic(params.get('task2Topic'))
  }
}

export function searchParamsForSelection(mode: WritingTaskType, selection: PromptSelection) {
  const params = new URLSearchParams()
  if (mode === 'task1' || mode === 'mock') {
    if (selection.task1ChartType !== 'random') params.set('task1Chart', selection.task1ChartType)
    if (selection.task1Subtype !== 'random') params.set('task1Subtype', selection.task1Subtype)
  }
  if (mode === 'task2' || mode === 'mock') {
    if (selection.task2EssayType !== 'random') params.set('task2Essay', selection.task2EssayType)
    if (selection.task2Topic !== 'random') params.set('task2Topic', selection.task2Topic)
  }
  return params
}

export function selectedTask1SubtypeOptions(chartType: Task1ChartType) {
  if (chartType === 'process') return Task1ProcessSubtypes
  if (chartType === 'map' || chartType === 'floor_plan' || chartType === 'before_after') return Task1MapSubtypes
  if (chartType === 'mixed_charts') return Task1MixedSubtypes
  return ['random'] as const
}
