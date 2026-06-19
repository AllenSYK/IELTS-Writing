import {
  buildLocalGeneratedQuestion,
  buildPrompt,
  randomQuestionForSelection,
  type Task1QuestionType,
  type WritingQuestion
} from '@/lib/ielts-questions'
import {
  buildExcludePromptSummaries,
  currentPromptProfileId,
  findDuplicatePrompt,
  recordGeneratedPrompt
} from '@/lib/generated-prompt-history'
import { getRandomFallbackQuestion } from '@/lib/task1-fallback-questions'
import {
  normalizeGeneratedQuestion,
  readCachedQuestion,
  rememberQuestion
} from '@/lib/writing-session'
import type { PromptHistorySummary } from '@/lib/writing-prompt-generation'
import type { PromptSelection } from '@/lib/writing-options'

type TaskType = 'task1' | 'task2'

type GeneratePromptPayload = {
  taskType: TaskType
  selection: PromptSelection
  excludePromptSummaries: PromptHistorySummary[]
}

const pendingQuestionRequests = new Map<string, Promise<WritingQuestion>>()

async function requestGeneratedQuestion(userId: string, payload: GeneratePromptPayload) {
  const requestKey = `${userId}:${JSON.stringify(payload)}`
  const existing = pendingQuestionRequests.get(requestKey)
  if (existing) return existing

  const request = (async () => {
    const response = await fetch('/api/ai/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => null) as unknown
    const question = data && typeof data === 'object' && 'question' in data
      ? data.question
      : undefined
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : undefined
    if (!response.ok || !question) {
      throw new Error(message || '题目生成失败，请稍后重试。')
    }
    return normalizeGeneratedQuestion(question)
  })().finally(() => {
    pendingQuestionRequests.delete(requestKey)
  })

  pendingQuestionRequests.set(requestKey, request)
  return request
}

export async function generateQuestionForSelection({
  taskType,
  selection,
  userId,
  onNotice
}: {
  taskType: TaskType
  selection: PromptSelection
  userId: string
  onNotice: (message: string) => void
}) {
  const cachedQuestion = readCachedQuestion(userId, taskType, selection)
  if (cachedQuestion) return cachedQuestion

  const userProfileId = currentPromptProfileId(userId)
  const duplicateContext = {
    taskType,
    userId,
    userProfileId,
    chartType: taskType === 'task1' ? selection.task1ChartType : undefined,
    essayType: taskType === 'task2' ? selection.task2EssayType : undefined,
    topic: taskType === 'task2' ? selection.task2Topic : undefined
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const question = await requestGeneratedQuestion(userId, {
        taskType,
        selection,
        excludePromptSummaries: buildExcludePromptSummaries(taskType, userId, userProfileId, 20)
      })
      if (!findDuplicatePrompt(buildPrompt(question), duplicateContext).duplicate) {
        recordGeneratedPrompt(
          question,
          selection,
          question.generatedSource === 'ai' ? 'ai' : 'local-template',
          userId,
          userProfileId
        )
        return rememberQuestion(userId, taskType, selection, question)
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '题目生成失败，已改用本地题库。')
      break
    }
  }

  if (taskType === 'task1') {
    const fallback = getRandomFallbackQuestion(selection.task1ChartType)
    const questionType = selection.task1ChartType === 'random'
      ? fallback.chartType
      : selection.task1ChartType
    const question: WritingQuestion = {
      id: fallback.id,
      taskType: 'task1',
      title: fallback.title,
      promptLead: fallback.prompt,
      promptDetail: fallback.instructions,
      durationMinutes: 20,
      wordTarget: 150,
      questionType: questionType as Task1QuestionType,
      trainingType: 'academic',
      generatedSource: 'local-template',
      chartSpec: fallback.chartSpec,
      processSpec: fallback.processSpec,
      mapSpec: fallback.mapSpec
    }
    recordGeneratedPrompt(question, selection, 'local-template', userId, userProfileId)
    onNotice('已使用本地题库生成题目。')
    return rememberQuestion(userId, taskType, selection, question)
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const question = buildLocalGeneratedQuestion(taskType, selection, attempt)
    if (!findDuplicatePrompt(buildPrompt(question), duplicateContext).duplicate) {
      recordGeneratedPrompt(question, selection, 'local-template', userId, userProfileId)
      return rememberQuestion(userId, taskType, selection, question)
    }
  }

  const fallback = randomQuestionForSelection(taskType, selection)
  if (findDuplicatePrompt(buildPrompt(fallback), duplicateContext).duplicate) {
    onNotice('最近已经生成过高度相似题目，已显示题库中最接近当前选择的备用题。')
  }
  recordGeneratedPrompt(fallback, selection, 'static-bank', userId, userProfileId)
  return rememberQuestion(userId, taskType, selection, fallback)
}
