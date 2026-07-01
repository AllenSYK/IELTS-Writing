import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { generateWritingPromptWithAi } from '@/lib/writing-prompt-generation'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type { PromptSelection } from '@/lib/writing-options'

export type QuestionPick = {
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

export type QuestionSource = 'question_bank' | 'ai_generated'

export type TaskQuestionResult = {
  question: QuestionPick | null
  source: QuestionSource
  originalSource?: QuestionSource
  fallbackReason?: string
}

type Task1VisualCategory = 'map' | 'process' | 'chart'

function categorizeTask1Visual(visualTypes: string[] | null): Task1VisualCategory {
  if (!visualTypes || visualTypes.length === 0) return 'chart'
  if (visualTypes.includes('map')) return 'map'
  if (visualTypes.includes('process')) return 'process'
  return 'chart'
}

/**
 * Allocate question sources across a set of tasks based on the bank/AI ratio.
 * Returns an array of QuestionSource with length = totalTasks.
 * Distribution is spread evenly (not clustered).
 */
export function allocateQuestionSources(totalTasks: number, bankRatio: number): QuestionSource[] {
  if (totalTasks <= 0) return []

  const bankCount = Math.round(totalTasks * bankRatio / 100)
  const aiCount = totalTasks - bankCount

  const sources: QuestionSource[] = []

  // Build a base array with the right counts
  for (let i = 0; i < bankCount; i++) sources.push('question_bank')
  for (let i = 0; i < aiCount; i++) sources.push('ai_generated')

  // Shuffle using Fisher-Yates
  for (let i = sources.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]]
  }

  return sources
}

/**
 * Allocate sources for mock tests. Each mock has 2 questions (T1 + T2).
 * Returns per-question sources: [{ t1Source, t2Source }, ...]
 */
export function allocateMockSources(mockCount: number, bankRatio: number): Array<{ t1Source: QuestionSource; t2Source: QuestionSource }> {
  if (mockCount <= 0) return []

  const bankCount = Math.round(mockCount * bankRatio / 100)
  const aiCount = mockCount - bankCount

  const results: Array<{ t1Source: QuestionSource; t2Source: QuestionSource }> = []

  for (let i = 0; i < bankCount; i++) {
    results.push({ t1Source: 'question_bank', t2Source: 'question_bank' })
  }
  for (let i = 0; i < aiCount; i++) {
    results.push({ t1Source: 'ai_generated', t2Source: 'ai_generated' })
  }

  // Shuffle
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]]
  }

  return results
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
    bankRatio?: number
  }
): Promise<{
  task1Questions: TaskQuestionResult[]
  task2Questions: TaskQuestionResult[]
  mockPairs: Array<{ t1: TaskQuestionResult; t2: TaskQuestionResult }>
}> {
  const bankRatio = options.bankRatio ?? 80
  const service = createSupabaseServiceRoleClient()

  // Collect used question IDs from recent records and existing plan tasks
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

  // Load all published questions
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

  // Fallback: relax the "recently used" filter
  const filterAvailableLoose = (rows: Record<string, unknown>[]): QuestionPick[] => {
    return rows
      .filter((r) => {
        const id = r.id as string
        // Only exclude questions used in the current plan, not recent records
        if (planTasks?.some((t) => t.question_id === id)) return false
        return true
      })
      .map(toPick)
  }

  let availableTask1 = filterAvailable(allTask1 ?? [])
  let availableTask2 = filterAvailable(allTask2 ?? [])

  // Fallback: if not enough, relax filter
  if (availableTask1.length < options.task1Count) {
    availableTask1 = filterAvailableLoose(allTask1 ?? [])
  }
  if (availableTask2.length < options.task2Count) {
    availableTask2 = filterAvailableLoose(allTask2 ?? [])
  }

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

  // Allocate sources for Task 1
  const t1Sources = allocateQuestionSources(options.task1Count, bankRatio)
  const t1BankCount = t1Sources.filter((s) => s === 'question_bank').length
  const t1AiCount = options.task1Count - t1BankCount

  // Allocate sources for Task 2
  const t2Sources = allocateQuestionSources(options.task2Count, bankRatio)
  const t2BankCount = t2Sources.filter((s) => s === 'question_bank').length
  const t2AiCount = options.task2Count - t2BankCount

  // Allocate sources for mocks
  const mockSources = allocateMockSources(options.mockCount, bankRatio)

  // Select bank questions for Task 1
  const weaknesses = options.weaknesses ?? []
  const wantsMap = weaknesses.includes('task1_map') || options.preferredTask1Types?.includes('map')
  const wantsProcess = weaknesses.includes('task1_process') || options.preferredTask1Types?.includes('process')

  const bankTask1Questions: QuestionPick[] = []
  if (wantsMap && availableTask1.length > 0) {
    bankTask1Questions.push(...pickByVisualCategory(availableTask1, 'map', Math.min(2, t1BankCount)))
  }
  if (wantsProcess && bankTask1Questions.length < t1BankCount) {
    const needed = t1BankCount - bankTask1Questions.length
    bankTask1Questions.push(...pickByVisualCategory(availableTask1.filter((q) => !bankTask1Questions.some((s) => s.id === q.id)), 'process', Math.min(2, needed)))
  }
  if (bankTask1Questions.length < t1BankCount) {
    const remaining = availableTask1.filter((q) => !bankTask1Questions.some((s) => s.id === q.id))
    bankTask1Questions.push(...shuffle(remaining).slice(0, t1BankCount - bankTask1Questions.length))
  }

  // Select bank questions for Task 2
  const bankTask2Questions = pickDiverse(availableTask2, t2BankCount)

  // Select mock bank pairs
  const usedMockT1 = new Set(bankTask1Questions.map((q) => q.id))
  const usedMockT2 = new Set(bankTask2Questions.map((q) => q.id))
  const bankMockPairs: Array<{ t1: QuestionPick; t2: QuestionPick }> = []
  const bankMockCount = mockSources.filter((s) => s.t1Source === 'question_bank').length

  for (let i = 0; i < bankMockCount; i++) {
    const remainingT1 = availableTask1.filter((q) => !usedMockT1.has(q.id) && !bankTask1Questions.some((s) => s.id === q.id))
    const remainingT2 = availableTask2.filter((q) => !usedMockT2.has(q.id) && !bankTask2Questions.some((s) => s.id === q.id))
    const t1 = shuffle(remainingT1)[0] ?? shuffle(availableTask1)[0]
    const t2 = shuffle(remainingT2)[0] ?? shuffle(availableTask2)[0]
    if (t1 && t2) {
      bankMockPairs.push({ t1, t2 })
      usedMockT1.add(t1.id)
      usedMockT2.add(t2.id)
    }
  }

  // Build AI questions (generate lazily, with fallback to bank)
  const aiTask1Questions: QuestionPick[] = []
  const aiTask2Questions: QuestionPick[] = []

  for (let i = 0; i < t1AiCount; i++) {
    const aiQ = await generateAiQuestionSafe('task1_academic', weaknesses)
    if (aiQ) {
      aiTask1Questions.push(aiQ)
    } else if (bankTask1Questions.length > 0) {
      // Fallback: reuse a bank question
      aiTask1Questions.push({ ...bankTask1Questions[i % bankTask1Questions.length] })
    }
  }

  for (let i = 0; i < t2AiCount; i++) {
    const aiQ = await generateAiQuestionSafe('task2', weaknesses)
    if (aiQ) {
      aiTask2Questions.push(aiQ)
    } else if (bankTask2Questions.length > 0) {
      aiTask2Questions.push({ ...bankTask2Questions[i % bankTask2Questions.length] })
    }
  }

  // Build final task1 results with source tags
  const task1Results: TaskQuestionResult[] = []
  let bankIdx = 0
  let aiIdx = 0
  for (let i = 0; i < options.task1Count; i++) {
    const source = t1Sources[i]
    if (source === 'question_bank') {
      const q = bankTask1Questions[bankIdx % Math.max(1, bankTask1Questions.length)]
      bankIdx++
      if (q) {
        task1Results.push({ question: q, source: 'question_bank' })
      } else {
        task1Results.push({ question: null, source: 'question_bank', fallbackReason: 'NO_BANK_QUESTIONS' })
      }
    } else {
      const q = aiTask1Questions[aiIdx % Math.max(1, aiTask1Questions.length)]
      aiIdx++
      if (q) {
        // Check if AI generation failed and fell back to bank
        const isActuallyAi = q.id.startsWith('ai_') || q.sourceName === 'ai_generated'
        task1Results.push({
          question: q,
          source: isActuallyAi ? 'ai_generated' : 'question_bank',
          originalSource: isActuallyAi ? undefined : 'ai_generated',
          fallbackReason: isActuallyAi ? undefined : 'AI_FALLBACK_TO_BANK'
        })
      } else {
        task1Results.push({ question: null, source: 'ai_generated', fallbackReason: 'AI_GENERATION_FAILED' })
      }
    }
  }

  // Build final task2 results
  const task2Results: TaskQuestionResult[] = []
  bankIdx = 0
  aiIdx = 0
  for (let i = 0; i < options.task2Count; i++) {
    const source = t2Sources[i]
    if (source === 'question_bank') {
      const q = bankTask2Questions[bankIdx % Math.max(1, bankTask2Questions.length)]
      bankIdx++
      if (q) {
        task2Results.push({ question: q, source: 'question_bank' })
      } else {
        task2Results.push({ question: null, source: 'question_bank', fallbackReason: 'NO_BANK_QUESTIONS' })
      }
    } else {
      const q = aiTask2Questions[aiIdx % Math.max(1, aiTask2Questions.length)]
      aiIdx++
      if (q) {
        const isActuallyAi = q.id.startsWith('ai_') || q.sourceName === 'ai_generated'
        task2Results.push({
          question: q,
          source: isActuallyAi ? 'ai_generated' : 'question_bank',
          originalSource: isActuallyAi ? undefined : 'ai_generated',
          fallbackReason: isActuallyAi ? undefined : 'AI_FALLBACK_TO_BANK'
        })
      } else {
        task2Results.push({ question: null, source: 'ai_generated', fallbackReason: 'AI_GENERATION_FAILED' })
      }
    }
  }

  // Build mock pairs
  const mockResults: Array<{ t1: TaskQuestionResult; t2: TaskQuestionResult }> = []
  let bankMockIdx = 0

  for (let i = 0; i < options.mockCount; i++) {
    const src = mockSources[i]
    if (src.t1Source === 'question_bank' && src.t2Source === 'question_bank') {
      const pair = bankMockPairs[bankMockIdx % Math.max(1, bankMockPairs.length)]
      bankMockIdx++
      if (pair) {
        mockResults.push({
          t1: { question: pair.t1, source: 'question_bank' },
          t2: { question: pair.t2, source: 'question_bank' }
        })
      } else {
        mockResults.push({
          t1: { question: null, source: 'question_bank', fallbackReason: 'NO_BANK_QUESTIONS' },
          t2: { question: null, source: 'question_bank', fallbackReason: 'NO_BANK_QUESTIONS' }
        })
      }
    } else {
      // AI mock - generate both questions
      const [aiT1, aiT2] = await Promise.all([
        generateAiQuestionSafe('task1_academic', weaknesses),
        generateAiQuestionSafe('task2', weaknesses)
      ])
      const t1IsAi = aiT1 && (aiT1.id.startsWith('ai_') || aiT1.sourceName === 'ai_generated')
      const t2IsAi = aiT2 && (aiT2.id.startsWith('ai_') || aiT2.sourceName === 'ai_generated')

      mockResults.push({
        t1: {
          question: aiT1,
          source: t1IsAi ? 'ai_generated' : 'question_bank',
          originalSource: t1IsAi ? undefined : 'ai_generated',
          fallbackReason: t1IsAi ? undefined : 'AI_FALLBACK_TO_BANK'
        },
        t2: {
          question: aiT2,
          source: t2IsAi ? 'ai_generated' : 'question_bank',
          originalSource: t2IsAi ? undefined : 'ai_generated',
          fallbackReason: t2IsAi ? undefined : 'AI_FALLBACK_TO_BANK'
        }
      })
    }
  }

  return {
    task1Questions: task1Results,
    task2Questions: task2Results,
    mockPairs: mockResults
  }
}

/**
 * Try to generate an AI question. Returns null on failure.
 */
async function generateAiQuestionSafe(
  taskType: string,
  weaknesses: string[]
): Promise<QuestionPick | null> {
  try {
    const isTask1 = taskType === 'task1_academic'
    const chartType = isTask1 ? getRandomChartType(weaknesses) : 'random'
    const essayType = !isTask1 ? getRandomEssayType(weaknesses) : 'random'

    const selection: PromptSelection = {
      task1ChartType: chartType as PromptSelection['task1ChartType'],
      task1Subtype: 'random',
      task2EssayType: essayType as PromptSelection['task2EssayType'],
      task2Topic: 'random'
    }

    const question: WritingQuestion = await generateWritingPromptWithAi({
      taskType: isTask1 ? 'task1' : 'task2',
      excludePromptSummaries: [],
      selection
    })

    if (!question) return null

    const promptText = [question.promptLead, question.promptDetail].filter(Boolean).join(' ')

    return {
      id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: question.title || promptText.slice(0, 80) || '',
      questionText: promptText,
      taskType: isTask1 ? 'task1_academic' : 'task2',
      visualTypes: isTask1 ? [question.questionType || 'line_chart'] : null,
      visualData: (question.chartSpec ?? question.processSpec ?? question.mapSpec ?? null) as Record<string, unknown> | null,
      questionType: !isTask1 ? (question.questionType || null) : null,
      difficulty: 'medium',
      sourceName: 'ai_generated',
      sourceReference: null
    }
  } catch {
    return null
  }
}

function getRandomChartType(weaknesses: string[]): PromptSelection['task1ChartType'] {
  const weakMap: Record<string, PromptSelection['task1ChartType']> = {
    task1_line: 'line_chart',
    task1_bar: 'bar_chart',
    task1_pie: 'pie_chart',
    task1_table: 'table',
    task1_map: 'map',
    task1_process: 'process',
    task1_mixed: 'mixed_charts'
  }
  for (const w of weaknesses) {
    if (weakMap[w]) return weakMap[w]
  }
  const types: PromptSelection['task1ChartType'][] = ['line_chart', 'bar_chart', 'pie_chart', 'table', 'mixed_charts']
  return types[Math.floor(Math.random() * types.length)]
}

function getRandomEssayType(weaknesses: string[]): PromptSelection['task2EssayType'] {
  const weakMap: Record<string, PromptSelection['task2EssayType']> = {
    task2_opinion: 'agree_disagree',
    task2_discussion: 'discussion_opinion',
    task2_advantages_disadvantages: 'advantages_disadvantages',
    task2_problem_solution: 'problem_solution',
    task2_two_part: 'two_part'
  }
  for (const w of weaknesses) {
    if (weakMap[w]) return weakMap[w]
  }
  return 'random'
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
