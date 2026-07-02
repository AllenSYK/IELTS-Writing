'use client'

import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { AsyncButton, ConfirmDialog, useDebouncedValue, useNetworkStatus, useToast } from '@/components/interaction-system'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { MaterialIcon } from '@/components/app-ui'
import { Task1Visual } from '@/components/task1/Task1Visual'
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
  evaluationErrorMessage,
  requestEssayEvaluation,
  type EssayEvaluationRequest
} from '@/lib/writing-evaluation'
import {
  readTimerEnd,
  normalizeGeneratedQuestion,
  restoreQuestionFromRecord,
  timerKeyFor
} from '@/lib/writing-session'
import { markGeneratedPromptCompleted } from '@/lib/generated-prompt-history'
import { generateQuestionForSelection } from '@/lib/writing-question-generation'
import {
  DefaultPromptSelection,
  Task1ChartLabels,
  Task1SubtypeLabels,
  Task2EssayLabels,
  Task2TopicLabels,
  normalizeTask1ChartType,
  normalizeTask2EssayType,
  normalizeTask2Topic,
  selectionFromSearchParams,
  type PromptSelection
} from '@/lib/writing-options'
import { userScopedStorageKey } from '@/lib/user-storage'
import { convertVisualDataToSpecs } from '@/lib/task1-chart-schema'
import {
  clampWritingEditorSplitRatio,
  defaultWritingEditorSplitRatio,
  getWritingEditorSplitBounds,
  parseWritingEditorSplitRatio,
  WritingEditorDividerWidth
} from '@/lib/writing-editor-layout'
import {
  DraftErrorMessages,
  completeManagedDraft,
  createManagedDraft,
  draftTaskFromQuestion,
  fetchManagedDraft,
  initialManagedDraft,
  saveManagedDraft,
  type DraftTask,
  type FullTestDraftData,
  type ManagedDraftData,
  type SingleDraftData
} from '@/lib/writing-drafts'

type MockTaskType = Exclude<WritingTaskType, 'mock'>
type MockEssays = Record<MockTaskType, string>
type MockQuestions = Record<MockTaskType, WritingQuestion>

type SaveStatus = 'restoring' | 'idle' | 'saving' | 'saved' | 'offline' | 'error'
type SubmitStatus = 'idle' | 'saving' | 'submitting' | 'organizing' | 'success' | 'error'

const mockTaskOrder: MockTaskType[] = ['task1', 'task2']
const evaluationStages = [
  '正在保存作文',
  '正在请求评分',
  '正在解析评分结果',
  '初步评分已完成',
  '正在补充详细批改',
  '详细批改已完成'
]
const AI_EVALUATION_TIMEOUT_MS = 10 * 60 * 1000

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

function defaultSecondsForMode(mode: WritingTaskType) {
  return mode === 'task1' ? 1200 : mode === 'task2' ? 2400 : 3600
}

const IsolatedTimer = memo(function IsolatedTimer({
  timerKey,
  durationMinutes,
  onExpire
}: {
  timerKey: string
  durationMinutes: number
  onExpire: () => void
}) {
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!timerKey) return durationMinutes * 60
    const endAt = readTimerEnd(timerKey, durationMinutes)
    return Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!timerKey) return
    const timer = window.setInterval(() => {
      const endAt = readTimerEnd(timerKey, durationMinutes)
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setTimeLeft(next)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [durationMinutes, timerKey])

  useEffect(() => {
    if (timeLeft === 0) onExpire()
  }, [timeLeft, onExpire])

  const progress = 62.8 - (timeLeft / (durationMinutes * 60)) * 62.8
  const timerTone = timeLeft <= 60 ? 'timer-critical' : timeLeft <= 600 ? 'timer-warning' : ''

  return (
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
  )
})

function defaultQuestionFor(mode: WritingTaskType, selection = DefaultPromptSelection) {
  return randomQuestionForSelection(mode === 'task1' ? 'task1' : 'task2', selection)
}

function questionFromDraftTask(task: DraftTask | undefined, taskType: MockTaskType) {
  if (!task) return null
  const bankQuestion = getQuestionById(task.questionId)
  if (!task.promptLead && !task.title && !task.questionType) return bankQuestion

  const restored = restoreQuestionFromRecord({
    id: `draft-${taskType}`,
    questionId: task.questionId,
    taskType,
    title: task.title || bankQuestion?.title || '',
    prompt: '',
    promptLead: task.promptLead,
    promptDetail: task.promptDetail,
    questionType: task.questionType,
    trainingType: task.trainingType,
    chartSpec: task.chartSpec,
    processSpec: task.processSpec,
    mapSpec: task.mapSpec,
    imageUrl: task.imageUrl
  })

  return {
    ...restored,
    topic: task.topic,
    structuredData: task.structuredData,
    chartSpec: restored.chartSpec || bankQuestion?.chartSpec,
    processSpec: restored.processSpec || bankQuestion?.processSpec,
    mapSpec: restored.mapSpec || bankQuestion?.mapSpec,
    image: restored.image || bankQuestion?.image,
    imageAlt: restored.imageAlt || bankQuestion?.imageAlt
  }
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
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const splitRatioRef = useRef(defaultWritingEditorSplitRatio({ hasTaskVisuals: mode !== 'task2' }))
  const loadedSplitKeyRef = useRef('')
  const initialSnapshotSavedRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const lastSavedFingerprintRef = useRef('')
  const mountedRef = useRef(true)
  const timeLeftRef = useRef(mode === 'task1' ? 1200 : mode === 'task2' ? 2400 : 3600)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingEvaluationsRef = useRef(new Map<string, Promise<EssayEvaluation>>())
  const [singleQuestion, setSingleQuestion] = useState<WritingQuestion | null>(null)
  const [mockQuestions, setMockQuestions] = useState<MockQuestions | null>(null)
  const [activeMockTask, setActiveMockTask] = useState<MockTaskType>('task1')
  const [essay, setEssay] = useState('')
  const [mockEssays, setMockEssays] = useState<MockEssays>({ task1: '', task2: '' })
  const debouncedEssay = useDebouncedValue(essay, 900)
  const debouncedMockEssays = useDebouncedValue(mockEssays, 900)
  const [spellcheck, setSpellcheck] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('restoring')
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle')
  const [stageIndex, setStageIndex] = useState(0)
  const [draftRestored, setDraftRestored] = useState(false)
  const [showShortfallConfirm, setShowShortfallConfirm] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showTimeConfirm, setShowTimeConfirm] = useState(false)
  const [isSavingBeforeExit, setIsSavingBeforeExit] = useState(false)
  const [exitSaveError, setExitSaveError] = useState('')
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false)
  const [pendingResubmitKey, setPendingResubmitKey] = useState<string | null>(null)
  const [splitWidth, setSplitWidth] = useState(splitRatioRef.current)
  const [layoutWidth, setLayoutWidth] = useState(1440)
  const [isResizing, setIsResizing] = useState(false)
  const [error, setError] = useState('')
  const [promptSelection, setPromptSelection] = useState<PromptSelection>(DefaultPromptSelection)
  const [promptGenerationNotice, setPromptGenerationNotice] = useState('')
  const [evaluationStartTime, setEvaluationStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [customTaskId, setCustomTaskId] = useState<string | null>(null)
  const [studyPlanTaskId, setStudyPlanTaskId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState('')

  const activeQuestion = mode === 'mock' ? mockQuestions?.[activeMockTask] ?? null : singleQuestion
  const activeEssay = mode === 'mock' ? mockEssays[activeMockTask] : essay
  const activeTaskType: MockTaskType = mode === 'mock' ? activeMockTask : mode === 'task1' ? 'task1' : 'task2'
  const hasTaskVisuals = activeQuestion?.taskType === 'task1'
    && Boolean(activeQuestion.chartSpec || activeQuestion.processSpec || activeQuestion.mapSpec || activeQuestion.image)
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
  const loading = submitStatus !== 'idle' && submitStatus !== 'error' && submitStatus !== 'success'
  const promptChoiceSummary =
    customTaskId
      ? '自定义题目'
      : mode === 'task1'
      ? Task1ChartLabels[promptSelection.task1ChartType]
      : mode === 'task2'
        ? `${Task2EssayLabels[promptSelection.task2EssayType]} · ${Task2TopicLabels[promptSelection.task2Topic]}`
        : `${Task1ChartLabels[promptSelection.task1ChartType]} + ${Task2EssayLabels[promptSelection.task2EssayType]} · ${Task2TopicLabels[promptSelection.task2Topic]}`
  const mockTask1Label = mockQuestions
    ? Task1ChartLabels[normalizeTask1ChartType(mockQuestions.task1.questionType)]
    : Task1ChartLabels[promptSelection.task1ChartType]
  const mockTask2Label = mockQuestions
    ? `${Task2EssayLabels[normalizeTask2EssayType(mockQuestions.task2.questionType)]} · ${Task2TopicLabels[normalizeTask2Topic(mockQuestions.task2.topic || promptSelection.task2Topic)]}`
    : `${Task2EssayLabels[promptSelection.task2EssayType]} · ${Task2TopicLabels[promptSelection.task2Topic]}`
  const timerKey = userId && draftId ? timerKeyFor(userId, mode, draftId) : ''
  const positionKey = userId ? userScopedStorageKey(`ielts-writing-editor-position-${mode}-${activeTaskType}`, userId) : ''
  const splitKey = userId ? userScopedStorageKey(`writingEditorSplitRatio-${mode}`, userId) : ''
  const legacySplitKey = userId ? userScopedStorageKey(`ielts-writing-editor-split-${mode}`, userId) : ''
  const saveAllDrafts = useCallback(
    async (showToast = false, options?: { keepalive?: boolean; activeTask?: MockTaskType }) => {
      if (!userId || !draftId) return
      try {
        setSaveStatus(online ? 'saving' : 'offline')
        let draft: ManagedDraftData
        if (mode === 'mock') {
          if (!mockQuestions) return
          draft = {
            version: 2,
            kind: 'full_test',
            selection: promptSelection,
            activeTask: options?.activeTask || activeMockTask,
            remainingSeconds: timeLeftRef.current,
            task1: draftTaskFromQuestion(mockEssays.task1, mockQuestions.task1, mockWordCounts.task1),
            task2: draftTaskFromQuestion(mockEssays.task2, mockQuestions.task2, mockWordCounts.task2)
          } satisfies FullTestDraftData
        } else {
          if (!singleQuestion) return
          draft = {
            version: 2,
            kind: 'single',
            selection: promptSelection,
            remainingSeconds: timeLeftRef.current,
            task: draftTaskFromQuestion(essay, singleQuestion, countWords(essay))
          } satisfies SingleDraftData
        }

        const result = await saveManagedDraft(userId, draftId, mode, draft, options)
        setSaveStatus(result.offline ? 'offline' : 'saved')
        if (showToast) {
          pushToast({
            kind: result.offline ? 'info' : 'success',
            title: result.offline ? '已保存到本地' : '草稿已保存',
            message: result.offline ? '网络恢复后会继续同步。' : undefined
          })
        }
      } catch (caught) {
        setSaveStatus('error')
        if (showToast) {
          const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : ''
          pushToast({
            kind: 'error',
            title: '保存失败',
            message: DraftErrorMessages[code] || (caught instanceof Error ? caught.message : '请稍后重试。')
          })
        }
      }
    },
    [activeMockTask, draftId, essay, mockEssays, mockQuestions, mockWordCounts.task1, mockWordCounts.task2, mode, online, promptSelection, pushToast, singleQuestion, userId]
  )
  const mockTask1Id = mockQuestions?.task1?.id
  const mockTask2Id = mockQuestions?.task2?.id
  const singleQuestionId = singleQuestion?.id
  const getDraftFingerprint = useCallback(() => {
    if (mode === 'mock') {
      return JSON.stringify({
        mode,
        q1Id: mockTask1Id ?? '',
        q2Id: mockTask2Id ?? '',
        task1: mockEssays.task1,
        task2: mockEssays.task2
      })
    }
    return JSON.stringify({ mode, qId: singleQuestionId ?? '', essay })
  }, [mode, essay, mockEssays.task1, mockEssays.task2, singleQuestionId, mockTask1Id, mockTask2Id])

  const flushDraftSave = useCallback(async (options?: { keepalive?: boolean }) => {
    if (!userId || !draftId || !hydrated) return
    const fingerprint = getDraftFingerprint()
    if (fingerprint === lastSavedFingerprintRef.current && !options?.keepalive) return
    if (isSavingRef.current) {
      pendingSaveRef.current = true
      return
    }
    isSavingRef.current = true
    pendingSaveRef.current = false
    try {
      await saveAllDrafts(false, options)
      lastSavedFingerprintRef.current = fingerprint
    } catch {
      // saveAllDrafts handles its own error state
    } finally {
      isSavingRef.current = false
      if (pendingSaveRef.current && mountedRef.current) {
        pendingSaveRef.current = false
        void flushDraftSave()
      }
    }
  }, [userId, draftId, hydrated, getDraftFingerprint, saveAllDrafts])

  const scheduleDraftSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushDraftSave()
    }, 1200)
  }, [flushDraftSave])

  const saveCurrentDraft = useEffectEvent((keepalive = false) => {
    void flushDraftSave(keepalive ? { keepalive: true } : undefined)
  })
  const generateInitialQuestion = useEffectEvent(generateQuestionFor)
  const notifyInitialRestore = useEffectEvent(pushToast)

  useEffect(() => {
    let timer: number | undefined
    if (evaluationStartTime && loading) {
      timer = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - evaluationStartTime) / 1000))
      }, 1000)
    }
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [evaluationStartTime, loading])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    window.queueMicrotask(() => {
      void (async () => {
        const searchParams = new URLSearchParams(window.location.search)
        const requestedSelection = selectionFromSearchParams(searchParams)
        const recordId = searchParams.get('record')
        const uploadedTaskId = mode === 'mock' ? null : searchParams.get('customTask')
        const pastPaperId = mode === 'mock' ? null : searchParams.get('pastPaper')
        const studyPlanTaskId = searchParams.get('studyPlanTaskId')
        setCustomTaskId(uploadedTaskId)
        setStudyPlanTaskId(studyPlanTaskId)
        let currentDraftId = searchParams.get('draft') || ''
        let managedDraft: ManagedDraftData | null = null

        try {
          if (currentDraftId) {
            managedDraft = await fetchManagedDraft(userId, currentDraftId)
            if (!managedDraft) throw new Error(DraftErrorMessages.DRAFT_NOT_FOUND)
          } else {
            const created = await createManagedDraft(mode, requestedSelection)
            currentDraftId = created.draft.id
            managedDraft = created.draft.draftData
            const nextUrl = new URL(window.location.href)
            nextUrl.searchParams.set('draft', currentDraftId)
            window.history.replaceState(window.history.state, '', nextUrl)
          }
        } catch (caught) {
          if (cancelled) return
          const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : ''
          notifyInitialRestore({
            kind: 'error',
            title: '无法打开写作草稿',
            message: DraftErrorMessages[code] || (caught instanceof Error ? caught.message : '请返回 IELTS 页面重试。')
          })
          router.replace('/practice?drafts=1')
          return
        }

        if (cancelled) return
        setDraftId(currentDraftId)
        const selection = managedDraft?.selection || requestedSelection
        const sourceRecord = recordId ? await getWritingRecordFromServer(userId, recordId) : null
        if (cancelled) return
        setPromptSelection(selection)

        if (mode === 'mock') {
          const fullDraft = managedDraft?.kind === 'full_test'
            ? managedDraft
            : initialManagedDraft('mock', selection) as FullTestDraftData
          const fallback = buildMockQuestionSetForSelection(selection)
          const restoredTask1 = sourceRecord?.components?.task1?.essay || fullDraft.task1.essay
          const restoredTask2 = sourceRecord?.components?.task2?.essay || fullDraft.task2.essay

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
            return questionFromDraftTask(fullDraft.task1, 'task1')
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
            return questionFromDraftTask(fullDraft.task2, 'task2')
              || (restoredTask2 ? fallback.task2 : generateInitialQuestion('task2', selection))
          })()

          const [task1Question, task2Question] = await Promise.all([
            task1QuestionPromise,
            task2QuestionPromise
          ])

          if (cancelled) return
          setMockQuestions({ task1: task1Question, task2: task2Question })
          setMockEssays({ task1: restoredTask1, task2: restoredTask2 })
          setActiveMockTask(fullDraft.activeTask)
          if (restoredTask1 || restoredTask2) {
            setDraftRestored(true)
            setSaveStatus('saved')
            notifyInitialRestore({ kind: 'success', title: sourceRecord ? '已带回模考作文' : '已恢复模考草稿' })
          } else {
            setSaveStatus('idle')
          }
        } else {
          const taskType = mode === 'task1' ? 'task1' : 'task2'
          const singleDraft = managedDraft?.kind === 'single'
            ? managedDraft
            : initialManagedDraft(mode, selection) as SingleDraftData
          const restoredEssay = sourceRecord?.essay || singleDraft.task.essay
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
          if (!question && pastPaperId) {
            try {
              const response = await fetch(`/api/past-papers/${encodeURIComponent(pastPaperId)}`, { cache: 'no-store' })
              const data = await response.json() as {
                success?: boolean
                question?: {
                  id: string
                  taskType: string
                  title: string
                  questionText: string
                  task1VisualTypes?: string[]
                  task1VisualData?: Record<string, unknown>
                  task2QuestionType?: string
                }
                message?: string
              }
              if (!response.ok || !data.success || !data.question) throw new Error(data.message || '真题读取失败')
              const pp = data.question
              const specs = pp.task1VisualTypes
                ? convertVisualDataToSpecs(pp.task1VisualTypes, pp.task1VisualData ?? null, pp.title)
                : { questionType: 'unknown' }
              const promptLead = pp.questionText.split('\n').find((l) => l.trim().length > 0) || pp.title
              const promptDetail = pp.questionText.split('\n').slice(1).join('\n').trim() || 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.'
              question = {
                id: pp.id,
                taskType: (pp.taskType?.includes('task1') ? 'task1' : 'task2') as 'task1' | 'task2',
                title: pp.title,
                promptLead,
                promptDetail,
                durationMinutes: pp.taskType?.includes('task1') ? 20 : 40,
                wordTarget: pp.taskType?.includes('task1') ? 150 : 250,
                questionType: specs.questionType as WritingQuestion['questionType'],
                trainingType: 'academic',
                generatedSource: 'static-bank',
                chartSpec: specs.chartSpec,
                processSpec: specs.processSpec,
                mapSpec: specs.mapSpec
              }
            } catch (caught) {
              if (cancelled) return
              setError(caught instanceof Error ? caught.message : '真题读取失败')
            }
          }
          if (!question && uploadedTaskId) {
            try {
              const response = await fetch(`/api/user/uploaded-writing-tasks/${encodeURIComponent(uploadedTaskId)}`, {
                cache: 'no-store'
              })
              const data = await response.json() as { success?: boolean; question?: unknown; message?: string }
              if (!response.ok || !data.success) throw new Error(data.message || '自定义题目读取失败')
              question = normalizeGeneratedQuestion(data.question)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : '自定义题目读取失败')
            }
          }
          if (!question) question = questionFromDraftTask(singleDraft.task, taskType)
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
          } else if (singleDraft.task.essay) {
            setEssay(singleDraft.task.essay)
            setDraftRestored(true)
            setSaveStatus('saved')
            notifyInitialRestore({ kind: 'success', title: '已恢复草稿', message: `上次保存于 ${new Date(singleDraft.task.updatedAt).toLocaleTimeString()}` })
          } else {
            setSaveStatus('idle')
          }
        }

        const initialDurationMinutes = mode === 'mock' ? 60 : mode === 'task1' ? 20 : 40
        const restoredSeconds = managedDraft?.remainingSeconds ?? initialDurationMinutes * 60
        const localTimerKey = timerKeyFor(userId, mode, currentDraftId)
        const endAt = readTimerEnd(localTimerKey, initialDurationMinutes, restoredSeconds)
        const initialTimeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
        timeLeftRef.current = initialTimeLeft

        if (studyPlanTaskId && !cancelled) {
          try {
            await fetch(`/api/study-plan/tasks/${studyPlanTaskId}/start`, { method: 'POST' })
          } catch { /* non-critical */ }
        }

        setHydrated(true)
      })()
    })

    return () => {
      cancelled = true
    }
  }, [mode, router, userId])

  useEffect(() => {
    if (!hydrated || !splitKey || loadedSplitKeyRef.current === splitKey) return
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width || window.innerWidth
    const storedRatio = parseWritingEditorSplitRatio(window.localStorage.getItem(splitKey))
      ?? parseWritingEditorSplitRatio(window.localStorage.getItem(legacySplitKey))
    const next = clampWritingEditorSplitRatio(
      storedRatio ?? defaultWritingEditorSplitRatio({ hasTaskVisuals }),
      layoutWidth,
      { hasTaskVisuals }
    )
    loadedSplitKeyRef.current = splitKey
    splitRatioRef.current = next
    setSplitWidth(next)
    window.localStorage.setItem(splitKey, String(next))
  }, [hasTaskVisuals, hydrated, legacySplitKey, splitKey])

  useEffect(() => {
    if (!hydrated) return
    const layout = layoutRef.current
    if (!layout) return
    const observer = new ResizeObserver(([entry]) => {
      setLayoutWidth((current) => Math.abs(current - entry.contentRect.width) > 0.5 ? entry.contentRect.width : current)
      const next = clampWritingEditorSplitRatio(
        splitRatioRef.current,
        entry.contentRect.width,
        { hasTaskVisuals }
      )
      splitRatioRef.current = next
      setSplitWidth((current) => Math.abs(current - next) > 0.01 ? next : current)
    })
    observer.observe(layout)
    return () => observer.disconnect()
  }, [hasTaskVisuals, hydrated])

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const hasContent = mode === 'mock' ? Boolean(debouncedMockEssays.task1.trim() || debouncedMockEssays.task2.trim()) : Boolean(debouncedEssay.trim())
    if (!hasContent) {
      const idleTimer = window.setTimeout(() => setSaveStatus('idle'), 0)
      return () => window.clearTimeout(idleTimer)
    }
    scheduleDraftSave()
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [debouncedEssay, debouncedMockEssays, hydrated, mode, scheduleDraftSave])

  useEffect(() => {
    if (!hydrated || !draftId || !activeQuestion || initialSnapshotSavedRef.current === draftId) return
    initialSnapshotSavedRef.current = draftId
    saveCurrentDraft()
  }, [activeQuestion, draftId, hydrated])

  const handleTimerExpire = useCallback(() => {
    if (hydrated && submitStatus === 'idle') setShowTimeConfirm(true)
  }, [hydrated, submitStatus])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'saving' || saveStatus === 'error') {
        event.preventDefault()
      }
    }
    const handlePageHide = () => {
      saveCurrentDraft(true)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentDraft(true)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [saveStatus])

  const saveNow = useCallback(async (options?: { force?: boolean }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await flushDraftSave(options?.force ? { keepalive: true } : undefined)
    if (mountedRef.current) {
      pushToast({ kind: 'success', title: '草稿已保存' })
    }
  }, [flushDraftSave, pushToast])

  async function handleConfirmedExit() {
    if (isSavingBeforeExit) return
    setIsSavingBeforeExit(true)
    setExitSaveError('')
    try {
      await saveNow({ force: true })
      router.push('/practice')
    } catch (error) {
      setExitSaveError(error instanceof Error ? error.message : '草稿保存失败，请重试')
    } finally {
      if (mountedRef.current) setIsSavingBeforeExit(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveNow()
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
    const map = pendingEvaluationsRef.current
    if (dedupeKey && map.has(dedupeKey)) {
      return map.get(dedupeKey)!
    }

    const evaluationPromise = (async () => {
      try {
        return await requestEssayEvaluation(payload, {
          signal,
          timeoutMs: AI_EVALUATION_TIMEOUT_MS
        })
      } finally {
        if (dedupeKey) map.delete(dedupeKey)
      }
    })()

    if (dedupeKey) map.set(dedupeKey, evaluationPromise)
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
    if (pendingEvaluationsRef.current.has(essayHashKey)) {
      setPendingResubmitKey(essayHashKey)
      setShowResubmitConfirm(true)
      return
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    let succeeded = false
    setSubmitStatus('saving')
    setStageIndex(0)
    setEvaluationStartTime(Date.now())
    setElapsedTime(0)
    try {
      await saveAllDrafts(false)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      if (abortController.signal.aborted) {
        throw new WritingEvaluationError('cancelled', '批改已取消。')
      }
      setSubmitStatus('submitting')
      setStageIndex(1)

      const evaluation = await evaluateEssay({
        essay,
        taskType: activeQuestion.taskType,
        prompt: buildPrompt(activeQuestion),
        questionType: activeQuestion.questionType
      }, essayHashKey, abortController.signal)

      if (abortController.signal.aborted) {
        throw new WritingEvaluationError('cancelled', '批改已取消。')
      }
      setStageIndex(2)
      await new Promise((resolve) => window.setTimeout(resolve, 100))
      setStageIndex(3)

      setSubmitStatus('organizing')
      setStageIndex(4)
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
        durationSeconds: durationMinutes * 60 - timeLeftRef.current,
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
        imageUrl: activeQuestion.image,
        questionSource: activeQuestion.generatedSource === 'user_upload' ? 'user_upload' : undefined,
        uploadedTaskId: typeof activeQuestion.structuredData?.uploadedTaskId === 'string'
          ? activeQuestion.structuredData.uploadedTaskId
          : undefined,
        studyPlanTaskId: studyPlanTaskId || undefined
      }

      await saveWritingRecord(userId, record)
      if (activeQuestion.generatedSource !== 'user_upload') markGeneratedPromptCompleted(activeQuestion.id, userId)
      if (studyPlanTaskId) {
        try {
          const taskRes = await fetch(`/api/study-plan/tasks/${studyPlanTaskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ writingRecordId: record.id })
          })
          const taskData = await taskRes.json() as { success?: boolean; reward?: { awarded?: boolean; amount?: number } | null }
          if (taskData.reward?.awarded && taskData.reward.amount) {
            pushToast({ kind: 'success', title: '任务完成', message: `获得 ${taskData.reward.amount} 个计划调整点` })
          }
        } catch { /* non-critical, task completion is best-effort */ }
      }
      if (draftId) {
        try {
          await completeManagedDraft(userId, draftId, record.id)
        } catch {
          pushToast({ kind: 'warning', title: '批改已保存', message: '草稿状态同步稍后会自动重试。' })
        }
      }
      window.localStorage.removeItem(timerKey)
      setStageIndex(5)
      setSubmitStatus('success')
      succeeded = true
      pushToast({ kind: 'success', title: '批改完成', message: '正在打开结果页。' })
      router.push(`/result?id=${record.id}`)
    } catch (caught) {
      const presentation = evaluationErrorMessage(caught)
      if (caught instanceof WritingEvaluationError && caught.kind === 'cancelled') {
        pushToast({ kind: 'info', ...presentation })
      } else {
        setError(presentation.message)
        setSubmitStatus('error')
        pushToast({ kind: 'error', ...presentation })
      }
    } finally {
      abortControllerRef.current = null
      setEvaluationStartTime(null)
      if (!succeeded) {
        window.setTimeout(() => setSubmitStatus((current) => (current === 'success' ? current : 'idle')), 800)
      }
    }
  }

  function cancelEvaluation() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      pushToast({ kind: 'info', title: '正在取消', message: '正在取消批改，请稍候。' })
    }
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

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    let succeeded = false
    setSubmitStatus('saving')
    setStageIndex(0)
    setEvaluationStartTime(Date.now())
    setElapsedTime(0)
    try {
      await saveAllDrafts(false)
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      setSubmitStatus('submitting')
      setStageIndex(1)

      let task1Evaluation: EssayEvaluation | null = null
      let task2Evaluation: EssayEvaluation | null = null
      let task1Error: string | null = null
      let task2Error: string | null = null

      try {
        task1Evaluation = await evaluateEssay({
          essay: mockEssays.task1,
          taskType: 'task1',
          prompt: buildPrompt(mockQuestions.task1),
          questionType: mockQuestions.task1.questionType
        }, dedupeKey1, abortController.signal)
      } catch (err) {
        task1Error = err instanceof Error ? err.message : 'Task 1 批改失败'
      }

      setStageIndex(2)

      try {
        task2Evaluation = await evaluateEssay({
          essay: mockEssays.task2,
          taskType: 'task2',
          prompt: buildPrompt(mockQuestions.task2),
          questionType: mockQuestions.task2.questionType
        }, dedupeKey2, abortController.signal)
      } catch (err) {
        task2Error = err instanceof Error ? err.message : 'Task 2 批改失败'
      }

      if (!task1Evaluation && !task2Evaluation) {
        throw new WritingEvaluationError('service', 'Task 1 和 Task 2 批改均失败，请稍后重试。')
      }

      const partialFailed = Boolean(task1Error || task2Error)

      setStageIndex(3)
      setSubmitStatus('organizing')
      setStageIndex(4)
      await new Promise((resolve) => window.setTimeout(resolve, 150))

      const now = new Date().toISOString()
      const elapsedSeconds = durationMinutes * 60 - timeLeftRef.current
      const task1Share = totalMockWords > 0 ? mockWordCounts.task1 / totalMockWords : 0.33
      const task1Duration = Math.round(elapsedSeconds * task1Share)
      const task2Duration = Math.max(0, elapsedSeconds - task1Duration)

      let evaluation: EssayEvaluation
      if (task1Evaluation && task2Evaluation) {
        evaluation = combineMockEvaluation(task1Evaluation, task2Evaluation, mockEssays.task1)
      } else if (task1Evaluation) {
        evaluation = {
          ...task1Evaluation,
          summary: `Task 1 批改完成（${task1Evaluation.overallBand || task1Evaluation.bandEstimate || '—'}）。Task 2 批改失败：${task2Error}。`,
          overallFeedback: `Task 1 批改完成。Task 2 批改失败，请重试 Task 2。`,
          annotationWarnings: [`Task 2 批改失败：${task2Error}`]
        }
      } else {
        evaluation = {
          ...task2Evaluation!,
          summary: `Task 2 批改完成（${task2Evaluation!.overallBand || task2Evaluation!.bandEstimate || '—'}）。Task 1 批改失败：${task1Error}。`,
          overallFeedback: `Task 2 批改完成。Task 1 批改失败，请重试 Task 1。`,
          annotationWarnings: [`Task 1 批改失败：${task1Error}`]
        }
      }

      const originalEssay = `Task 1\n${mockEssays.task1}\n\nTask 2\n${mockEssays.task2}`
      const record: WritingRecord = {
        id: createRecordId(),
        requestId: evaluation.requestId,
        deviceId: getLocalDeviceId(),
        taskType: 'mock',
        title: partialFailed ? 'Full IELTS Writing Test (部分完成)' : 'Full IELTS Writing Test',
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
        studyPlanTaskId: studyPlanTaskId || undefined,
        components: {
          task1: {
            taskType: 'task1',
            title: mockQuestions.task1.title,
            prompt: buildPrompt(mockQuestions.task1),
            essay: mockEssays.task1,
            durationSeconds: task1Duration,
            wordCount: mockWordCounts.task1,
            evaluation: task1Evaluation ?? undefined,
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
            evaluation: task2Evaluation ?? undefined,
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
      if (task1Evaluation) markGeneratedPromptCompleted(mockQuestions.task1.id, userId)
      if (task2Evaluation) markGeneratedPromptCompleted(mockQuestions.task2.id, userId)
      if (studyPlanTaskId) {
        try {
          const taskRes = await fetch(`/api/study-plan/tasks/${studyPlanTaskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ writingRecordId: record.id })
          })
          const taskData = await taskRes.json() as { success?: boolean; reward?: { awarded?: boolean; amount?: number } | null }
          if (taskData.reward?.awarded && taskData.reward.amount) {
            pushToast({ kind: 'success', title: '任务完成', message: `获得 ${taskData.reward.amount} 个计划调整点` })
          }
        } catch { /* non-critical */ }
      }
      if (draftId) {
        try {
          await completeManagedDraft(userId, draftId, record.id)
        } catch {
          pushToast({ kind: 'warning', title: '模考结果已保存', message: '草稿状态同步稍后会自动重试。' })
        }
      }
      window.localStorage.removeItem(timerKey)
      setStageIndex(5)
      setSubmitStatus('success')
      succeeded = true
      if (partialFailed) {
        pushToast({ kind: 'warning', title: '模考部分完成', message: `Task ${task1Error ? '1' : '2'}批改失败，已保存成功部分。` })
      } else {
        pushToast({ kind: 'success', title: '模考批改完成', message: '正在打开完整结果。' })
      }
      router.push(`/result?id=${record.id}`)
    } catch (caught) {
      const presentation = evaluationErrorMessage(caught)
      if (caught instanceof WritingEvaluationError && caught.kind === 'cancelled') {
        pushToast({ kind: 'info', ...presentation })
      } else {
        setError(presentation.message)
        setSubmitStatus('error')
        pushToast({ kind: 'error', ...presentation })
      }
    } finally {
      abortControllerRef.current = null
      setEvaluationStartTime(null)
      if (!succeeded) {
        window.setTimeout(() => setSubmitStatus((current) => (current === 'success' ? current : 'idle')), 800)
      }
    }
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
    if (!layout || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = layout.getBoundingClientRect()
    const usableWidth = Math.max(1, rect.width - WritingEditorDividerWidth)
    let animationFrame: number | null = null
    let latestClientX = event.clientX
    let ended = false

    const applyPosition = () => {
      animationFrame = null
      const proposed = ((latestClientX - rect.left) / usableWidth) * 100
      const next = clampWritingEditorSplitRatio(proposed, rect.width, { hasTaskVisuals })
      splitRatioRef.current = next
      setSplitWidth(next)
    }

    const move = (moveEvent: PointerEvent) => {
      latestClientX = moveEvent.clientX
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(applyPosition)
    }

    const finish = (upEvent?: Event, commit = true) => {
      if (ended) return
      ended = true
      if (upEvent instanceof PointerEvent) latestClientX = upEvent.clientX
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      if (commit) applyPosition()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', end)
      document.body.classList.remove('is-resizing-editor')
      if (commit) {
        setIsResizing(false)
        if (splitKey) window.localStorage.setItem(splitKey, String(splitRatioRef.current))
      }
      resizeCleanupRef.current = null
    }

    const end = (upEvent?: Event) => finish(upEvent, true)
    const cleanup = () => finish(undefined, false)

    resizeCleanupRef.current?.()
    resizeCleanupRef.current = cleanup
    document.body.classList.add('is-resizing-editor')
    setIsResizing(true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
  }

  function resetSplit() {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width || window.innerWidth
    const next = clampWritingEditorSplitRatio(
      defaultWritingEditorSplitRatio({ hasTaskVisuals }),
      layoutWidth,
      { hasTaskVisuals }
    )
    splitRatioRef.current = next
    setSplitWidth(next)
    window.localStorage.setItem(splitKey, String(next))
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
          <IsolatedTimer
            timerKey={timerKey}
            durationMinutes={durationMinutes}
            onExpire={handleTimerExpire}
          />
          <div className="exam-divider" />
          <div className="exam-info-item">
            <span className="ui-label">{mode === 'mock' ? (activeMockTask === 'task1' ? 'Task 1' : 'Task 2') : '字数'}</span>
            <span 
              className={`exam-word-count ${wordCount >= wordTarget ? 'word-count-good' : wordCount >= wordTarget * 0.8 ? 'word-count-medium' : wordCount < wordTarget * 0.5 ? 'word-count-low' : ''}`}
              title="字数统计按空格分词计算，与 IELTS 官方标准可能略有差异"
            >
              {wordCount}
              <span>/{wordTarget}</span>
            </span>
          </div>
          {mode === 'mock' ? null : null}
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
        {mode === 'mock' ? (
          <>
            <span>
              <MaterialIcon name="bar_chart" size={15} />
              Task 1：{mockTask1Label}
            </span>
            <span>
              <MaterialIcon name="edit_document" size={15} />
              Task 2：{mockTask2Label}
            </span>
            <span>
              <MaterialIcon name="notes" size={15} />
              当前：{activeMockTask === 'task1' ? 'Task 1' : 'Task 2'} {wordCount}/{wordTarget}
            </span>
          </>
        ) : (
          <>
            <span>
              <MaterialIcon name="assignment" size={15} />
              {questionLabel(activeQuestion)}
            </span>
            <span title={mode === 'task1' ? Task1SubtypeLabels[promptSelection.task1Subtype] : undefined}>
              <MaterialIcon name="tune" size={15} />
              {promptChoiceSummary}
            </span>
          </>
        )}
        <span>
          <MaterialIcon name={online ? 'wifi' : 'wifi_off'} size={15} />
          {online ? '在线' : '离线'}
        </span>
        <span>
          <MaterialIcon name={draftRestored ? 'restore' : 'draft'} size={15} />
          {draftRestored ? '已恢复草稿' : '新草稿'}
        </span>
      </div>

      <section
        ref={layoutRef}
        className="exam-layout"
        style={{ gridTemplateColumns: `${splitWidth}fr ${WritingEditorDividerWidth}px ${100 - splitWidth}fr` }}
      >
        <aside className="exam-left-pane">
          <div className="exam-left-inner">
            {mode === 'mock' ? (
              <div className="result-tabs full-test-tabs" role="tablist" aria-label="模考任务切换">
                {mockTaskOrder.map((taskType) => (
                  <button
                    key={taskType}
                    className={`result-tab ${activeMockTask === taskType ? 'is-active' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={activeMockTask === taskType}
                    onClick={() => {
                      if (taskType !== activeMockTask) {
                        void saveAllDrafts(false, { activeTask: taskType })
                        setActiveMockTask(taskType)
                      }
                    }}
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
                {activeQuestion.generatedSource === 'user_upload' ? <p className="ui-label">结构化复原</p> : null}
                <Task1Visual
                  chartType={activeQuestion.questionType}
                  chartSpec={activeQuestion.chartSpec}
                  processSpec={activeQuestion.processSpec}
                  mapSpec={activeQuestion.mapSpec}
                  title={activeQuestion.title}
                />
              </div>
            ) : null}

            {/* Diagnostic: map type but no mapSpec */}
            {activeQuestion.taskType === 'task1' && activeQuestion.questionType === 'map' && !activeQuestion.mapSpec ? (
              <div className="task1-chart-error" role="alert">
                <span className="task1-chart-error-icon">!</span>
                <p className="task1-chart-error-title">地图数据缺失</p>
                <p className="task1-chart-error-message">
                  此题目被标记为地图题，但未能加载地图可视化数据。请刷新页面或选择其他题目。
                  {process.env.NODE_ENV === 'development' ? (
                    <code style={{ display: 'block', marginTop: 8, fontSize: 11, opacity: 0.7 }}>
                      questionId: {activeQuestion.id}, questionType: {activeQuestion.questionType}, hasMapSpec: {String(!!activeQuestion.mapSpec)}
                    </code>
                  ) : null}
                </p>
              </div>
            ) : null}

            {activeQuestion.generatedSource === 'user_upload' && activeQuestion.structuredData?.parseStatus === 'partial' ? (
              <p className="custom-task-warning" role="status">
                部分图表数据未能完全复原，请同时参考原始图片。
              </p>
            ) : null}

            {activeQuestion.image ? (
              activeQuestion.generatedSource === 'user_upload'
                && Boolean(activeQuestion.chartSpec || activeQuestion.processSpec || activeQuestion.mapSpec) ? (
                  <details className="exam-original-image">
                    <summary>查看原始图片</summary>
                    <div className="exam-graph-frame">
                      <p className="ui-label">原始图片核对</p>
                      <Image
                        alt={activeQuestion.imageAlt || activeQuestion.title}
                        src={activeQuestion.image}
                        width={720}
                        height={400}
                        style={{ width: '100%', height: 'auto' }}
                        unoptimized
                      />
                    </div>
                  </details>
                ) : (
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
                )
            ) : null}

          </div>
        </aside>

        <div
          className={`resizer-handle ${isResizing ? 'is-active' : ''}`}
          role="separator"
          aria-label="调整题目区和写作区宽度"
          aria-orientation="vertical"
          aria-valuemin={Math.round(getWritingEditorSplitBounds(layoutWidth, { hasTaskVisuals }).minimum)}
          aria-valuemax={Math.round(getWritingEditorSplitBounds(layoutWidth, { hasTaskVisuals }).maximum)}
          aria-valuenow={Math.round(splitWidth)}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onDoubleClick={resetSplit}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              const layoutWidth = layoutRef.current?.getBoundingClientRect().width || window.innerWidth
              const next = clampWritingEditorSplitRatio(
                splitWidth + (event.key === 'ArrowRight' ? 2 : -2),
                layoutWidth,
                { hasTaskVisuals }
              )
              splitRatioRef.current = next
              setSplitWidth(next)
              window.localStorage.setItem(splitKey, String(next))
            }
          }}
        />

        <section className="exam-right-pane">
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
            <div className="editor-footer" />
            {loading ? (
              <section className="editor-progress-panel" role="status" aria-live="polite">
                <div className="progress-header">
                  <h2 className="ui-title-md">正在批改作文</h2>
                  <button className="cancel-button" type="button" onClick={cancelEvaluation}>
                    取消
                  </button>
                </div>
                <ol className="stage-list">
                  {evaluationStages.map((stage, index) => (
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
        message={exitSaveError || (isSavingBeforeExit ? '正在保存草稿…' : '草稿将保存到本地。离开后可以从同一 Task 页面恢复。')}
        confirmLabel={isSavingBeforeExit ? '保存中…' : exitSaveError ? '重试保存' : '退出'}
        cancelLabel={exitSaveError ? '放弃保存并退出' : '留下'}
        onCancel={() => {
          if (exitSaveError) {
            router.push('/practice')
          } else {
            setShowExitConfirm(false)
          }
        }}
        onConfirm={() => {
          if (isSavingBeforeExit) return
          void handleConfirmedExit()
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

      <ConfirmDialog
        open={showResubmitConfirm}
        title="检测到重复批改"
        message={'相同内容的批改正在进行中。点击"等待"可等待当前批改完成，点击"重新批改"将强制重新提交。'}
        confirmLabel="等待当前批改"
        cancelLabel="重新批改"
        onCancel={() => {
          if (pendingResubmitKey) {
            pendingEvaluationsRef.current.delete(pendingResubmitKey)
          }
          setShowResubmitConfirm(false)
          setPendingResubmitKey(null)
          void submitCurrent()
        }}
        onConfirm={() => {
          setShowResubmitConfirm(false)
          setPendingResubmitKey(null)
          pushToast({ kind: 'info', title: '正在处理中', message: '请等待当前批改完成。' })
        }}
      />
    </main>
  )
}
