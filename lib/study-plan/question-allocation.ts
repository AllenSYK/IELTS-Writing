import type { WritingQuestion } from '@/lib/ielts-questions'
import type { StudyPlanDiagnosis } from '@/lib/study-plan-types'
import type { TrainingTask } from '@/lib/study-plan/allocator'

export type QuestionMode = 'task1' | 'task2'
export type AssignedQuestion = {
  expected: 'question_bank' | 'ai_generated'
  actual: 'question_bank' | 'ai_generated' | null
  fallbackReason?: string
  question: WritingQuestion | null
}
export type QuestionAssignments = Partial<Record<QuestionMode, AssignedQuestion>>
export type AssignedTrainingTask = TrainingTask & {
  questionId: string | null
  questionSource: 'question_bank' | 'ai_generated'
  originalQuestionSource: 'question_bank' | 'ai_generated' | null
  fallbackReason: string | null
  assignedQuestions: QuestionAssignments
}

export function requestedQuestionSources(count: number, bankRatio: number, priorCount = 0) {
  const share = Math.min(100, Math.max(0, bankRatio)) / 100
  return Array.from({ length: count }, (_, i) =>
    Math.round((priorCount + i + 1) * share) > Math.round((priorCount + i) * share)
      ? 'question_bank' as const : 'ai_generated' as const)
}

export function promptKey(question: Pick<WritingQuestion, 'promptLead' | 'promptDetail'>) {
  return `${question.promptLead} ${question.promptDetail}`.trim().toLowerCase().replace(/\s+/g, ' ')
}

const subtypes = {
  task1: { line: 'line_chart', bar: 'bar_chart', pie: 'pie_chart', mixed: 'mixed_charts', table: 'table', map: 'map', process: 'process' },
  task2: { agree_disagree: 'agree_disagree', discuss_both: 'discussion_opinion', advantages: 'advantages_disadvantages',
    problem_solution: 'problem_solution', cause_effect: 'cause_solution', two_part: 'two_part' }
} as const

export function focusQuestionTypes(mode: QuestionMode, diagnosis: StudyPlanDiagnosis, preferences: string[]) {
  const explicit: Record<string, string> = {
    task1_map: 'map', task1_process: 'process', task1_line: 'line_chart', task1_bar: 'bar_chart',
    task1_pie: 'pie_chart', task1_table: 'table', task1_mixed: 'mixed_charts',
    task2_opinion: 'agree_disagree', task2_discussion: 'discussion_opinion', task2_problem_solution: 'problem_solution',
    task2_advantages_disadvantages: 'advantages_disadvantages', task2_two_part: 'two_part'
  }
  const chosen = preferences.filter(key => key.startsWith(mode)).flatMap(key => explicit[key] ? [explicit[key]] : [])
  if (diagnosis.taskAbilities?.[mode]?.confidence === 'low') return chosen
  const estimates = mode === 'task1' ? diagnosis.task1SubtypePerformance : diagnosis.task2SubtypePerformance
  const map: Record<string, string> = subtypes[mode]
  return [...new Set([...chosen, ...Object.entries(estimates)
    .filter((entry): entry is [string, number] => entry[1] !== null && Boolean(map[entry[0]]))
    .sort(([a, as], [b, bs]) => as - bs || a.localeCompare(b)).map(([key]) => map[key])])]
}

export async function assignTrainingQuestions({
  tasks, bankRatio, bank, preferred, recent = [], priorCount = 0, generate
}: {
  tasks: TrainingTask[]
  bankRatio: number
  bank: Record<QuestionMode, WritingQuestion[]>
  preferred: Record<QuestionMode, string[]>
  recent?: Array<{ id?: string; prompt: string }>
  priorCount?: number
  generate: (mode: QuestionMode, subtype: string | undefined, exclude: string[]) => Promise<WritingQuestion | null>
}): Promise<AssignedTrainingTask[]> {
  const questionModes = (task: TrainingTask): QuestionMode[] =>
    task.taskType === 'full_test' ? ['task1', 'task2'] : task.writingMode ? [task.writingMode] : []
  const requests = requestedQuestionSources(tasks.flatMap(questionModes).length, bankRatio, priorCount)
  const ids = new Set(recent.flatMap(item => item.id ? [item.id] : []))
  const texts = new Set(recent.map(item => promptKey({ promptLead: item.prompt, promptDetail: '' })))
  const subtypeCounts = new Map<string, number>()
  const output: AssignedTrainingTask[] = []
  let index = 0
  for (const task of tasks) {
    const assignedQuestions: QuestionAssignments = {}
    for (const mode of questionModes(task)) {
      const expected = requests[index++]
      const variety = (type: string) => subtypeCounts.get(type) ?? 0
      const priority = (type: string) => {
        const i = preferred[mode].indexOf(type)
        return i < 0 ? 100 : i
      }
      const compare = (a: string, b: string) => variety(a) - variety(b) || priority(a) - priority(b)
      const eligible = bank[mode].filter(q => !ids.has(q.id) && !texts.has(promptKey(q)))
        .sort((a, b) => compare(a.questionType, b.questionType))
      const subtype = [...preferred[mode]].sort(compare)[0]
      let question: WritingQuestion | null = null
      let actual: AssignedQuestion['actual'] = null
      let fallbackReason: string | undefined
      if (expected === 'ai_generated') {
        question = await generate(mode, subtype, [...texts].slice(-20)).catch(() => null)
        if (question?.generatedSource === 'ai' && !texts.has(promptKey(question)) && !ids.has(question.id)) {
          actual = 'ai_generated'
        } else {
          fallbackReason = question?.generatedSource === 'ai' ? 'AI_DUPLICATE_QUESTION' : 'AI_GENERATION_FAILED'
          question = null
        }
      }
      if (!question) {
        question = eligible[0] ?? null
        if (question) actual = 'question_bank'
        else fallbackReason = fallbackReason ? `${fallbackReason};NO_UNUSED_BANK_QUESTION` : 'NO_UNUSED_BANK_QUESTION'
      }
      if (question) {
        ids.add(question.id)
        texts.add(promptKey(question))
        subtypeCounts.set(question.questionType, variety(question.questionType) + 1)
      }
      assignedQuestions[mode] = { question, expected, actual, fallbackReason }
    }

    const first = assignedQuestions.task1 ?? assignedQuestions.task2
    const missing = Object.values(assignedQuestions).some(assignment => !assignment.question)
    const taskResult: TrainingTask = missing ? {
      ...task, taskType: 'review', source: 'review', title: '写作准备 · 审题与提纲',
      description: '在练习页选一道对应题型，划出题目要求并列一个提纲；完成后记录一个下一次写作要检查的要点。',
      estimatedMinutes: Math.min(20, task.estimatedMinutes), writingMode: null
    } : task
    output.push({
      ...taskResult,
      questionId: missing ? null : first?.question?.id ?? null,
      questionSource: first?.actual ?? 'question_bank',
      originalQuestionSource: first?.expected ?? null,
      fallbackReason: Object.values(assignedQuestions).map(item => item.fallbackReason).filter(Boolean).join(';') || null,
      assignedQuestions: missing ? Object.fromEntries(Object.entries(assignedQuestions).map(([key, value]) =>
        [key, { ...value, actual: null, question: null }])) : assignedQuestions
    })
  }
  return output
}
