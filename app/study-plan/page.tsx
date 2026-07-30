'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useAuth } from '@/components/auth/UserSessionProvider'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import type {
  StudyPlan,
  StudyPlanProfile,
  StudyPlanGenerationQuota,
  StudyPlanTask
} from '@/lib/study-plan-types'
import { styles } from '@/components/study-plan/styles'

const MonthCalendar = dynamic(
  () => import('@/components/study-plan/MonthCalendar').then((m) => ({ default: m.MonthCalendar })),
  { loading: () => <div style={{ minHeight: 400, borderRadius: 24, background: 'var(--surface-container-low)' }} /> }
)

const CreatePlanWizard = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.CreatePlanWizard })),
  { loading: () => null }
)

const ReplanSetupDialog = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.ReplanSetupDialog })),
  { loading: () => null }
)

const SettingsDialog = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.SettingsDialog })),
  { loading: () => null }
)

const TaskDetailDialog = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.TaskDetailDialog })),
  { loading: () => null }
)

const ReplanProgressBanner = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.ReplanProgressBanner })),
  { loading: () => null }
)

const GenerationProgressCard = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.GenerationProgressCard })),
  { loading: () => null }
)

const PlanOverview = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.PlanOverview })),
  { loading: () => <div style={{ minHeight: 200, borderRadius: 24, background: 'var(--surface-container-low)' }} /> }
)

const TodayTasks = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.TodayTasks })),
  { loading: () => null }
)

const BottomActions = dynamic(
  () => import('@/components/study-plan/StudyPlanDialogs').then((m) => ({ default: m.BottomActions })),
  { loading: () => null }
)

type PlanData = {
  success?: boolean
  plan: StudyPlan | null
  profile: StudyPlanProfile | null
  quota: StudyPlanGenerationQuota
}

type GenerationJob = {
  id: string
  jobType?: string
  status: string
  progress: number
  stage?: string | null
  message?: string | null
  currentStep: string | null
  heartbeatAt?: string | null
  resultPlanId: string | null
  errorCode?: string | null
  errorMessage: string | null
  attemptCount?: number
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
  updatedAt?: string
}

type ViewMode =
  | 'resolving'
  | 'empty'
  | 'plan'
  | 'replan-setup'
  | 'generating'
  | 'replanning'
  | 'loading-plan'
  | 'failed'

type PageAction =
  | { type: 'BOOT_RESOLVED_WITH_PLAN'; plan: StudyPlan; profile: StudyPlanProfile | null }
  | { type: 'BOOT_RESOLVED_WITHOUT_PLAN' }
  | { type: 'BOOT_FAILED' }
  | { type: 'ACTIVE_JOB_RECOVERED'; job: GenerationJob }
  | { type: 'OPEN_REPLAN_SETUP' }
  | { type: 'CANCEL_SETUP' }
  | { type: 'SUBMIT_REPLAN'; job: GenerationJob }
  | { type: 'SUBMIT_INITIAL'; job: GenerationJob }
  | { type: 'JOB_PROGRESS'; job: GenerationJob }
  | { type: 'JOB_COMPLETED'; job: GenerationJob }
  | { type: 'JOB_FAILED'; job: GenerationJob }
  | { type: 'PLAN_FETCH_SUCCEEDED'; plan: StudyPlan; profile: StudyPlanProfile | null }
  | { type: 'PLAN_FETCH_FAILED' }
  | { type: 'RETURN_TO_PLAN' }
  | { type: 'CLEAR_ACTIVE_JOB' }

type PageState = {
  viewMode: ViewMode
  plan: StudyPlan | null
  profile: StudyPlanProfile | null
  activeJob: GenerationJob | null
  planLoadRetries: number
  bootDone: boolean
}

function isJobActive(job: GenerationJob | null): boolean {
  if (!job) return false
  return job.status === 'queued' || job.status === 'running'
}

function isJobDone(job: GenerationJob | null): boolean {
  return job?.status === 'completed'
}

function isJobFailed(job: GenerationJob | null): boolean {
  if (!job) return false
  return job.status === 'failed' || job.status === 'timed_out' || job.status === 'cancelled'
}

function studyPlanReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'BOOT_RESOLVED_WITH_PLAN':
      return {
        ...state,
        viewMode: 'plan',
        plan: action.plan,
        profile: action.profile,
        bootDone: true
      }

    case 'BOOT_RESOLVED_WITHOUT_PLAN':
      return {
        ...state,
        viewMode: 'empty',
        bootDone: true
      }

    case 'BOOT_FAILED':
      return {
        ...state,
        viewMode: 'failed',
        bootDone: true
      }

    case 'ACTIVE_JOB_RECOVERED': {
      const job = action.job
      if (isJobActive(job)) {
        const isReplan = job.jobType === 'replan'
        return {
          ...state,
          activeJob: job,
          viewMode: isReplan ? 'replanning' : 'generating'
        }
      }
      if (isJobDone(job) && job.resultPlanId) {
        return {
          ...state,
          activeJob: job,
          viewMode: 'loading-plan',
          planLoadRetries: 0
        }
      }
      if (isJobFailed(job)) {
        return {
          ...state,
          activeJob: job,
          viewMode: state.plan ? 'plan' : 'empty'
        }
      }
      return state
    }

    case 'OPEN_REPLAN_SETUP':
      if (state.viewMode !== 'plan' && state.viewMode !== 'empty' && state.viewMode !== 'failed') return state
      return {
        ...state,
        viewMode: 'replan-setup'
      }

    case 'CANCEL_SETUP':
      return {
        ...state,
        viewMode: state.plan ? 'plan' : 'empty'
      }

    case 'SUBMIT_REPLAN':
      return {
        ...state,
        viewMode: 'replanning',
        activeJob: action.job
      }

    case 'SUBMIT_INITIAL':
      return {
        ...state,
        viewMode: 'generating',
        activeJob: action.job
      }

    case 'JOB_PROGRESS':
      if (!state.activeJob || state.activeJob.id !== action.job.id) return state
      return {
        ...state,
        activeJob: action.job
      }

    case 'JOB_COMPLETED':
      if (!state.activeJob || state.activeJob.id !== action.job.id) return state
      return {
        ...state,
        activeJob: action.job,
        viewMode: 'loading-plan',
        planLoadRetries: 0
      }

    case 'JOB_FAILED':
      if (!state.activeJob || state.activeJob.id !== action.job.id) return state
      return {
        ...state,
        activeJob: action.job,
        viewMode: state.plan ? 'plan' : 'empty'
      }

    case 'PLAN_FETCH_SUCCEEDED':
      return {
        ...state,
        viewMode: 'plan',
        plan: action.plan,
        profile: action.profile,
        activeJob: null,
        planLoadRetries: 0
      }

    case 'PLAN_FETCH_FAILED':
      return {
        ...state,
        planLoadRetries: state.planLoadRetries + 1
      }

    case 'RETURN_TO_PLAN':
      return {
        ...state,
        viewMode: state.plan ? 'plan' : 'empty',
        activeJob: null
      }

    case 'CLEAR_ACTIVE_JOB':
      return {
        ...state,
        activeJob: state.activeJob ? null : state.activeJob
      }

    default:
      return state
  }
}

const initialState: PageState = {
  viewMode: 'resolving',
  plan: null,
  profile: null,
  activeJob: null,
  planLoadRetries: 0,
  bootDone: false
}

class ApiResponseError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiResponseError'
    this.status = status
  }
}

async function fetchPlan(): Promise<PlanData> {
  const res = await fetch('/api/study-plan')
  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiResponseError(
      (payload && typeof payload === 'object' && 'message' in payload ? String((payload as Record<string, unknown>).message) : null) || `请求失败（${res.status}）`,
      res.status
    )
  }
  return payload as PlanData
}

export default function StudyPlanPage() {
  const { userId, status: authStatus } = useAuth()
  const { pushToast } = useToast()

  // Only fetch when auth is complete and user is authenticated
  const shouldFetch = authStatus === 'authenticated' && !!userId
  const { data, error, mutate, isLoading } = useSWR(shouldFetch ? ['study-plan', userId] : null, fetchPlan, { revalidateOnFocus: false, shouldRetryOnError: false })

  const [state, dispatch] = useReducer(studyPlanReducer, initialState)
  const [analysisJob, setAnalysisJob] = useState<GenerationJob | null>(null)
  const [jobRestored, setJobRestored] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedTask, setSelectedTask] = useState<StudyPlanTask | null>(null)
  const [showReplanSuggestion, setShowReplanSuggestion] = useState<{ reasons: string[] } | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const bootResolvedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollingRef.current) clearTimeout(pollingRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Safety timeout: if still in 'resolving' after 5 seconds, force transition to failed with retry
  // Only start timer after auth is complete to avoid premature failure
  useEffect(() => {
    if (state.viewMode !== 'resolving') return
    if (authStatus === 'loading') return
    const timer = window.setTimeout(() => {
      if (mountedRef.current && state.viewMode === 'resolving') {
        dispatch({ type: 'BOOT_FAILED' })
      }
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [state.viewMode, authStatus])

  // Boot resolution: decide initial viewMode from SWR data only (not blocked by job restoration)
  // Must wait for auth to be complete before resolving
  useEffect(() => {
    if (bootResolvedRef.current) return
    if (authStatus === 'loading') return
    if (authStatus === 'unauthenticated') return
    if (isLoading && !data && !error) return

    bootResolvedRef.current = true

    if (error && !data?.plan) {
      dispatch({ type: 'BOOT_FAILED' })
      return
    }

    if (data?.plan) {
      dispatch({ type: 'BOOT_RESOLVED_WITH_PLAN', plan: data.plan, profile: data.profile ?? null })
    } else {
      dispatch({ type: 'BOOT_RESOLVED_WITHOUT_PLAN' })
    }
  }, [data, error, isLoading, authStatus])

  // Restore active job on mount (with timeout, non-blocking)
  // Only request if localStorage indicates an active job was in progress
  useEffect(() => {
    if (!userId || jobRestored) return

    let storedJobId: string | null = null
    try { storedJobId = localStorage.getItem('activeStudyPlanJobId') } catch {}
    let storedAnalysisJobId: string | null = null
    try { storedAnalysisJobId = localStorage.getItem('activeAnalysisRefreshJobId') } catch {}

    // Skip request if no stored job IDs indicate active generation
    if (!storedJobId && !storedAnalysisJobId) {
      window.queueMicrotask(() => setJobRestored(true))
      return
    }

    let cancelled = false

    async function restoreActiveJob() {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        const res = await fetch('/api/study-plan/generation-jobs/current', { signal: controller.signal })
        clearTimeout(timeoutId)
        const data = await res.json() as { success?: boolean; job?: GenerationJob | null }
        if (cancelled || !mountedRef.current) return

        if (data.success && data.job) {
          const job = data.job
          const isActive = job.status === 'queued' || job.status === 'running'
          const isDone = job.status === 'completed'
          const isFailed = job.status === 'failed' || job.status === 'timed_out'

          if (job.jobType === 'analysis_refresh') {
            setAnalysisJob(job)
            if (isActive) {
              try { localStorage.setItem('activeAnalysisRefreshJobId', job.id) } catch {}
            } else {
              try { localStorage.removeItem('activeAnalysisRefreshJobId') } catch {}
            }
          } else {
            if (isActive) {
              dispatch({ type: 'ACTIVE_JOB_RECOVERED', job })
              try { localStorage.setItem('activeStudyPlanJobId', job.id) } catch {}
            } else {
              try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
              if (isDone && job.resultPlanId) {
                dispatch({ type: 'ACTIVE_JOB_RECOVERED', job })
              } else if (isFailed) {
                dispatch({ type: 'ACTIVE_JOB_RECOVERED', job })
              }
            }
          }
        } else {
          // No active job on server — clear stale localStorage
          try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
          try { localStorage.removeItem('activeAnalysisRefreshJobId') } catch {}
        }
      } catch {
        // Silent fail — timeout or network error does not block the page
      } finally {
        if (!cancelled) setJobRestored(true)
      }
    }

    restoreActiveJob()
    return () => { cancelled = true }
  }, [userId, jobRestored])

  // SWR data sync: update plan data without changing viewMode during replan-setup or active job
  useEffect(() => {
    if (!data?.plan) return
    if (state.viewMode === 'replan-setup') return
    if (state.viewMode === 'resolving') return
    if (state.viewMode === 'replanning' || state.viewMode === 'generating' || state.viewMode === 'loading-plan') return

    if (state.viewMode === 'plan' || state.viewMode === 'failed') {
      dispatch({ type: 'BOOT_RESOLVED_WITH_PLAN', plan: data.plan, profile: data.profile ?? null })
    }
  }, [data, state.viewMode])

  // Adaptive polling for active generation job
  useEffect(() => {
    const job = state.activeJob
    if (!job) return
    if (!isJobActive(job)) return

    let cancelled = false

    function getPollInterval(): number {
      const createdAt = new Date(job!.createdAt).getTime()
      const elapsed = Date.now() - createdAt
      if (elapsed < 60_000) return 2000
      if (elapsed < 300_000) return 4000
      return 8000
    }

    async function pollJob() {
      if (cancelled || !mountedRef.current) return
      try {
        const controller = new AbortController()
        abortRef.current?.abort()
        abortRef.current = controller

        const res = await fetch(`/api/study-plan/generation-jobs/${job!.id}`, {
          signal: controller.signal
        })
        if (cancelled || !mountedRef.current) return

        const data = await res.json() as { success?: boolean; job?: GenerationJob }
        if (cancelled || !mountedRef.current || !data.success || !data.job) return

        const updatedJob = data.job

        if (updatedJob.status === 'completed') {
          try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
          dispatch({ type: 'JOB_COMPLETED', job: updatedJob })
          return
        }

        if (updatedJob.status === 'failed' || updatedJob.status === 'timed_out' || updatedJob.status === 'cancelled') {
          try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
          dispatch({ type: 'JOB_FAILED', job: updatedJob })
          pushToast({ kind: 'error', title: updatedJob.status === 'timed_out' ? '计划生成超时' : '计划生成失败', message: updatedJob.errorMessage || '请稍后重试' })
          return
        }

        dispatch({ type: 'JOB_PROGRESS', job: updatedJob })

        if (!cancelled && mountedRef.current) {
          pollingRef.current = setTimeout(pollJob, getPollInterval())
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          pollingRef.current = setTimeout(pollJob, getPollInterval())
        }
      }
    }

    pollingRef.current = setTimeout(pollJob, 500)

    return () => {
      cancelled = true
      if (pollingRef.current) clearTimeout(pollingRef.current)
    }
  }, [state.activeJob, state.activeJob?.id, state.activeJob?.status, pushToast])

  // Load plan after job completion
  useEffect(() => {
    if (state.viewMode !== 'loading-plan') return
    if (!state.activeJob?.resultPlanId) return

    let cancelled = false

    async function loadNewPlan() {
      const maxRetries = 5
      for (let i = 0; i < maxRetries; i++) {
        if (cancelled || !mountedRef.current) return
        try {
          const planData = await fetchPlan()
          if (planData.plan) {
            if (!cancelled && mountedRef.current) {
              dispatch({ type: 'PLAN_FETCH_SUCCEEDED', plan: planData.plan, profile: planData.profile ?? null })
              void mutate()
              pushToast({ kind: 'success', title: '学习计划已更新' })
            }
            return
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1500 * (i + 1)))
      }
      if (!cancelled && mountedRef.current) {
        if (state.planLoadRetries < 2) {
          dispatch({ type: 'PLAN_FETCH_FAILED' })
          pushToast({ kind: 'info', title: '计划已生成', message: '正在同步数据，请稍候...' })
          void mutate()
          setTimeout(() => {
            if (mountedRef.current) dispatch({ type: 'RETURN_TO_PLAN' })
          }, 3000)
        } else {
          dispatch({ type: 'RETURN_TO_PLAN' })
          void mutate()
          pushToast({ kind: 'info', title: '计划已生成', message: '请刷新页面查看' })
        }
      }
    }

    loadNewPlan()
    return () => { cancelled = true }
  }, [state.viewMode, state.activeJob?.resultPlanId, state.planLoadRetries, pushToast, mutate])

  const quota = data?.quota
  const plan = state.plan ?? data?.plan ?? null
  const profile = state.profile ?? data?.profile ?? null

  const checkReplanSuggestion = useCallback(async () => {
    try {
      const res = await fetch('/api/study-plan')
      const planData = await res.json() as PlanData
      const prevSnapshot = plan?.diagnosis as Record<string, unknown> | undefined
      const newSnapshot = planData.profile?.analysisSnapshot as Record<string, unknown> | undefined
      if (!prevSnapshot || !newSnapshot) return

      const reasons: string[] = []
      const prevCounts = prevSnapshot.counts as Record<string, number> | undefined
      const newCounts = newSnapshot.counts as Record<string, number> | undefined
      if (prevCounts && newCounts) {
        const newEssays = (newCounts.total ?? 0) - (prevCounts.total ?? 0)
        if (newEssays >= 3) reasons.push(`新增了 ${newEssays} 篇已批改作文`)
      }
      const prevScores = prevSnapshot.scores as Record<string, number | null> | undefined
      const newScores = newSnapshot.scores as Record<string, number | null> | undefined
      if (prevScores && newScores) {
        const prevAvg = prevScores.overall ?? 0
        const newAvg = newScores.overall ?? 0
        if (Math.abs(newAvg - prevAvg) >= 0.5) reasons.push(`总体平均分从 ${prevAvg.toFixed(1)} 变为 ${newAvg.toFixed(1)}`)
      }
      const prevDiag = prevSnapshot.diagnosis as Record<string, unknown> | undefined
      const newDiag = newSnapshot.diagnosis as Record<string, unknown> | undefined
      if (prevDiag && newDiag) {
        const prevWeak = (prevDiag.weakestCriteria as string[]) ?? []
        const newWeak = (newDiag.weakestCriteria as string[]) ?? []
        if (prevWeak[0] !== newWeak[0]) reasons.push('最薄弱评分维度发生变化')
      }

      if (reasons.length >= 2 && mountedRef.current) {
        setShowReplanSuggestion({ reasons })
      }
    } catch { /* ignore */ }
  }, [plan])

  // Polling for analysis refresh job
  useEffect(() => {
    if (!analysisJob) return
    const isActive = analysisJob.status === 'queued' || analysisJob.status === 'running'
    if (!isActive) return

    let cancelled = false

    async function pollAnalysisJob() {
      if (cancelled || !mountedRef.current) return
      try {
        const res = await fetch(`/api/study-plan/generation-jobs/${analysisJob!.id}`)
        if (cancelled || !mountedRef.current) return
        const data = await res.json() as { success?: boolean; job?: GenerationJob }
        if (!data.success || !data.job) return

        const job = data.job
        setAnalysisJob((prev) => {
          if (!prev || prev.id !== job.id) return prev
          if (prev.status === job.status && prev.progress === job.progress) return prev
          return job
        })

        if (job.status === 'completed') {
          try { localStorage.removeItem('activeAnalysisRefreshJobId') } catch {}
          await mutate()
          pushToast({ kind: 'success', title: '学习数据已更新' })
          void checkReplanSuggestion()
          setTimeout(() => {
            if (mountedRef.current) setAnalysisJob(null)
          }, 3000)
          return
        }

        if (job.status === 'failed' || job.status === 'timed_out') {
          try { localStorage.removeItem('activeAnalysisRefreshJobId') } catch {}
          pushToast({ kind: 'error', title: '学习数据更新失败', message: job.errorMessage || '请稍后重试' })
          return
        }

        if (!cancelled && mountedRef.current) {
          setTimeout(pollAnalysisJob, 3000)
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setTimeout(pollAnalysisJob, 5000)
        }
      }
    }

    setTimeout(pollAnalysisJob, 500)
    return () => { cancelled = true }
  }, [analysisJob, analysisJob?.id, analysisJob?.status, mutate, pushToast, checkReplanSuggestion])

  const isAnalysisRefreshing = analysisJob && (analysisJob.status === 'queued' || analysisJob.status === 'running')

  const handleGenerate = useCallback(async (formData?: Record<string, unknown>) => {
    const pendingJob: GenerationJob = {
      id: 'pending',
      status: 'queued',
      progress: 0,
      currentStep: null,
      resultPlanId: null,
      errorMessage: null,
      createdAt: new Date().toISOString()
    }
    if (formData?.sourcePlanId) {
      dispatch({ type: 'SUBMIT_REPLAN', job: pendingJob })
    } else {
      dispatch({ type: 'SUBMIT_INITIAL', job: pendingJob })
    }
    setShowCreate(false)

    try {
      const res = await fetch('/api/study-plan/generation-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData ?? {})
      })
      const json = await res.json() as { success?: boolean; jobId?: string; status?: string; progress?: number; currentStep?: string; message?: string }
      if (!res.ok && res.status !== 202 && res.status !== 200) {
        dispatch({ type: 'RETURN_TO_PLAN' })
        pushToast({ kind: 'error', title: '创建失败', message: json.message || '请稍后重试' })
        return
      }
      if (json.jobId) {
        const realJob: GenerationJob = {
          id: json.jobId,
          status: json.status ?? 'queued',
          progress: json.progress ?? 0,
          currentStep: json.currentStep ?? null,
          resultPlanId: null,
          errorMessage: null,
          createdAt: new Date().toISOString()
        }
        try { localStorage.setItem('activeStudyPlanJobId', json.jobId) } catch {}
        dispatch({ type: 'JOB_PROGRESS', job: realJob })
      }
      pushToast({ kind: 'success', title: '正在后台生成学习计划', message: '你可以离开此页面，完成后会自动通知。' })
    } catch {
      dispatch({ type: 'RETURN_TO_PLAN' })
      pushToast({ kind: 'error', title: '创建失败', message: '请稍后重试' })
    }
  }, [pushToast])

  const handleRetry = useCallback(async () => {
    if (!state.activeJob?.id) return
    try {
      await fetch(`/api/study-plan/generation-jobs/${state.activeJob.id}/retry`, { method: 'POST' })
      const retriedJob: GenerationJob = {
        ...state.activeJob,
        status: 'queued',
        progress: 0,
        errorMessage: null,
        errorCode: null
      }
      dispatch({ type: 'JOB_PROGRESS', job: retriedJob })
      try { localStorage.setItem('activeStudyPlanJobId', state.activeJob.id) } catch {}
    } catch {
      pushToast({ kind: 'error', title: '重试失败' })
    }
  }, [state.activeJob, pushToast])

  const handleRefreshAnalysis = useCallback(async () => {
    if (isAnalysisRefreshing) {
      pushToast({ kind: 'info', title: '学习数据正在更新中' })
      return
    }
    if (isJobActive(state.activeJob)) {
      pushToast({ kind: 'info', title: '计划生成完成后可更新分析' })
      return
    }
    try {
      const res = await fetch('/api/study-plan/analysis-refresh', { method: 'POST' })
      const json = await res.json() as { success?: boolean; jobId?: string; status?: string; message?: string }
      if (!res.ok) {
        pushToast({ kind: 'error', title: '更新失败', message: json.message || '请稍后重试' })
        return
      }
      if (json.jobId) {
        setAnalysisJob({
          id: json.jobId,
          status: json.status ?? 'queued',
          progress: 0,
          currentStep: null,
          resultPlanId: null,
          errorMessage: null,
          createdAt: new Date().toISOString()
        })
        try { localStorage.setItem('activeAnalysisRefreshJobId', json.jobId) } catch {}
      }
      pushToast({ kind: 'success', title: '正在更新学习数据' })
    } catch {
      pushToast({ kind: 'error', title: '更新失败', message: '请稍后重试' })
    }
  }, [isAnalysisRefreshing, state.activeJob, pushToast])

  if (!userId) return <PageSkeleton variant="chart" />

  if (state.viewMode === 'resolving') return <PageSkeleton variant="chart" />

  if (state.viewMode === 'failed' && !plan && !isJobActive(state.activeJob)) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="study-plan-page">
          <StudyPlanHeader quota={quota} />
          <GlassPanel style={styles.emptyCard}>
            <MaterialIcon name="error" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>加载失败</h2>
            <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
              {error?.status === 401 ? '请重新登录后再试。' : '学习规划加载失败，请稍后重试。'}
            </p>
            <button className="ui-primary-button" type="button" style={{ marginTop: 16 }} onClick={() => { void mutate() }}>
              重新加载
            </button>
          </GlassPanel>
        </section>
      </main>
    )
  }

  if (state.viewMode === 'empty' || (!plan && !isJobActive(state.activeJob) && state.viewMode !== 'replan-setup')) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="study-plan-page">
          <StudyPlanHeader quota={quota} />
          {isJobFailed(state.activeJob) && (
            <GlassPanel style={styles.failedBanner}>
              <MaterialIcon name="error" size={20} />
              <div style={{ flex: 1 }}>
                <p className="ui-body-md">
                  {state.activeJob?.status === 'timed_out' ? '上次计划生成超时' : '上次计划生成失败'}
                </p>
                {state.activeJob?.errorMessage && <p className="ui-label">{state.activeJob.errorMessage}</p>}
              </div>
              <button className="ui-primary-button" type="button" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleRetry}>
                重试
              </button>
            </GlassPanel>
          )}
          <EmptyPlan onGenerate={() => setShowCreate(true)} />
          {showCreate && (
            <CreatePlanWizard
              profile={profile}
              diagnosis={plan?.diagnosis}
              onGenerate={handleGenerate}
              onClose={() => setShowCreate(false)}
            />
          )}
        </section>
      </main>
    )
  }

  const isGenerating = isJobActive(state.activeJob) && state.viewMode === 'generating'
  const isReplanning = isJobActive(state.activeJob) && state.viewMode === 'replanning'
  const isReplanSetup = state.viewMode === 'replan-setup'
  const isLoadingPlan = state.viewMode === 'loading-plan'
  const showJobFailedBanner = isJobFailed(state.activeJob) && plan

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="study-plan-page">
        <StudyPlanHeader quota={quota} />

        {showJobFailedBanner && (
          <GlassPanel style={styles.failedBanner}>
            <MaterialIcon name="error" size={20} />
            <div style={{ flex: 1 }}>
              <p className="ui-body-md">
                {state.activeJob?.status === 'timed_out' ? '上次计划生成超时' : '上次计划生成失败'}
              </p>
              {state.activeJob?.errorMessage && <p className="ui-label">{state.activeJob.errorMessage}</p>}
            </div>
            <button className="ui-primary-button" type="button" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleRetry}>
              重试
            </button>
          </GlassPanel>
        )}

        {isReplanning && state.activeJob && (
          <ReplanProgressBanner job={state.activeJob} />
        )}

        {isLoadingPlan && (
          <GlassPanel style={styles.progressCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <MaterialIcon name="check_circle" size={24} />
              <div style={{ flex: 1 }}>
                <h2 className="ui-title-md">学习计划已生成</h2>
                <p className="ui-body-md">正在加载完整学习安排...</p>
              </div>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: '100%', background: 'var(--success)' }} />
            </div>
          </GlassPanel>
        )}

        {isGenerating && state.activeJob && (
          <GenerationProgressCard job={state.activeJob} />
        )}

        {plan && !isGenerating && (
          <>
            <PlanOverview
              plan={plan}
              profile={profile}
              onRefreshAnalysis={handleRefreshAnalysis}
              isAnalysisRefreshing={!!isAnalysisRefreshing}
              analysisRefreshProgress={analysisJob?.progress ?? 0}
            />

            <MonthCalendar
              plan={plan}
              currentMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelectTask={setSelectedTask}
            />

            <TodayTasks
              tasks={plan.tasks?.filter((t) => t.scheduledDate === getDateKeyInTimeZone() && t.status !== 'rescheduled') ?? []}
              onSelectTask={setSelectedTask}
            />

            {!isReplanSetup && (
              <BottomActions
                quota={quota}
                onReplan={() => dispatch({ type: 'OPEN_REPLAN_SETUP' })}
                onSettings={() => setShowSettings(true)}
              />
            )}
          </>
        )}

        {isReplanSetup && (
          <ReplanSetupDialog
            profile={profile}
            diagnosis={plan?.diagnosis}
            planId={plan?.id}
            onGenerate={handleGenerate}
            onCancel={() => dispatch({ type: 'CANCEL_SETUP' })}
          />
        )}

        {showSettings && profile && (
          <SettingsDialog
            profile={profile}
            onClose={() => setShowSettings(false)}
            mutate={() => void mutate()}
          />
        )}

        {selectedTask && (
          <TaskDetailDialog
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onMutate={() => { void mutate() }}
          />
        )}

        {showReplanSuggestion && (
          <CenteredDialog
            open
            title="检测到学习情况变化"
            onClose={() => setShowReplanSuggestion(null)}
            footer={
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="ui-secondary-button" type="button" onClick={() => setShowReplanSuggestion(null)}>
                  暂不调整
                </button>
                <button
                  className="ui-primary-button"
                  type="button"
                  disabled={quota?.remainingCount === 0}
                  onClick={() => {
                    setShowReplanSuggestion(null)
                    dispatch({ type: 'OPEN_REPLAN_SETUP' })
                  }}
                >
                  根据最新数据重新规划
                </button>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="ui-body-md">本次分析更新发现以下变化：</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {showReplanSuggestion.reasons.map((reason, i) => (
                  <li key={i} style={{ fontSize: 14, marginBottom: 4 }}>{reason}</li>
                ))}
              </ul>
              <p className="ui-body-md" style={{ color: 'var(--text-secondary)' }}>
                是否根据最新数据调整未来学习计划？当前计划在新计划生成前仍可正常使用。
              </p>
            </div>
          </CenteredDialog>
        )}
      </section>
    </main>
  )
}

function StudyPlanHeader({ quota }: { quota?: StudyPlanGenerationQuota }) {
  return (
    <header className="page-section-header">
      <div>
        <h1 className="ui-title-display">雅思写作学习规划</h1>
        <p className="ui-body-md" style={{ marginTop: 4 }}>根据你的目标、剩余时间和真实写作表现，动态安排整个备考周期。</p>
      </div>
      {quota ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="task-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MaterialIcon name="event_repeat" size={14} />
          本月可调整：{quota.remainingCount}/{quota.limit} 次
        </span>
      </div> : null}
    </header>
  )
}

function EmptyPlan({ onGenerate }: { onGenerate: () => void }) {
  return (
    <GlassPanel style={styles.emptyCard}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--surface-container-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <MaterialIcon name="school" size={36} />
      </div>
      <h2 className="ui-title-headline">准备开始你的雅思写作计划</h2>
      <p className="ui-body-md" style={{ maxWidth: 440, margin: '8px auto', color: 'var(--text-secondary)' }}>
        系统会根据你的目标分数、备考时间和真实写作表现，为整个备考周期安排训练、休息和模考。
      </p>
      <button className="ui-primary-button" type="button" onClick={onGenerate} style={{ marginTop: 16, padding: '12px 32px', fontSize: 15 }}>
        创建学习计划
      </button>
      <p className="ui-label" style={{ marginTop: 8, color: 'var(--text-secondary)' }}>预计用时 2 分钟</p>
    </GlassPanel>
  )
}
