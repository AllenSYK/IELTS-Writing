'use client'

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { AsyncButton, ConfirmDialog, useDebouncedValue, useNetworkStatus, useToast } from '@/components/interaction-system'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { MaterialIcon } from '@/components/app-ui'
import { Task1Visual } from '@/components/task1/Task1Visual'
import { useEssaySubmission, EVALUATION_STAGES, AI_EVALUATION_TIMEOUT_MS } from '@/components/use-essay-submission'
import {
  buildMockQuestionSetForSelection,
  buildPrompt,
  getQuestionById,
  questionLabel,
  randomQuestionForSelection,
  type WritingQuestion
} from '@/lib/ielts-questions'
import {
  countWords,
  createRecordId,
  getLocalDeviceId,
  getWritingRecordFromServer,
  saveWritingRecord,
  type EssayEvaluation,
  type WritingRecord,
  type WritingTaskType
} from '@/lib/writing-records'
import {
  WritingEvaluationError,
  combineMockEvaluation,
  requestEssayEvaluation,
  type EssayEvaluationRequest
} from '@/lib/writing-evaluation'
import {
  mockDraftKey,
  deleteAccountDraft,
  readAccountDraft,
  readTimerEnd,
  restoreQuestionFromRecord,
  singleDraftKey,
  timerKeyFor,
  writeDraft
} from '@/lib/writing-session'
import { markGeneratedPromptCompleted } from '@/lib/generated-prompt-history'
import { generateQuestionForSelection } from '@/lib/writing-question-generation'
import {
  DefaultPromptSelection,
  Task1ChartLabels,
  Task1SubtypeLabels,
  Task2EssayLabels,
  Task2TopicLabels,
  selectionFromSearchParams,
  type PromptSelection
} from '@/lib/writing-options'
import { userScopedStorageKey } from '@/lib/user-storage'

type MockTaskType = Exclude<WritingTaskType, 'mock'>
type MockEssays = Record<MockTaskType, string>
type MockQuestions = Record<MockTaskType, WritingQuestion>

type SaveStatus = 'restoring' | 'idle' | 'saving' | 'saved' | 'offline' | 'error'

const mockTaskOrder: MockTaskType[] = ['task1', 'task2']

const pendingEvaluations = new Map<string, Promise<EssayEvaluation>>()

function normalizeMode(value: string | string[] | undefined): WritingTaskType {
  const mode = Array.isArray(value) ? value[0] : value
  if (mode === 'task1' || mode === 'task2' || mode === 'mock') return mode
  return 'task2'
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function defaultQuestionFor(mode: WritingTaskType, selection = DefaultPromptSelection) {
  return randomQuestionForSelection(mode === 'task1' ? 'task1' : 'task2', selection)
}

export default function WritePage() {
  const params = useParams()
  const router = useRouter()
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const online = useNetworkStatus()
  const mode = normalizeMode(params.mode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const layoutRef = useRef<HTMLElement>(null)
  const lastAutoSaveAtRef = useRef(0)
  const [singleQuestion, setSingleQuestion] = useState<WritingQuestion | null>(null)
  const [mockQuestions, setMockQuestions] = useState<MockQuestions | null>(null)
  const [activeMockTask, setActiveMockTask] = useState<MockTaskType>('task1')
  const [essay, setEssay] = useState('')
  const [mockEssays, setMockEssays] = useState<MockEssays>({ task1: '', task2: '' })
  const debouncedEssay = useDebouncedValue(essay, 900)
  const debouncedMockEssays = useDebouncedValue(mockEssays, 900)
  const [timeLeft, setTimeLeft] = useState(mode === 'task1' ? 1200 : mode === 'task2' ? 2400 : 3600)
  const [spellcheck, setSpellcheck] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('restoring')
  const [draftRestored, setDraftRestored] = useState(false)
  const [showShortfallConfirm, setShowShortfallConfirm] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showTimeConfirm, setShowTimeConfirm] = useState(false)
  const [splitWidth, setSplitWidth] = useState(50)
  const [error, setError] = useState('')
  const [promptSelection, setPromptSelection] = useState<PromptSelection>(DefaultPromptSelection)
  const [promptGenerationNotice, setPromptGenerationNotice] = useState('')

  const submission = useEssaySubmission({
    onError: (message) => setError(message),
    onInfoToast: (title, message) => pushToast({ kind: 'info', title, message })
  })

  const activeQuestion = mode === 'mock' ? mockQuestions?.[activeMockTask] ?? null : singleQuestion
  const activeEssay = mode === 'mock' ? mockEssays[activeMockTask] : essay
  const activeTaskType: MockTaskType = mode === 'mock' ? activeMockTask : mode === 'task1' ? 'task1' : 'task2'
  const durationMinutes = mode === 'mock' ? 60 : activeQuestion?.durationMinutes ?? (mode === 'task1' ? 20 : 40)
  const wordTarget = activeQuestion?.wordTarget ?? (activeTaskType === 'task1' ? 150 : 250)
  const wordCount = useMemo(() => countWords(activeEssay), [activeEssay])
  const mockWordCounts = useMemo(
    () => ({
      task1: countWords(mockEssays.task1),
      task2: countWords(mockEssays.task2)
    }),
    [mockEssays]
  )
  const totalMockWords = mockWordCounts.task1 + mockWordCounts.task2
  const progress = 62.8 - (timeLeft / (durationMinutes * 60)) * 62.8
  const { loading, submitStatus, stageIndex, elapsedTime, cancelEvaluation, runSubmission } = submission
  const timerTone = timeLeft <= 60 ? 'timer-critical' : timeLeft <= 600 ? 'timer-warning' : ''
  const promptChoiceSummary =
    mode === 'task1'
      ? Task1ChartLabels[promptSelection.task1ChartType]
      : mode === 'task2'
        ? `${Task2EssayLabels[promptSelection.task2EssayType]} · ${Task2TopicLabels[promptSelection.task2Topic]}`
        : `${Task1ChartLabels[promptSelection.task1ChartType]} + ${Task2EssayLabels[promptSelection.task2EssayType]} · ${Task2TopicLabels[promptSelection.task2Topic]}`
  const timerKey = userId ? timerKeyFor(userId, mode) : ''
  const positionKey = userId ? userScopedStorageKey(`ielts-writing-editor-position-${mode}-${activeTaskType}`, userId) : ''
  const splitKey = userId ? userScopedStorageKey(`ielts-writing-editor-split-${mode}`, userId) : ''

  const saveAllDrafts = useCallback(
    (showToast = false) => {
      if (!userId) return
      try {
        if (mode === 'mock') {
          if (mockQuestions) {
            writeDraft(mockDraftKey(userId, 'task1'), mockEssays.task1, mockQuestions.task1.id, mockQuestions.task1, { userId, taskType: 'task1' })
            writeDraft(mockDraftKey(userId, 'task2'), mockEssays.task2, mockQuestions.task2.id, mockQuestions.task2, { userId, taskType: 'task2' })
          }
        } else if (singleQuestion) {
          writeDraft(singleDraftKey(userId, mode), essay, singleQuestion.id, singleQuestion, { userId, taskType: mode })
        }
        lastAutoSaveAtRef.current = Date.now()
        setSaveStatus(online ? 'saved' : 'offline')
        if (showToast) {
          pushToast({
            kind: online ? 'success' : 'info',
            title: online ? '草稿已保存' : '已保存到本地',
            message: online ? undefined : '网络恢复后可以继续提交。'
          })
        }
      } catch {
        setSaveStatus('error')
        if (showToast) pushToast({ kind: 'error', title: '保存失败', message: '请检查磁盘空间后重试。' })
      }
    },
    [essay, mockEssays, mockQuestions, mode, online, pushToast, singleQuestion, userId]
  )
  const generateInitialQuestion = useEffectEvent(generateQuestionFor)
  const notifyInitialRestore = useEffectEvent(pushToast)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    window.queueMicrotask(() => {
      void (async () => {
        const params = new URLSearchParams(window.location.search)
        const selection = selectionFromSearchParams(params)
        const recordId = params.get('record')
        const sourceRecord = recordId ? await getWritingRecordFromServer(userId, recordId) : null
        if (cancelled) return
        setPromptSelection(selection)

        if (mode === 'mock') {
          const fallback = buildMockQuestionSetForSelection(selection)
          const [task1Draft, task2Draft] = await Promise.all([
            readAccountDraft(mockDraftKey(userId, 'task1')),
            readAccountDraft(mockDraftKey(userId, 'task2'))
          ])
          const restoredTask1 = sourceRecord?.components?.task1?.essay || task1Draft?.essay || ''
          const restoredTask2 = sourceRecord?.components?.task2?.essay || task2Draft?.essay || ''

          const task1QuestionPromise = (async () => {
            if (sourceRecord) {
              const task1Comp = sourceRecord.components?.task1
              let restored = restoreQuestionFromRecord({
                id: sourceRecord.id,
                questionId: task1Comp?.questionId || sourceRecord.questionId?.split('+')[0],
                taskType: 'task1',
                title: task1Comp?.title || sourceRecord.title,
                prompt: task1Comp?.prompt || '',
                promptLead: task1Comp?.promptLead,
                promptDetail: task1Comp?.promptDetail,
                questionType: task1Comp?.questionType,
                trainingType: task1Comp?.trainingType,
                chartSpec: task1Comp?.chartSpec || sourceRecord.chartSpec,
                processSpec: task1Comp?.processSpec || sourceRecord.processSpec,
                mapSpec: task1Comp?.mapSpec || sourceRecord.mapSpec,
                imageUrl: task1Comp?.imageUrl
              })
              if (!restored.chartSpec && !restored.processSpec && !restored.mapSpec && !restored.image) {
                const bankQuestion = getQuestionById(task1Comp?.questionId || sourceRecord.questionId?.split('+')[0])
                if (bankQuestion && (bankQuestion.chartSpec || bankQuestion.processSpec || bankQuestion.mapSpec || bankQuestion.image)) {
                  restored = {
                    ...restored,
                    chartSpec: bankQuestion.chartSpec,
                    processSpec: bankQuestion.processSpec,
                    mapSpec: bankQuestion.mapSpec,
                    image: bankQuestion.image || restored.image,
                    imageAlt: bankQuestion.imageAlt || restored.imageAlt
                  }
                }
              }
              return restored
            }
            if (task1Draft && (task1Draft.chartSpec || task1Draft.processSpec || task1Draft.mapSpec)) {
              return restoreQuestionFromRecord({
                id: 'draft-mock-task1',
                questionId: task1Draft.questionId,
                taskType: 'task1',
                title: task1Draft.title || '',
                prompt: '',
                promptLead: task1Draft.promptLead,
                promptDetail: task1Draft.promptDetail,
                questionType: task1Draft.questionType,
                trainingType: task1Draft.trainingType,
                chartSpec: task1Draft.chartSpec,
                processSpec: task1Draft.processSpec,
                mapSpec: task1Draft.mapSpec,
                imageUrl: task1Draft.imageUrl
              })
            }
            return getQuestionById(task1Draft?.questionId)
              || (restoredTask1 ? fallback.task1 : generateInitialQuestion('task1', selection))
          })()

          const task2QuestionPromise = (async () => {
            if (sourceRecord) {
              const task2Comp = sourceRecord.components?.task2
              return restoreQuestionFromRecord({
                id: sourceRecord.id,
                questionId: task2Comp?.questionId || sourceRecord.questionId?.split('+')[1],
                taskType: 'task2',
                title: task2Comp?.title || sourceRecord.title,
                prompt: task2Comp?.prompt || '',
                promptLead: task2Comp?.promptLead,
                promptDetail: task2Comp?.promptDetail,
                questionType: task2Comp?.questionType,
                trainingType: task2Comp?.trainingType,
                chartSpec: task2Comp?.chartSpec,
                processSpec: task2Comp?.processSpec,
                mapSpec: task2Comp?.mapSpec,
                imageUrl: task2Comp?.imageUrl
              })
            }
            return getQuestionById(task2Draft?.questionId)
              || (restoredTask2 ? fallback.task2 : generateInitialQuestion('task2', selection))
          })()

          const [task1Question, task2Question] = await Promise.all([
            task1QuestionPromise,
            task2QuestionPromise
          ])

          if (cancelled) return
          setMockQuestions({ task1: task1Question, task2: task2Question })
          setMockEssays({ task1: restoredTask1, task2: restoredTask2 })
          if (restoredTask1 || restoredTask2) {
            setDraftRestored(true)
            setSaveStatus('saved')
            notifyInitialRestore({ kind: 'success', title: sourceRecord ? '已带回模考作文' : '已恢复模考草稿' })
          } else {
            setSaveStatus('idle')
          }
        } else {
          const taskType = mode === 'task1' ? 'task1' : 'task2'
          const draft = await readAccountDraft(singleDraftKey(userId, mode))
          const restoredEssay = sourceRecord?.essay || draft?.essay || ''
          let question: WritingQuestion | null = null

          if (sourceRecord) {
            question = restoreQuestionFromRecord(sourceRecord)
            if (question && !question.chartSpec && !question.processSpec && !question.mapSpec && !question.image && sourceRecord.questionId) {
              const bankQuestion = getQuestionById(sourceRecord.questionId)
              if (bankQuestion && (bankQuestion.chartSpec || bankQuestion.processSpec || bankQuestion.mapSpec || bankQuestion.image)) {
                question = {
                  ...question,
                  chartSpec: bankQuestion.chartSpec,
                  processSpec: bankQuestion.processSpec,
                  mapSpec: bankQuestion.mapSpec,
                  image: bankQuestion.image || question.image,
                  imageAlt: bankQuestion.imageAlt || question.imageAlt
                }
              }
            }
          }
          if (!question && draft && (draft.chartSpec || draft.processSpec || draft.mapSpec)) {
            question = restoreQuestionFromRecord({
              id: `draft-${mode}`,
              questionId: draft.questionId,
              taskType,
              title: draft.title || '',
              prompt: '',
              promptLead: draft.promptLead,
              promptDetail: draft.promptDetail,
              questionType: draft.questionType,
              trainingType: draft.trainingType,
              chartSpec: draft.chartSpec,
              processSpec: draft.processSpec,
              mapSpec: draft.mapSpec,
              imageUrl: draft.imageUrl
            })
          }
          if (!question && draft?.questionId) {
            question = getQuestionById(draft.questionId)
          }
          if (!question) {
            question = restoredEssay ? defaultQuestionFor(taskType, selection) : await generateInitialQuestion(taskType, selection)
          }
          if (cancelled) return
          setSingleQuestion(question)
          if (sourceRecord?.essay) {
            setEssay(sourceRecord.essay)
            setDraftRestored(true)
            setSaveStatus('saved')
            notifyInitialRestore({ kind: 'info', title: '已带回原文', message: '你可以继续修改，原批改结果仍保留在历史记录中。' })
          } else if (draft?.essay) {
            setEssay(draft.essay)
            setDraftRestored(true)
            setSaveStatus('saved')
            notifyInitialRestore({ kind: 'success', title: '已恢复草稿', message: `上次保存于 ${new Date(draft.updatedAt).toLocaleTimeString()}` })
          } else {
            setSaveStatus('idle')
          }
        }

        const initialDurationMinutes = mode === 'mock' ? 60 : mode === 'task1' ? 20 : 40
        const endAt = readTimerEnd(timerKey, initialDurationMinutes)
        setTimeLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))

        const storedSplit = Number(window.localStorage.getItem(splitKey))
        if (Number.isFinite(storedSplit) && storedSplit >= 34 && storedSplit <= 66) {
          setSplitWidth(storedSplit)
        }

        setHydrated(true)
      })()
    })

    return () => {
      cancelled = true
    }
  }, [mode, splitKey, timerKey, userId])

  useEffect(() => {
    if (!timerKey) return
    const timer = window.setInterval(() => {
      const endAt = readTimerEnd(timerKey, durationMinutes)
      setTimeLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [durationMinutes, timerKey])

  useEffect(() => {
    if (!hydrated) return
    const hasContent = mode === 'mock' ? Boolean(debouncedMockEssays.task1.trim() || debouncedMockEssays.task2.trim()) : Boolean(debouncedEssay.trim())
    if (!hasContent) {
      const idleTimer = window.setTimeout(() => setSaveStatus('idle'), 0)
      return () => window.clearTimeout(idleTimer)
    }
    const statusTimer = window.setTimeout(() => setSaveStatus(online ? 'saving' : 'offline'), 0)
    const elapsed = Date.now() - lastAutoSaveAtRef.current
    const delay = Math.max(0, 3500 - elapsed)
    const timer = window.setTimeout(() => saveAllDrafts(false), delay)
    return () => {
      window.clearTimeout(statusTimer)
      window.clearTimeout(timer)
    }
  }, [debouncedEssay, debouncedMockEssays, hydrated, mode, online, saveAllDrafts])

  useEffect(() => {
    if (timeLeft === 0 && hydrated && submitStatus === 'idle') {
      const timer = window.setTimeout(() => setShowTimeConfirm(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [hydrated, submitStatus, timeLeft])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'saving' || saveStatus === 'error') {
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveStatus])

  const saveNow = useCallback(() => saveAllDrafts(true), [saveAllDrafts])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveNow()
      }
      if (modifier && event.key === 'Enter') {
        event.preventDefault()
        if (hasWordShortfall()) setShowShortfallConfirm(true)
        else setShowSubmitConfirm(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    if (!positionKey) return
    window.requestAnimationFrame(() => {
      const storedPosition = window.localStorage.getItem(positionKey)
      if (storedPosition && textareaRef.current) {
        try {
          const parsed = JSON.parse(storedPosition) as { start?: number; end?: number; scrollTop?: number }
          textareaRef.current.selectionStart = parsed.start ?? textareaRef.current.selectionStart
          textareaRef.current.selectionEnd = parsed.end ?? textareaRef.current.selectionEnd
          textareaRef.current.scrollTop = parsed.scrollTop ?? 0
        } catch {
          // Ignore corrupted cursor state.
        }
      }
    })
  }, [positionKey, activeMockTask])

  const persistEditorPosition = useCallback(() => {
    if (!textareaRef.current || !positionKey) return
    window.localStorage.setItem(
      positionKey,
      JSON.stringify({
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
        scrollTop: textareaRef.current.scrollTop
      })
    )
  }, [positionKey])

  async function evaluateEssay(
    payload: EssayEvaluationRequest,
    dedupeKey?: string,
    signal?: AbortSignal
  ) {
    if (dedupeKey && pendingEvaluations.has(dedupeKey)) {
      return pendingEvaluations.get(dedupeKey)!
    }

    const evaluationPromise = (async () => {
      try {
        return await requestEssayEvaluation(payload, {
          signal,
          timeoutMs: AI_EVALUATION_TIMEOUT_MS
        })
      } finally {
        if (dedupeKey) pendingEvaluations.delete(dedupeKey)
      }
    })()

    if (dedupeKey) pendingEvaluations.set(dedupeKey, evaluationPromise)
    return evaluationPromise
  }

  async function generateQuestionFor(taskType: MockTaskType, selection: PromptSelection) {
    if (!userId) throw new Error('用户身份尚未确认。')
    return generateQuestionForSelection({
      taskType,
      selection,
      userId,
      onNotice: setPromptGenerationNotice
    })
  }

  async function submitCurrent() {
    if (mode === 'mock') return submitMock()
    return submitSingle()
  }

  async function submitSingle() {
    if (loading || !userId) return
    setError('')
    if (!online) {
      setError('当前离线。作文已保存在本地，网络恢复后再提交批改。')
      pushToast({ kind: 'warning', title: '当前离线', message: '写作不会丢失，请稍后重试提交。' })
      return
    }
    if (!activeQuestion) {
      setError('题目加载失败，请返回练习页重试。')
      return
    }
    if (essay.trim().length < 50) {
      setError('请至少输入 50 个字符后再提交批改。当前字数：' + countWords(essay))
      pushToast({ kind: 'warning', title: '字数不足', message: `当前 ${countWords(essay)} 字，至少需要 50 字才能提交批改。` })
      return
    }

    const essayHashKey = `${userId}:${essay.trim().toLowerCase().slice(0, 100)}:${activeQuestion.taskType}`
    if (pendingEvaluations.has(essayHashKey)) {
      const confirmResubmit = window.confirm('检测到相同内容的批改正在进行中。\n\n点击"确定"等待当前批改完成，\n点击"取消"强制重新批改。')
      if (!confirmResubmit) {
        pendingEvaluations.delete(essayHashKey)
      } else {
        pushToast({ kind: 'info', title: '正在处理中', message: '请等待当前批改完成。' })
        return
      }
    }

    await runSubmission(async (signal, setStage) => {
      saveAllDrafts(false)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      if (signal.aborted) throw new WritingEvaluationError('cancelled', '批改已取消。')
      submission.setSubmitStatus('submitting')
      setStage(1)

      const evaluation = await evaluateEssay({
        essay,
        taskType: activeQuestion.taskType,
        prompt: buildPrompt(activeQuestion),
        questionType: activeQuestion.questionType
      }, essayHashKey, signal)

      if (signal.aborted) throw new WritingEvaluationError('cancelled', '批改已取消。')
      setStage(2)
      await new Promise((resolve) => window.setTimeout(resolve, 100))
      setStage(3)

      submission.setSubmitStatus('organizing')
      setStage(4)
      await new Promise((resolve) => window.setTimeout(resolve, 150))

      const now = new Date().toISOString()
      const record: WritingRecord = {
        id: createRecordId(),
        requestId: evaluation.requestId,
        deviceId: getLocalDeviceId(),
        taskType: activeQuestion.taskType,
        title: activeQuestion.title,
        prompt: buildPrompt(activeQuestion),
        essay,
        originalEssay: essay,
        submittedAt: now,
        durationSeconds: durationMinutes * 60 - timeLeft,
        wordCount,
        evaluation,
        acceptedChanges: [],
        annotationVersion: evaluation.annotationVersion,
        questionId: activeQuestion.id,
        questionType: activeQuestion.questionType,
        trainingType: activeQuestion.trainingType,
        chartSpec: activeQuestion.chartSpec as Record<string, unknown> | undefined,
        processSpec: activeQuestion.processSpec as Record<string, unknown> | undefined,
        mapSpec: activeQuestion.mapSpec as Record<string, unknown> | undefined,
        promptLead: activeQuestion.promptLead,
        promptDetail: activeQuestion.promptDetail,
        imageUrl: activeQuestion.image
      }

      await saveWritingRecord(userId, record)
      markGeneratedPromptCompleted(activeQuestion.id, userId)
      deleteAccountDraft(singleDraftKey(userId, mode))
      window.localStorage.removeItem(timerKey)
      setStage(5)
      submission.setSubmitStatus('success')
      pushToast({ kind: 'success', title: '批改完成', message: '正在打开结果页。' })
      router.push(`/result?id=${record.id}`)
    })
  }

  async function submitMock() {
    if (loading || !userId) return
    setError('')
    if (!online) {
      setError('当前离线。两篇作文已保存在本地，网络恢复后再提交批改。')
      pushToast({ kind: 'warning', title: '当前离线', message: '模考草稿不会丢失，请稍后重试提交。' })
      return
    }
    if (!mockQuestions) {
      setError('模考题目加载失败，请返回练习页重试。')
      return
    }
    if (mockEssays.task1.trim().length < 50 || mockEssays.task2.trim().length < 50) {
      setError('完整模考需要 Task 1 和 Task 2 都至少输入 50 个字符。')
      return
    }

    const dedupeKey1 = `${userId}:mock-task1:${mockEssays.task1.trim().toLowerCase().slice(0, 100)}`
    const dedupeKey2 = `${userId}:mock-task2:${mockEssays.task2.trim().toLowerCase().slice(0, 100)}`

    await runSubmission(async (signal, setStage) => {
      saveAllDrafts(false)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      submission.setSubmitStatus('submitting')
      setStage(1)

      const task1Evaluation = await evaluateEssay({
        essay: mockEssays.task1,
        taskType: 'task1',
        prompt: buildPrompt(mockQuestions.task1),
        questionType: mockQuestions.task1.questionType
      }, dedupeKey1, signal)

      setStage(2)
      const task2Evaluation = await evaluateEssay({
        essay: mockEssays.task2,
        taskType: 'task2',
        prompt: buildPrompt(mockQuestions.task2),
        questionType: mockQuestions.task2.questionType
      }, dedupeKey2, signal)

      setStage(3)
      submission.setSubmitStatus('organizing')
      setStage(4)
      await new Promise((resolve) => window.setTimeout(resolve, 150))

      const now = new Date().toISOString()
      const elapsedSeconds = durationMinutes * 60 - timeLeft
      const task1Share = totalMockWords > 0 ? mockWordCounts.task1 / totalMockWords : 0.33
      const task1Duration = Math.round(elapsedSeconds * task1Share)
      const task2Duration = Math.max(0, elapsedSeconds - task1Duration)
      const evaluation = combineMockEvaluation(task1Evaluation, task2Evaluation, mockEssays.task1)
      const originalEssay = `Task 1\n${mockEssays.task1}\n\nTask 2\n${mockEssays.task2}`
      const record: WritingRecord = {
        id: createRecordId(),
        requestId: evaluation.requestId,
        deviceId: getLocalDeviceId(),
        taskType: 'mock',
        title: 'Full IELTS Writing Test',
        prompt: `Task 1\n${buildPrompt(mockQuestions.task1)}\n\nTask 2\n${buildPrompt(mockQuestions.task2)}`,
        essay: originalEssay,
        originalEssay,
        submittedAt: now,
        durationSeconds: elapsedSeconds,
        wordCount: totalMockWords,
        evaluation,
        acceptedChanges: [],
        annotationVersion: evaluation.annotationVersion,
        questionId: `${mockQuestions.task1.id}+${mockQuestions.task2.id}`,
        questionType: 'mock',
        chartSpec: mockQuestions.task1.chartSpec as Record<string, unknown> | undefined,
        processSpec: mockQuestions.task1.processSpec as Record<string, unknown> | undefined,
        mapSpec: mockQuestions.task1.mapSpec as Record<string, unknown> | undefined,
        promptLead: mockQuestions.task1.promptLead,
        promptDetail: mockQuestions.task1.promptDetail,
        imageUrl: mockQuestions.task1.image,
        components: {
          task1: {
            taskType: 'task1',
            title: mockQuestions.task1.title,
            prompt: buildPrompt(mockQuestions.task1),
            essay: mockEssays.task1,
            durationSeconds: task1Duration,
            wordCount: mockWordCounts.task1,
            evaluation: task1Evaluation,
            questionId: mockQuestions.task1.id,
            questionType: mockQuestions.task1.questionType,
            trainingType: mockQuestions.task1.trainingType,
            chartSpec: mockQuestions.task1.chartSpec as Record<string, unknown> | undefined,
            processSpec: mockQuestions.task1.processSpec as Record<string, unknown> | undefined,
            mapSpec: mockQuestions.task1.mapSpec as Record<string, unknown> | undefined,
            imageUrl: mockQuestions.task1.image,
            promptLead: mockQuestions.task1.promptLead,
            promptDetail: mockQuestions.task1.promptDetail
          },
          task2: {
            taskType: 'task2',
            title: mockQuestions.task2.title,
            prompt: buildPrompt(mockQuestions.task2),
            essay: mockEssays.task2,
            durationSeconds: task2Duration,
            wordCount: mockWordCounts.task2,
            evaluation: task2Evaluation,
            questionId: mockQuestions.task2.id,
            questionType: mockQuestions.task2.questionType,
            chartSpec: mockQuestions.task2.chartSpec as Record<string, unknown> | undefined,
            processSpec: mockQuestions.task2.processSpec as Record<string, unknown> | undefined,
            mapSpec: mockQuestions.task2.mapSpec as Record<string, unknown> | undefined,
            imageUrl: mockQuestions.task2.image,
            promptLead: mockQuestions.task2.promptLead,
            promptDetail: mockQuestions.task2.promptDetail
          }
        }
      }

      await saveWritingRecord(userId, record)
      markGeneratedPromptCompleted(mockQuestions.task1.id, userId)
      markGeneratedPromptCompleted(mockQuestions.task2.id, userId)
      deleteAccountDraft(mockDraftKey(userId, 'task1'))
      deleteAccountDraft(mockDraftKey(userId, 'task2'))
      window.localStorage.removeItem(timerKey)
      setStage(5)
      submission.setSubmitStatus('success')
      pushToast({ kind: 'success', title: '模考批改完成', message: '正在打开完整结果。' })
      router.push(`/result?id=${record.id}`)
    })
  }

  function hasWordShortfall() {
    if (mode !== 'mock') return wordCount < wordTarget
    return mockWordCounts.task1 < 150 || mockWordCounts.task2 < 250
  }

  function requestSubmit() {
    if (hasWordShortfall()) {
      setShowShortfallConfirm(true)
      return
    }
    void submitCurrent()
  }

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const layout = layoutRef.current
    if (!layout) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = layout.getBoundingClientRect()
    const move = (moveEvent: PointerEvent) => {
      const next = ((moveEvent.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(66, Math.max(34, next))
      setSplitWidth(clamped)
      window.localStorage.setItem(splitKey, String(clamped))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function resetSplit() {
    setSplitWidth(50)
    window.localStorage.setItem(splitKey, '50')
    pushToast({ kind: 'info', title: '布局已恢复默认' })
  }

  function updateActiveEssay(value: string) {
    if (mode === 'mock') {
      setMockEssays((current) => ({ ...current, [activeMockTask]: value }))
    } else {
      setEssay(value)
    }
  }

  const shortfallMessage =
    mode === 'mock'
      ? `当前 Task 1 为 ${mockWordCounts.task1}/150 words，Task 2 为 ${mockWordCounts.task2}/250 words。你可以继续写，也可以确认提交并接受可能影响评分的风险。`
      : `当前 ${wordCount} words，建议至少 ${wordTarget} words。你可以继续写，也可以确认提交并接受可能影响评分的风险。`

  if (!userId || !hydrated || !activeQuestion) return <PageSkeleton variant="editor" />

  return (
    <main className="exam-page" data-main-content tabIndex={-1}>
      <header className="exam-topbar">
        <div className="exam-brand-row">
          <span className="exam-ielts-mark">IELTS</span>
          <span className="ui-body-md">|</span>
          <span className="ui-body-md">{mode === 'mock' ? `Mock · ${activeMockTask === 'task1' ? 'Task 1' : 'Task 2'}` : activeQuestion.taskType === 'task1' ? 'Task 1' : 'Task 2'}</span>
        </div>

        <div className="exam-info-pill">
          <div className="exam-info-item">
            <div className="mini-ring">
              <svg viewBox="0 0 24 24">
                <circle className="track" cx="12" cy="12" fill="transparent" r="10" strokeWidth="2" />
                <circle
                  className="value"
                  cx="12"
                  cy="12"
                  fill="transparent"
                  r="10"
                  strokeDasharray="62.8"
                  strokeDashoffset={progress}
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
              <MaterialIcon name="timer" filled />
            </div>
            <span className={`exam-timer ${timerTone}`} aria-live={timeLeft <= 60 ? 'assertive' : 'polite'}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="exam-divider" />
          <div className="exam-info-item">
            <span className="ui-label">Words</span>
            <span 
              className={`exam-word-count ${wordCount >= wordTarget ? 'word-count-good' : wordCount >= wordTarget * 0.8 ? 'word-count-medium' : wordCount < wordTarget * 0.5 ? 'word-count-low' : ''}`}
              title="字数统计按空格分词计算，与 IELTS 官方标准可能略有差异"
            >
              {wordCount}
              <span>/{wordTarget}</span>
            </span>
          </div>
        </div>

        <div className="exam-actions">
          <span className={`saved-state inline-status ${saveStatus === 'saved' ? 'success' : saveStatus === 'error' ? 'error' : ''}`} aria-live="polite">
            <MaterialIcon
              name={saveStatus === 'saving' ? 'sync' : saveStatus === 'offline' ? 'cloud_off' : saveStatus === 'error' ? 'sync_problem' : 'cloud_done'}
              size={16}
            />
            {saveStatus === 'saving'
              ? '保存中...'
              : saveStatus === 'offline'
                ? '本地保存'
                : saveStatus === 'error'
                  ? '保存失败'
                  : saveStatus === 'saved'
                    ? '已保存'
                    : '草稿'}
          </span>
          <button className="exam-exit" type="button" onClick={() => setShowExitConfirm(true)}>
            <MaterialIcon name="logout" size={16} />
            Exit
          </button>
        </div>
      </header>

      <div className="exam-status-bar" role="status" aria-live="polite">
        <span>
          <MaterialIcon name="assignment" size={15} />
          {questionLabel(activeQuestion)}
        </span>
        <span>
          <MaterialIcon name={online ? 'wifi' : 'wifi_off'} size={15} />
          {online ? 'Online' : 'Offline'}
        </span>
        <span>
          <MaterialIcon name={draftRestored ? 'restore' : 'draft'} size={15} />
          {draftRestored ? 'Draft restored' : 'New draft'}
        </span>
        <span title={mode === 'task1' ? Task1SubtypeLabels[promptSelection.task1Subtype] : undefined}>
          <MaterialIcon name="tune" size={15} />
          {promptChoiceSummary}
        </span>
        {mode === 'mock' ? (
          <span>
            <MaterialIcon name="functions" size={15} />
            Total {totalMockWords}/400 words
          </span>
        ) : null}
      </div>

      <section ref={layoutRef} className="exam-layout">
        <aside className="exam-left-pane" style={{ width: `${splitWidth}%` }}>
          <div className="exam-left-inner">
            {mode === 'mock' ? (
              <div className="result-tabs" role="tablist" aria-label="模考任务切换" style={{ marginBottom: 16 }}>
                {mockTaskOrder.map((taskType) => (
                  <button
                    key={taskType}
                    className={`result-tab ${activeMockTask === taskType ? 'is-active' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={activeMockTask === taskType}
                    onClick={() => setActiveMockTask(taskType)}
                  >
                    {taskType === 'task1' ? 'Task 1' : 'Task 2'}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="exam-section-header">
              <h1 className="ui-title-headline">{activeQuestion.title}</h1>
              <p className="ui-body-md">
                You should spend about {activeQuestion.durationMinutes} minutes on this task.
                {mode === 'mock' ? ' The full test timer remains 60 minutes.' : ''}
              </p>
            </div>

            <div className="exam-prompt-box">
              <p className="ui-body-lg" style={{ color: 'var(--on-surface)', fontWeight: 500 }}>
                {activeQuestion.promptLead}
              </p>
              <p className="ui-body-md">{activeQuestion.promptDetail}</p>
            </div>

            {activeQuestion.taskType === 'task1' && (activeQuestion.chartSpec || activeQuestion.processSpec || activeQuestion.mapSpec) ? (
              <div className="exam-graph-frame">
                <Task1Visual
                  chartType={activeQuestion.questionType}
                  chartSpec={activeQuestion.chartSpec}
                  processSpec={activeQuestion.processSpec}
                  mapSpec={activeQuestion.mapSpec}
                  title={activeQuestion.title}
                />
              </div>
            ) : activeQuestion.image ? (
              <div className="exam-graph-frame">
                <Image
                  alt={activeQuestion.imageAlt || activeQuestion.title}
                  src={activeQuestion.image}
                  width={720}
                  height={400}
                  priority
                  style={{ width: '100%', height: 'auto' }}
                  unoptimized
                />
              </div>
            ) : null}

            <div className="exam-requirement">
              <span>
                <MaterialIcon name="info" size={18} />
                Write at least <strong>{activeQuestion.wordTarget} words</strong>.
              </span>
            </div>
          </div>
        </aside>

        <div
          className="resizer-handle"
          role="separator"
          aria-label="调整题目区和写作区宽度"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onDoubleClick={resetSplit}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              const next = Math.min(66, Math.max(34, splitWidth + (event.key === 'ArrowRight' ? 2 : -2)))
              setSplitWidth(next)
              window.localStorage.setItem(splitKey, String(next))
            }
          }}
        />

        <section className="exam-right-pane" style={{ width: `${100 - splitWidth}%` }}>
          <div className="editor-toolbar">
            <button className="spell-toggle" type="button" onClick={() => setSpellcheck((current) => !current)}>
              <MaterialIcon name="spellcheck" size={18} />
              Spell Check: {spellcheck ? 'On' : 'Off'}
            </button>
            <AsyncButton
              className="submit-essay-button"
              icon="check_circle"
              loading={loading}
              error={submitStatus === 'error'}
              success={submitStatus === 'success'}
              disabledReason={!activeEssay.trim() ? '请先输入作文内容。' : undefined}
              onClick={requestSubmit}
            >
              {loading ? 'Analyzing...' : submitStatus === 'error' ? '重新批改' : mode === 'mock' ? 'Submit Test' : 'Submit Essay'}
            </AsyncButton>
          </div>

          <div className="editor-canvas">
            {promptGenerationNotice ? (
              <div className="prompt-generation-notice" role="alert">
                <div className="notice-icon">
                  <MaterialIcon name="info" size={20} />
                </div>
                <div className="notice-content">
                  <strong>题目生成提示</strong>
                  <span>{promptGenerationNotice}</span>
                </div>
                <button className="notice-dismiss" type="button" onClick={() => setPromptGenerationNotice('')}>
                  知道了
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="editor-error" role="alert">
                <span>{error}</span>
                <button className="toast-action" type="button" onClick={() => void submitCurrent()}>
                  重新批改
                </button>
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              placeholder={mode === 'mock' ? `Begin writing ${activeMockTask === 'task1' ? 'Task 1' : 'Task 2'} here...` : 'Begin writing your response here...'}
              spellCheck={spellcheck}
              value={activeEssay}
              onChange={(event) => updateActiveEssay(event.target.value)}
              onSelect={persistEditorPosition}
              onKeyUp={persistEditorPosition}
              onMouseUp={persistEditorPosition}
              onScroll={persistEditorPosition}
              aria-label={`${activeQuestion.taskType} writing editor`}
            />
            <div className="editor-footer">
              <span className="word-count-hint">
                {wordCount < 50 ? (
                  <span className="hint-warning">至少需要 50 字才能提交批改（当前 {wordCount} 字）</span>
                ) : wordCount < wordTarget ? (
                  <span className="hint-info">建议至少 {wordTarget} 字（当前 {wordCount} 字）</span>
                ) : (
                  <span className="hint-success">字数已达标（{wordCount} 字）</span>
                )}
              </span>
            </div>
            {loading ? (
              <section className="editor-progress-panel" role="status" aria-live="polite">
                <div className="progress-header">
                  <h2 className="ui-title-md">正在批改作文</h2>
                  <button className="cancel-button" type="button" onClick={cancelEvaluation}>
                    取消
                  </button>
                </div>
                <ol className="stage-list">
                  {EVALUATION_STAGES.map((stage: string, index: number) => (
                    <li key={stage} className={index < stageIndex ? 'is-done' : index === stageIndex ? 'is-active' : ''}>
                      <span className="stage-dot" />
                      <span>{stage}</span>
                    </li>
                  ))}
                </ol>
                <div className="progress-footer">
                  <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                    {stageIndex < 3 ? '正在等待批改结果…' : '详细批改仍在处理，不影响初步评分展示'}
                  </p>
                  <p className="elapsed-time" style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                    已用时：{elapsedTime} 秒
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </section>

      <ConfirmDialog
        open={showShortfallConfirm}
        title="字数还没有达到建议要求"
        message={shortfallMessage}
        confirmLabel="仍然提交"
        cancelLabel="继续写"
        onCancel={() => setShowShortfallConfirm(false)}
        onConfirm={() => {
          setShowShortfallConfirm(false)
          void submitCurrent()
        }}
      />

      <ConfirmDialog
        open={showSubmitConfirm}
        title="提交当前作文？"
        message="批改期间会保留本地草稿，请确认当前内容已经准备好提交。"
        confirmLabel="提交批改"
        cancelLabel="继续写"
        onCancel={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false)
          void submitCurrent()
        }}
      />

      <ConfirmDialog
        open={showExitConfirm}
        title="退出当前写作？"
        message="草稿已保存到本地。离开后可以从同一 Task 页面恢复。"
        confirmLabel="退出"
        cancelLabel="留下"
        onCancel={() => setShowExitConfirm(false)}
        onConfirm={() => {
          saveNow()
          router.push('/practice')
        }}
      />

      <ConfirmDialog
        open={showTimeConfirm}
        title="时间已到"
        message={mode === 'mock' ? '60 分钟模考时间已结束。你可以立即提交两篇作文，或先保留草稿稍后处理。' : '限时已结束。你可以立即提交批改，或先保留草稿稍后处理。'}
        confirmLabel="提交批改"
        cancelLabel="保留草稿"
        onCancel={() => setShowTimeConfirm(false)}
        onConfirm={() => {
          setShowTimeConfirm(false)
          void submitCurrent()
        }}
      />
    </main>
  )
}
