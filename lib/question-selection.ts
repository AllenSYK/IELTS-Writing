import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

type QuestionPick = {
  id: string
  title: string
  questionText: string
  taskType: string
  visualTypes: string[] | null
  visualData: Record<string, unknown> | null
  questionType: string | null
  difficulty: string | null
  sourceName: string | null
  sourceReference: string | null
}

type Task1VisualCategory = 'map' | 'process' | 'chart'

function categorizeTask1Visual(visualTypes: string[] | null): Task1VisualCategory {
  if (!visualTypes || visualTypes.length === 0) return 'chart'
  if (visualTypes.includes('map')) return 'map'
  if (visualTypes.includes('process')) return 'process'
  return 'chart'
}

export async function selectQuestionsForPlan(
  userId: string,
  options: {
    task1Count: number
    task2Count: number
    mockCount: number
    weaknesses?: string[]
    preferredTask1Types?: Task1VisualCategory[]
    preferredTask2Types?: string[]
  }
): Promise<{
  task1Questions: QuestionPick[]
  task2Questions: QuestionPick[]
  mockPairs: Array<{ task1: QuestionPick; task2: QuestionPick }>
}> {
  const service = createSupabaseServiceRoleClient()

  const { data: recentRecords } = await service
    .from('writing_records')
    .select('record_data')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(30)

  const usedQuestionIds = new Set<string>()
  const usedQuestionTexts = new Set<string>()

  for (const record of recentRecords ?? []) {
    const rd = record.record_data as Record<string, unknown> | null
    if (rd?.questionId) usedQuestionIds.add(rd.questionId as string)
    if (rd?.prompt) {
      const normalized = (rd.prompt as string).toLowerCase().trim().slice(0, 100)
      usedQuestionTexts.add(normalized)
    }
    const components = rd?.components as Record<string, Record<string, unknown>> | undefined
    if (components?.task1?.questionId) usedQuestionIds.add(components.task1.questionId as string)
    if (components?.task2?.questionId) usedQuestionIds.add(components.task2.questionId as string)
  }

  const { data: planTasks } = await service
    .from('study_plan_tasks')
    .select('question_id')
    .eq('user_id', userId)
    .not('question_id', 'is', null)

  for (const t of planTasks ?? []) {
    if (t.question_id) usedQuestionIds.add(t.question_id as string)
  }

  const { data: allTask1 } = await service
    .from('past_paper_questions')
    .select('id, title, question_text, task_type, task1_visual_types, task1_visual_data, task2_question_type, difficulty, source_name, source_reference')
    .eq('status', 'published')
    .eq('task_type', 'task1_academic')
    .order('published_at', { ascending: false })

  const { data: allTask2 } = await service
    .from('past_paper_questions')
    .select('id, title, question_text, task_type, task1_visual_types, task1_visual_data, task2_question_type, difficulty, source_name, source_reference')
    .eq('status', 'published')
    .eq('task_type', 'task2')
    .order('published_at', { ascending: false })

  const toPick = (row: Record<string, unknown>): QuestionPick => ({
    id: row.id as string,
    title: (row.title as string) || '',
    questionText: (row.question_text as string) || '',
    taskType: row.task_type as string,
    visualTypes: row.task1_visual_types as string[] | null,
    visualData: row.task1_visual_data as Record<string, unknown> | null,
    questionType: row.task2_question_type as string | null,
    difficulty: row.difficulty as string | null,
    sourceName: row.source_name as string | null,
    sourceReference: row.source_reference as string | null
  })

  const filterAvailable = (rows: Record<string, unknown>[]): QuestionPick[] => {
    return rows
      .filter((r) => {
        const id = r.id as string
        if (usedQuestionIds.has(id)) return false
        const text = (r.question_text as string || '').toLowerCase().trim().slice(0, 100)
        if (text && usedQuestionTexts.has(text)) return false
        return true
      })
      .map(toPick)
  }

  const availableTask1 = filterAvailable(allTask1 ?? [])
  const availableTask2 = filterAvailable(allTask2 ?? [])

  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const pickByVisualCategory = (questions: QuestionPick[], category: Task1VisualCategory, count: number): QuestionPick[] => {
    const matching = questions.filter((q) => categorizeTask1Visual(q.visualTypes) === category)
    const shuffled = shuffle(matching)
    return shuffled.slice(0, count)
  }

  const pickByQuestionType = (questions: QuestionPick[], qType: string | undefined, count: number): QuestionPick[] => {
    if (!qType) return shuffle(questions).slice(0, count)
    const matching = questions.filter((q) => q.questionType === qType)
    if (matching.length >= count) return shuffle(matching).slice(0, count)
    return shuffle(questions).slice(0, count)
  }

  const pickDiverse = (questions: QuestionPick[], count: number): QuestionPick[] => {
    const byType = new Map<string, QuestionPick[]>()
    for (const q of questions) {
      const key = q.questionType || 'unknown'
      const arr = byType.get(key) ?? []
      arr.push(q)
      byType.set(key, arr)
    }
    const result: QuestionPick[] = []
    const typeKeys = shuffle(Array.from(byType.keys()))
    let idx = 0
    while (result.length < count && typeKeys.length > 0) {
      const key = typeKeys[idx % typeKeys.length]
      const pool = byType.get(key)
      if (pool && pool.length > 0) {
        result.push(pool.shift()!)
      }
      idx++
      if (idx > count * 3) break
    }
    if (result.length < count) {
      const remaining = questions.filter((q) => !result.some((r) => r.id === q.id))
      result.push(...shuffle(remaining).slice(0, count - result.length))
    }
    return result
  }

  const selectedTask1: QuestionPick[] = []
  const selectedTask2: QuestionPick[] = []

  const weaknesses = options.weaknesses ?? []
  const wantsMap = weaknesses.includes('task1_map') || options.preferredTask1Types?.includes('map')
  const wantsProcess = weaknesses.includes('task1_process') || options.preferredTask1Types?.includes('process')

  if (wantsMap && availableTask1.length > 0) {
    selectedTask1.push(...pickByVisualCategory(availableTask1, 'map', Math.min(2, options.task1Count)))
  }
  if (wantsProcess && selectedTask1.length < options.task1Count) {
    const needed = options.task1Count - selectedTask1.length
    selectedTask1.push(...pickByVisualCategory(availableTask1.filter((q) => !selectedTask1.some((s) => s.id === q.id)), 'process', Math.min(2, needed)))
  }
  if (selectedTask1.length < options.task1Count) {
    const remaining = availableTask1.filter((q) => !selectedTask1.some((s) => s.id === q.id))
    selectedTask1.push(...shuffle(remaining).slice(0, options.task1Count - selectedTask1.length))
  }

  selectedTask2.push(...pickDiverse(availableTask2, options.task2Count))

  const mockPairs: Array<{ task1: QuestionPick; task2: QuestionPick }> = []
  const usedMockT1 = new Set(selectedTask1.map((q) => q.id))
  const usedMockT2 = new Set(selectedTask2.map((q) => q.id))

  for (let i = 0; i < options.mockCount; i++) {
    const remainingT1 = availableTask1.filter((q) => !usedMockT1.has(q.id) && !selectedTask1.some((s) => s.id === q.id))
    const remainingT2 = availableTask2.filter((q) => !usedMockT2.has(q.id) && !selectedTask2.some((s) => s.id === q.id))

    const t1 = shuffle(remainingT1)[0] ?? shuffle(availableTask1)[0]
    const t2 = shuffle(remainingT2)[0] ?? shuffle(availableTask2)[0]

    if (t1 && t2) {
      mockPairs.push({ task1: t1, task2: t2 })
      usedMockT1.add(t1.id)
      usedMockT2.add(t2.id)
    }
  }

  return {
    task1Questions: selectedTask1.slice(0, options.task1Count),
    task2Questions: selectedTask2.slice(0, options.task2Count),
    mockPairs
  }
}

export function buildQuestionSnapshot(question: QuestionPick): Record<string, unknown> {
  return {
    questionId: question.id,
    title: question.title,
    prompt: question.questionText.slice(0, 500),
    taskType: question.taskType,
    visualType: question.visualTypes?.[0] ?? null,
    questionType: question.questionType ?? null
  }
}
