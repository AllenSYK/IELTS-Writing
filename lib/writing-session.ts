import { z } from 'zod'
import {
  QuestionTypeLabels,
  type Task1QuestionType,
  type Task2QuestionType,
  type WritingQuestion
} from '@/lib/ielts-questions'
import {
  Task1MapSpecSchema,
  Task1ProcessSpecSchema,
  prepareTask1ChartSpec,
  type Task1ChartKind
} from '@/lib/task1-chart-schema'
import { getFallbackQuestionsByType } from '@/lib/task1-fallback-questions'
import { countWords, type WritingTaskType } from '@/lib/writing-records'
import type { PromptSelection } from '@/lib/writing-options'
import { userScopedStorageKey } from '@/lib/user-storage'

const QUESTION_CACHE_TTL_MS = 5 * 60 * 1_000

const DraftSchema = z.object({
  essay: z.string(),
  updatedAt: z.string(),
  wordCount: z.number(),
  questionId: z.string().optional(),
  chartSpec: z.record(z.unknown()).optional(),
  processSpec: z.record(z.unknown()).optional(),
  mapSpec: z.record(z.unknown()).optional(),
  imageUrl: z.string().optional(),
  promptLead: z.string().optional(),
  promptDetail: z.string().optional(),
  questionType: z.string().optional(),
  trainingType: z.string().optional(),
  title: z.string().optional()
})

const WritingQuestionSchema = z.object({
  id: z.string(),
  taskType: z.enum(['task1', 'task2']),
  title: z.string(),
  promptLead: z.string(),
  promptDetail: z.string(),
  durationMinutes: z.number(),
  wordTarget: z.number(),
  questionType: z.string(),
  trainingType: z.enum(['academic', 'general']).optional(),
  topic: z.string().optional(),
  generatedSource: z.enum(['ai', 'local-template', 'static-bank']).optional(),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  structuredData: z.record(z.unknown()).optional(),
  chartSpec: z.unknown().optional(),
  processSpec: z.unknown().optional(),
  mapSpec: z.unknown().optional()
})

const CachedQuestionSchema = z.object({
  question: WritingQuestionSchema,
  cachedAt: z.number()
})

const TimerStateSchema = z.object({
  endAt: z.number(),
  durationMs: z.number().optional(),
  startedAt: z.number().optional()
})

export type DraftPayload = z.infer<typeof DraftSchema>

type QuestionSource = {
  id: string
  questionId?: string
  taskType: string
  title: string
  prompt: string
  promptLead?: string
  promptDetail?: string
  questionType?: string
  trainingType?: string
  chartSpec?: Record<string, unknown>
  processSpec?: Record<string, unknown>
  mapSpec?: Record<string, unknown>
  imageUrl?: string
}

const recentQuestionCache = new Map<string, { question: WritingQuestion; cachedAt: number }>()

export function singleDraftKey(userId: string, mode: WritingTaskType) {
  return userScopedStorageKey(`ielts-writing-draft-${mode}`, userId)
}

export function mockDraftKey(userId: string, taskType: Exclude<WritingTaskType, 'mock'>) {
  return userScopedStorageKey(`ielts-writing-draft-mock-${taskType}`, userId)
}

export function timerKeyFor(userId: string, mode: WritingTaskType) {
  return userScopedStorageKey(`ielts-writing-timer-${mode}`, userId)
}

function questionCacheKey(
  userId: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  selection: PromptSelection
) {
  return userScopedStorageKey(
    `ielts-writing-question-cache:${taskType}:${JSON.stringify(selection)}`,
    userId
  )
}

export function expectedChartKind(questionType: string | undefined): Task1ChartKind | undefined {
  const map: Record<string, Task1ChartKind> = {
    line_graph: 'line',
    line_chart: 'line',
    dynamic_chart: 'line',
    bar_chart: 'bar',
    static_comparison: 'bar',
    pie_chart: 'pie',
    table: 'table',
    mixed_charts: 'mixed'
  }
  return questionType ? map[questionType] : undefined
}

function validChartSpec(spec: unknown, questionType: string | undefined) {
  const kind = expectedChartKind(questionType)
  if (!kind || !spec) return undefined
  const prepared = prepareTask1ChartSpec(spec, kind)
  return prepared.success ? prepared.data : undefined
}

function mixedFallbackChartSpec() {
  const fallback = getFallbackQuestionsByType('mixed_charts')[0]
  const prepared = prepareTask1ChartSpec(fallback?.chartSpec, 'mixed')
  return prepared.success ? prepared.data : undefined
}

export function normalizeGeneratedQuestion(value: unknown): WritingQuestion {
  const parsed = WritingQuestionSchema.safeParse(value)
  if (!parsed.success || !(parsed.data.questionType in QuestionTypeLabels)) {
    throw new Error('生成的题目数据格式不正确。')
  }
  const question: WritingQuestion = {
    ...parsed.data,
    questionType: parsed.data.questionType as Task1QuestionType | Task2QuestionType,
    chartSpec: undefined,
    processSpec: undefined,
    mapSpec: undefined
  }
  if (question.taskType !== 'task1') return question
  const kind = expectedChartKind(question.questionType)
  if (kind) {
    const prepared = prepareTask1ChartSpec(parsed.data.chartSpec, kind)
    if (!prepared.success) {
      throw new Error(`生成的图表数据未通过完整性校验：${prepared.errors.join('；')}`)
    }
    question.chartSpec = prepared.data
  }
  const processSpec = Task1ProcessSpecSchema.safeParse(parsed.data.processSpec)
  const mapSpec = Task1MapSpecSchema.safeParse(parsed.data.mapSpec)
  question.processSpec = processSpec.success ? processSpec.data : undefined
  question.mapSpec = mapSpec.success ? mapSpec.data : undefined
  return question
}

export function readCachedQuestion(
  userId: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  selection: PromptSelection
) {
  const key = questionCacheKey(userId, taskType, selection)
  const memoryCached = recentQuestionCache.get(key)
  if (memoryCached && Date.now() - memoryCached.cachedAt < QUESTION_CACHE_TTL_MS) {
    return memoryCached.question
  }

  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = CachedQuestionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || Date.now() - parsed.data.cachedAt >= QUESTION_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(key)
      return null
    }
    const question = normalizeGeneratedQuestion(parsed.data.question)
    recentQuestionCache.set(key, { question, cachedAt: parsed.data.cachedAt })
    return question
  } catch {
    window.sessionStorage.removeItem(key)
    return null
  }
}

export function rememberQuestion(
  userId: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  selection: PromptSelection,
  question: WritingQuestion
) {
  const key = questionCacheKey(userId, taskType, selection)
  const cachedAt = Date.now()
  recentQuestionCache.set(key, { question, cachedAt })
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ question, cachedAt }))
  } catch (error) {
    console.warn('[question-cache-write]', {
      key,
      error: error instanceof Error ? error.name : 'unknown'
    })
  }
  return question
}

export function readDraft(draftKey: string): DraftPayload | null {
  const raw = window.localStorage.getItem(draftKey)
  if (!raw) return null
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
    window.localStorage.removeItem(draftKey)
    return null
  } catch {
    // Drafts before v1 were stored as plain text rather than JSON.
    return {
      essay: raw,
      updatedAt: new Date().toISOString(),
      wordCount: countWords(raw)
    }
  }
}

export function writeDraft(
  draftKey: string,
  essay: string,
  questionId?: string,
  question?: WritingQuestion
) {
  const payload: DraftPayload = {
    essay,
    updatedAt: new Date().toISOString(),
    wordCount: countWords(essay),
    questionId,
    chartSpec: question ? validChartSpec(question.chartSpec, question.questionType) : undefined,
    processSpec: question?.processSpec,
    mapSpec: question?.mapSpec,
    imageUrl: question?.image,
    promptLead: question?.promptLead,
    promptDetail: question?.promptDetail,
    questionType: question?.questionType,
    trainingType: question?.trainingType,
    title: question?.title
  }
  window.localStorage.setItem(draftKey, JSON.stringify(payload))
}

export function restoreQuestionFromRecord(source: QuestionSource): WritingQuestion {
  const isTask1 = source.taskType === 'task1'
  const firstNewline = source.prompt.indexOf('\n')
  const promptLead = source.promptLead
    || (firstNewline > 0 ? source.prompt.slice(0, firstNewline) : source.prompt)
    || source.title
  const promptDetail = source.promptDetail
    ?? (firstNewline > 0 ? source.prompt.slice(firstNewline + 1) : '')
  const expectedKind = isTask1 ? expectedChartKind(source.questionType) : undefined
  const restoredChartSpec = validChartSpec(source.chartSpec, source.questionType)
    // Early mixed-chart records could contain the prompt without renderable visual data.
    || (expectedKind === 'mixed' ? mixedFallbackChartSpec() : undefined)
  const processSpec = Task1ProcessSpecSchema.safeParse(source.processSpec)
  const mapSpec = Task1MapSpecSchema.safeParse(source.mapSpec)

  return {
    id: source.questionId || `restored-${source.id}`,
    taskType: isTask1 ? 'task1' : 'task2',
    title: source.title,
    promptLead,
    promptDetail,
    durationMinutes: isTask1 ? 20 : 40,
    wordTarget: isTask1 ? 150 : 250,
    questionType: (source.questionType || (isTask1 ? 'line_chart' : 'opinion')) as Task1QuestionType | Task2QuestionType,
    trainingType: source.trainingType === 'general' ? 'general' : isTask1 ? 'academic' : undefined,
    generatedSource: 'static-bank',
    chartSpec: restoredChartSpec,
    processSpec: processSpec.success ? processSpec.data : undefined,
    mapSpec: mapSpec.success ? mapSpec.data : undefined,
    image: source.imageUrl
  }
}

export function readTimerEnd(timerKey: string, durationMinutes: number) {
  const durationMs = durationMinutes * 60 * 1_000
  const raw = window.localStorage.getItem(timerKey)
  if (raw) {
    try {
      const parsed = TimerStateSchema.safeParse(JSON.parse(raw))
      if (parsed.success && parsed.data.endAt > Date.now()) return parsed.data.endAt
    } catch {
      window.localStorage.removeItem(timerKey)
    }
  }

  const endAt = Date.now() + durationMs
  window.localStorage.setItem(timerKey, JSON.stringify({ endAt, durationMs, startedAt: Date.now() }))
  return endAt
}
