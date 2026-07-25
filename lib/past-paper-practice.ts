import {
  type Task1QuestionType,
  type Task2QuestionType,
  type WritingQuestion
} from '@/lib/ielts-questions'
import { convertVisualDataToSpecs } from '@/lib/task1-chart-schema'
import { normalizeTask1ChartType } from '@/lib/writing-options'
import { pastPaperPracticeReadiness } from '@/lib/past-paper-readiness'

export type PastPaperPracticeSource = {
  id: string
  taskType: string
  title: string
  questionText: string
  task1VisualTypes?: string[] | null
  task1VisualData?: Record<string, unknown> | null
  task2QuestionType?: string | null
}

const Task2QuestionTypes = new Set<Task2QuestionType>([
  'agree_disagree',
  'discussion_opinion',
  'advantages_disadvantages',
  'outweigh',
  'problem_solution',
  'cause_solution',
  'two_part',
  'positive_negative',
  'direct_question',
  'opinion',
  'discussion'
])

function task2QuestionType(value: string | null | undefined): Task2QuestionType {
  return value && Task2QuestionTypes.has(value as Task2QuestionType)
    ? value as Task2QuestionType
    : 'opinion'
}

function promptParts(source: PastPaperPracticeSource, isTask1: boolean) {
  const lines = source.questionText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    promptLead: lines[0] || source.title,
    promptDetail: lines.slice(1).join('\n')
      || (isTask1
        ? 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.'
        : '')
  }
}

export function writingQuestionFromPastPaper(source: PastPaperPracticeSource): WritingQuestion {
  const readiness = pastPaperPracticeReadiness(source)
  if (!readiness.ready) throw new Error(readiness.message)

  const isTask1 = source.taskType.includes('task1')
  const parts = promptParts(source, isTask1)

  if (!isTask1) {
    return {
      id: source.id,
      taskType: 'task2',
      title: source.title,
      ...parts,
      durationMinutes: 40,
      wordTarget: 250,
      questionType: task2QuestionType(source.task2QuestionType),
      generatedSource: 'static-bank'
    }
  }

  const specs = convertVisualDataToSpecs(
    source.task1VisualTypes ?? [],
    source.task1VisualData ?? null,
    source.title
  )
  const normalizedType = normalizeTask1ChartType(specs.questionType)
  if (normalizedType === 'random') {
    throw new Error('题库中的 Task 1 图表类型无法识别，请联系管理员修正题目。')
  }
  const questionType = normalizedType as Task1QuestionType

  return {
    id: source.id,
    taskType: 'task1',
    title: source.title,
    ...parts,
    durationMinutes: 20,
    wordTarget: 150,
    questionType,
    trainingType: source.taskType.includes('general') ? 'general' : 'academic',
    generatedSource: 'static-bank',
    chartSpec: specs.chartSpec,
    processSpec: specs.processSpec,
    mapSpec: specs.mapSpec
  }
}
