'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'
import type {
  StudyPlan,
  StudyPlanProfile,
  StudyPlanGenerationQuota,
  StudyPlanTask,
  StudyPlanTaskType,
  StudyPlanDiagnosis,
  QuestionSource
} from '@/lib/study-plan-types'
import {
  StudyPlanTaskTypeLabels,
  StudyPlanTaskStatusLabels,
  PlanPhaseLabels,
  QuestionSourceLabels,
  ShortCriterionLabels,
  isWritableTaskType,
  taskTypeToWriteMode
} from '@/lib/study-plan-types'

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

type AdjustmentPoints = {
  success: boolean
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

type PageState = 'loading' | 'empty' | 'generating' | 'loading_plan' | 'ready' | 'failed'

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

function computeExamDays(examDate: string | null): number | null {
  if (!examDate) return null
  return Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000))
}

export default function StudyPlanPage() {
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const { data, error, mutate, isLoading } = useSWR(userId ? 'study-plan' : null, fetchPlan, { revalidateOnFocus: false, shouldRetryOnError: false })
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null)
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
  const planLoadRetriesRef = useRef(0)
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollingRef.current) clearTimeout(pollingRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // Restore active job on mount
  useEffect(() => {
    if (!userId || jobRestored) return
    let cancelled = false

    async function restoreActiveJob() {
      try {
        const res = await fetch('/api/study-plan/generation-jobs/current')
        const data = await res.json() as { success?: boolean; job?: GenerationJob | null }
        if (cancelled || !mountedRef.current) return

        if (data.success && data.job) {
          const job = data.job
          const isActive = job.status === 'queued' || job.status === 'running'
          const isDone = job.status === 'completed'
          const isFailed = job.status === 'failed' || job.status === 'timed_out'

          if (job.jobType === 'analysis_refresh') {
            // Analysis refresh job
            setAnalysisJob(job)
            if (isActive) {
              try { localStorage.setItem('activeAnalysisRefreshJobId', job.id) } catch {}
            }
          } else {
            // Generation/replan job
            if (isActive) {
              setActiveJob(job)
              try { localStorage.setItem('activeStudyPlanJobId', job.id) } catch {}
            } else if (isDone && job.resultPlanId) {
              setActiveJob(job)
            } else if (isFailed) {
              setActiveJob(job)
            }
          }
        }
      } catch {
        // Silent fail - will retry on next render
      } finally {
        if (!cancelled) setJobRestored(true)
      }
    }

    restoreActiveJob()
    return () => { cancelled = true }
  }, [userId, jobRestored])

  // Adaptive polling for active job
  useEffect(() => {
    if (!activeJob) return
    const isActive = activeJob.status === 'queued' || activeJob.status === 'running'
    if (!isActive) return

    let cancelled = false

    function getPollInterval(): number {
      if (!activeJob) return 4000
      const createdAt = new Date(activeJob.createdAt).getTime()
      const elapsed = Date.now() - createdAt
      if (elapsed < 60_000) return 2000    // First minute: every 2s
      if (elapsed < 300_000) return 4000   // 1-5 min: every 4s
      return 8000                           // 5+ min: every 8s
    }

    async function pollJob() {
      if (cancelled || !mountedRef.current) return
      try {
        const controller = new AbortController()
        abortRef.current?.abort()
        abortRef.current = controller

        const res = await fetch(`/api/study-plan/generation-jobs/${activeJob!.id}`, {
          signal: controller.signal
        })
        if (cancelled || !mountedRef.current) return

        const data = await res.json() as { success?: boolean; job?: GenerationJob }
        if (cancelled || !mountedRef.current || !data.success || !data.job) return

        const job = data.job
        setActiveJob((prev) => {
          if (!prev || prev.id !== job.id) return prev
          // Only update if something changed
          if (prev.status === job.status && prev.progress === job.progress && prev.currentStep === job.currentStep) {
            return prev
          }
          return job
        })

        // If job completed, trigger plan load
        if (job.status === 'completed') {
          try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
          planLoadRetriesRef.current = 0
          // Try to load plan with retries
          await loadPlanAfterCompletion(job)
          return
        }

        // If job failed/timed_out/cancelled, stop polling
        if (job.status === 'failed' || job.status === 'timed_out' || job.status === 'cancelled') {
          try { localStorage.removeItem('activeStudyPlanJobId') } catch {}
          return
        }

        // Schedule next poll
        if (!cancelled && mountedRef.current) {
          pollingRef.current = setTimeout(pollJob, getPollInterval())
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          pollingRef.current = setTimeout(pollJob, getPollInterval())
        }
      }
    }

    async function loadPlanAfterCompletion(_job: GenerationJob) {
      const maxRetries = 5
      for (let i = 0; i < maxRetries; i++) {
        if (cancelled || !mountedRef.current) return
        try {
          const planData = await fetchPlan()
          if (planData.plan) {
            if (!cancelled && mountedRef.current) {
              pushToast({ kind: 'success', title: '学习计划已生成' })
              // Clear the active job after a delay
              setTimeout(() => {
                if (mountedRef.current) setActiveJob(null)
              }, 2000)
            }
            return
          }
        } catch {}
        // Wait before retry
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      }
      // If all retries failed, just clear the job and let user refresh
      if (!cancelled && mountedRef.current) {
        setActiveJob(null)
        pushToast({ kind: 'info', title: '计划已生成', message: '请刷新页面查看' })
      }
    }

    pollingRef.current = setTimeout(pollJob, 500)

    return () => {
      cancelled = true
      if (pollingRef.current) clearTimeout(pollingRef.current)
    }
  }, [activeJob, activeJob?.id, activeJob?.status, pushToast])

  const { data: pointsData } = useSWR<AdjustmentPoints>(
    userId ? 'study-plan-points' : null,
    async () => {
      const res = await fetch('/api/study-plan/adjustment-points')
      return res.json()
    },
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  )

  const quota = data?.quota
  const adjustmentBalance = pointsData?.balance ?? 0
  const plan = data?.plan ?? null
  const profile = data?.profile ?? null

  // Check replan suggestion after analysis refresh completes
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
  }, [plan?.diagnosis])

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
          // Reload plan data to get updated analysis
          await mutate()
          pushToast({ kind: 'success', title: '学习数据已更新' })
          // Check if should suggest replan
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
  }, [analysisJob, analysisJob?.id, analysisJob?.status, mutate, pushToast])

  // Check replan suggestion after analysis refresh completes
  useEffect(() => {
    // This effect runs once on mount; actual checks are triggered by setting pendingReplanCheck
  }, [])

  const isGenerating = activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')
  const isPlanLoading = activeJob?.status === 'completed' && !plan
  const isJobFailed = activeJob && (activeJob.status === 'failed' || activeJob.status === 'timed_out')
  const isAnalysisRefreshing = analysisJob && (analysisJob.status === 'queued' || analysisJob.status === 'running')
  const analysisRefreshDone = analysisJob?.status === 'completed'

  const resolvedState: PageState = useMemo(() => {
    if (isLoading && !jobRestored) return 'loading'
    if (error && !plan && !isGenerating) return 'failed'
    if (isGenerating) return 'generating'
    if (isPlanLoading) return 'loading_plan'
    if (isJobFailed && !plan) return 'failed'
    if (plan) return 'ready'
    return 'empty'
  }, [isLoading, jobRestored, error, plan, isGenerating, isPlanLoading, isJobFailed])

  const handleGenerate = useCallback(async (formData?: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/study-plan/generation-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData ?? {})
      })
      const json = await res.json() as { success?: boolean; jobId?: string; status?: string; progress?: number; currentStep?: string; message?: string }
      if (!res.ok && res.status !== 202 && res.status !== 200) {
        pushToast({ kind: 'error', title: '创建失败', message: json.message || '请稍后重试' })
        return
      }
      if (json.jobId) {
        // If server returned an existing job (dedup), restore it
        setActiveJob({
          id: json.jobId,
          status: json.status ?? 'queued',
          progress: json.progress ?? 0,
          currentStep: json.currentStep ?? null,
          resultPlanId: null,
          errorMessage: null,
          createdAt: new Date().toISOString()
        })
        try { localStorage.setItem('activeStudyPlanJobId', json.jobId) } catch {}
      }
      setShowCreate(false)
      pushToast({ kind: 'success', title: '正在后台生成学习计划', message: '你可以离开此页面，完成后会自动通知。' })
    } catch {
      pushToast({ kind: 'error', title: '创建失败', message: '请稍后重试' })
    }
  }, [pushToast])

  const handleRetry = useCallback(async () => {
    if (!activeJob?.id) return
    try {
      await fetch(`/api/study-plan/generation-jobs/${activeJob.id}/retry`, { method: 'POST' })
      // Refresh job state
      setActiveJob((prev) => prev ? { ...prev, status: 'queued', progress: 0, errorMessage: null, errorCode: null } : prev)
      try { localStorage.setItem('activeStudyPlanJobId', activeJob.id) } catch {}
    } catch {
      pushToast({ kind: 'error', title: '重试失败' })
    }
  }, [activeJob, pushToast])

  const handleRefreshAnalysis = useCallback(async () => {
    if (isAnalysisRefreshing) {
      pushToast({ kind: 'info', title: '学习数据正在更新中' })
      return
    }
    if (isGenerating) {
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
  }, [isAnalysisRefreshing, isGenerating, pushToast])

  if (!userId) return <PageSkeleton variant="chart" />

  if (resolvedState === 'loading' && !plan) return <PageSkeleton variant="chart" />

  if (resolvedState === 'failed' && !plan && !isGenerating) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="study-plan-page">
          <StudyPlanHeader adjustmentBalance={adjustmentBalance} />
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

  if (resolvedState === 'generating' || resolvedState === 'loading_plan') {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="study-plan-page">
          <StudyPlanHeader adjustmentBalance={adjustmentBalance} />
          <GenerationProgressCard
            job={activeJob}
            isPlanLoading={resolvedState === 'loading_plan'}
            onCancel={() => setActiveJob(null)}
          />
        </section>
      </main>
    )
  }

  if (resolvedState === 'empty' || !plan) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="study-plan-page">
          <StudyPlanHeader adjustmentBalance={adjustmentBalance} />
          {isJobFailed && (
            <GlassPanel style={styles.failedBanner}>
              <MaterialIcon name="error" size={20} />
              <div style={{ flex: 1 }}>
                <p className="ui-body-md">
                  {activeJob?.status === 'timed_out' ? '上次计划生成超时' : '上次计划生成失败'}
                </p>
                {activeJob?.errorMessage && <p className="ui-label">{activeJob.errorMessage}</p>}
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

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="study-plan-page">
        <StudyPlanHeader adjustmentBalance={adjustmentBalance} />

        {isJobFailed && (
          <GlassPanel style={styles.failedBanner}>
            <MaterialIcon name="error" size={20} />
            <div style={{ flex: 1 }}>
              <p className="ui-body-md">
                {activeJob?.status === 'timed_out' ? '上次计划生成超时' : '上次计划生成失败'}
              </p>
              {activeJob?.errorMessage && <p className="ui-label">{activeJob.errorMessage}</p>}
            </div>
            <button className="ui-primary-button" type="button" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleRetry}>
              重试
            </button>
          </GlassPanel>
        )}

        <PlanOverview
          plan={plan}
          profile={profile}
          onRefreshAnalysis={handleRefreshAnalysis}
          isAnalysisRefreshing={!!isAnalysisRefreshing}
          analysisRefreshProgress={analysisJob?.progress ?? 0}
        />

        <MonthCalendar
          plan={plan}
          profile={profile}
          currentMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          onSelectTask={setSelectedTask}
        />

        <TodayTasks
          tasks={plan.tasks?.filter((t) => t.scheduledDate === getDateKeyInTimeZone() && t.status !== 'rescheduled') ?? []}
          onSelectTask={setSelectedTask}
        />

        <BottomActions
          quota={quota}
          onRegenerate={() => handleGenerate({ sourcePlanId: plan?.id })}
          onSettings={() => setShowSettings(true)}
        />

        {showSettings && profile && (
          <SettingsDialog
            profile={profile}
            plan={plan}
            onClose={() => setShowSettings(false)}
            onMutate={() => { void mutate() }}
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
                  onClick={() => {
                    setShowReplanSuggestion(null)
                    handleGenerate({ sourcePlanId: plan?.id })
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

function StudyPlanHeader({ adjustmentBalance }: { adjustmentBalance: number }) {
  return (
    <header className="page-section-header">
      <div>
        <h1 className="ui-title-display">雅思写作学习规划</h1>
        <p className="ui-body-md" style={{ marginTop: 4 }}>根据你的目标、剩余时间和真实写作表现，动态安排整个备考周期。</p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="task-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MaterialIcon name="stars" size={14} />
          调整点：{adjustmentBalance}
        </span>
      </div>
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

function GenerationProgressCard({ job, isPlanLoading, onCancel }: {
  job: GenerationJob | null
  isPlanLoading: boolean
  onCancel: () => void
}) {
  const progress = job?.progress ?? 0
  const step = job?.message ?? job?.currentStep ?? job?.stage ?? '正在准备...'
  const isFailed = job?.status === 'failed'
  const isTimedOut = job?.status === 'timed_out'
  const isRunning = job?.status === 'queued' || job?.status === 'running'

  // Heartbeat staleness check
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => setNow(Date.now()), 10000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  const heartbeatAge = job?.heartbeatAt ? Math.round((now - new Date(job.heartbeatAt).getTime()) / 1000) : null
  const isStale = heartbeatAge !== null && heartbeatAge > 180

  if (isPlanLoading) {
    return (
      <GlassPanel style={styles.progressCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
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
    )
  }

  const statusLabel = isFailed ? '生成失败'
    : isTimedOut ? '生成超时'
    : isStale ? '仍在处理中（较长任务）'
    : isRunning ? `进度：${progress}%`
    : `${job?.status ?? '未知'}`

  return (
    <GlassPanel style={styles.progressCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <MaterialIcon name={isFailed || isTimedOut ? 'error' : isStale ? 'hourglass_empty' : 'hourglass_top'} size={24} />
        <div style={{ flex: 1 }}>
          <h2 className="ui-title-md">
            {isFailed ? '生成失败' : isTimedOut ? '生成超时' : '正在生成你的雅思写作计划'}
          </h2>
          <p className="ui-body-md">
            {isFailed || isTimedOut ? (job?.errorMessage || '请稍后重试') : step}
          </p>
        </div>
        {!isFailed && !isTimedOut && (
          <button className="ui-secondary-button" type="button" onClick={onCancel} style={{ fontSize: 13, padding: '6px 12px' }}>
            取消
          </button>
        )}
      </div>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${isFailed || isTimedOut ? 100 : progress}%`, background: isFailed || isTimedOut ? 'var(--error)' : 'var(--primary)' }} />
      </div>
      <p className="ui-label" style={{ marginTop: 8 }}>{statusLabel}</p>
      {isRunning && heartbeatAge !== null && heartbeatAge > 60 && (
        <p className="ui-label" style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
          任务仍在后台运行，请耐心等待...
        </p>
      )}
      <p className="ui-label" style={{ marginTop: 4, color: 'var(--text-secondary)' }}>你可以离开此页面，完成后会自动通知。</p>
    </GlassPanel>
  )
}

function PlanOverview({ plan, profile, onRefreshAnalysis, isAnalysisRefreshing, analysisRefreshProgress }: {
  plan: StudyPlan
  profile: StudyPlanProfile | null
  onRefreshAnalysis: () => void
  isAnalysisRefreshing: boolean
  analysisRefreshProgress: number
}) {
  const today = getDateKeyInTimeZone()
  const examDays = computeExamDays(profile?.examDate ?? null)
  const tasks = plan.tasks ?? []
  const weekTasks = tasks.filter((t) => {
    const weekEnd = addDaysToDateKey(today, 6)
    return t.scheduledDate >= today && t.scheduledDate <= weekEnd && t.status !== 'rescheduled'
  })
  const completedThisWeek = weekTasks.filter((t) => t.status === 'completed').length
  const completionRate = weekTasks.length > 0 ? Math.round((completedThisWeek / weekTasks.length) * 100) : 0
  const phase = plan.currentPhase ? PlanPhaseLabels[plan.currentPhase] ?? plan.currentPhase : null

  const totalDays = plan.periodStart && plan.periodEnd
    ? Math.ceil((new Date(plan.periodEnd).getTime() - new Date(plan.periodStart).getTime()) / 86400000)
    : null
  const totalWeeks = totalDays ? Math.ceil(totalDays / 7) : null

  // Analysis snapshot data
  const snapshot = profile?.analysisSnapshot as Record<string, unknown> | undefined
  const snapshotCounts = snapshot?.counts as Record<string, number> | undefined
  const snapshotScores = snapshot?.scores as Record<string, number | null> | undefined
  const snapshotDiag = snapshot?.diagnosis as Record<string, unknown> | undefined
  const analysisUpdatedAt = profile?.analysisUpdatedAt as string | null | undefined
  const sourceRecordCount = profile?.analysisSourceRecordCount ?? 0

  // Check for new records not yet in analysis
  const latestRecordAt = profile?.analysisLatestRecordAt as string | null | undefined
  const planTasks = plan.tasks ?? []
  const completedTasks = planTasks.filter(t => t.status === 'completed' && t.writingRecordId)

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return null
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <GlassPanel style={styles.overviewCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          {sourceRecordCount > 0 && (
            <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>
              基于 {sourceRecordCount} 篇已批改作文
              {analysisUpdatedAt && ` · 上次更新：${formatTime(analysisUpdatedAt)}`}
            </p>
          )}
        </div>
        <button
          className="ui-secondary-button"
          type="button"
          onClick={onRefreshAnalysis}
          disabled={isAnalysisRefreshing}
          style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <MaterialIcon name={isAnalysisRefreshing ? 'sync' : 'refresh'} size={16} />
          {isAnalysisRefreshing ? `正在更新 ${analysisRefreshProgress}%` : '刷新学习数据'}
        </button>
      </div>

      <div style={styles.overviewGrid}>
        {snapshotCounts && (
          <>
            <OverviewItem icon="edit_note" label="已完成" value={`${snapshotCounts.total ?? 0} 篇`} />
            <OverviewItem icon="bar_chart" label="Task 1" value={`${snapshotCounts.task1 ?? 0} 篇`} />
            <OverviewItem icon="article" label="Task 2" value={`${snapshotCounts.task2 ?? 0} 篇`} />
            <OverviewItem icon="quiz" label="完整模考" value={`${snapshotCounts.fullTests ?? 0} 次`} />
          </>
        )}
        <OverviewItem icon="flag" label="目标分数" value={String(plan.goalsSnapshot?.overallTarget ?? '—')} />
        <OverviewItem icon="trending_up" label="当前预测" value={snapshotScores?.overall?.toFixed(1) ?? plan.diagnosis?.currentAverage?.toFixed(1) ?? '—'} />
        <OverviewItem icon="event" label="考试日期" value={profile?.examDate ? new Date(profile.examDate).toLocaleDateString('zh-CN') : '未设置'} />
        <OverviewItem icon="schedule" label="剩余天数" value={examDays !== null ? `${examDays} 天` : '—'} />
        {totalWeeks && <OverviewItem icon="date_range" label="计划周期" value={`${totalWeeks} 周`} />}
        {phase && <OverviewItem icon="route" label="当前阶段" value={phase} />}
        <OverviewItem icon="check_circle" label="本周完成" value={`${completedThisWeek}/${weekTasks.length} (${completionRate}%)`} />
        {(() => {
          const weakArr = snapshotDiag?.weakestCriteria
          if (Array.isArray(weakArr) && weakArr.length > 0) {
            const key = String(weakArr[0])
            return <OverviewItem icon="priority_high" label="最弱项" value={ShortCriterionLabels[key] ?? key} />
          }
          return null
        })()}
      </div>
    </GlassPanel>
  )
}

function OverviewItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={styles.overviewItem}>
      <MaterialIcon name={icon} size={18} />
      <span className="ui-label">{label}</span>
      <strong style={{ fontSize: 16 }}>{value}</strong>
    </div>
  )
}

function MonthCalendar({ plan, profile: _profile, currentMonth, onMonthChange, onSelectTask }: {
  plan: StudyPlan
  profile: StudyPlanProfile | null
  currentMonth: string
  onMonthChange: (m: string) => void
  onSelectTask: (task: StudyPlanTask) => void
}) {
  const today = getDateKeyInTimeZone()
  const tasks = plan.tasks ?? []
  const [year, month] = currentMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startPad = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1)
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(year, month, 1)
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const goToday = () => {
    const now = new Date()
    onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }

  const tasksByDate = useMemo(() => {
    const map = new Map<string, StudyPlanTask[]>()
    for (const t of tasks) {
      const arr = map.get(t.scheduledDate) ?? []
      arr.push(t)
      map.set(t.scheduledDate, arr)
    }
    return map
  }, [tasks])

  const monthLabel = `${year}年${month}月`
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <GlassPanel style={styles.calendarCard}>
      <div style={styles.calendarHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="ui-icon-button" type="button" onClick={prevMonth}>
            <MaterialIcon name="chevron_left" size={20} />
          </button>
          <h2 className="ui-title-md" style={{ minWidth: 120, textAlign: 'center' }}>{monthLabel}</h2>
          <button className="ui-icon-button" type="button" onClick={nextMonth}>
            <MaterialIcon name="chevron_right" size={20} />
          </button>
        </div>
        <button className="ui-secondary-button" type="button" onClick={goToday} style={{ fontSize: 12, padding: '4px 10px' }}>
          今天
        </button>
      </div>

      <div style={styles.calendarWeekDays}>
        {weekDays.map((d) => (
          <div key={d} style={styles.calendarWeekDay}>{d}</div>
        ))}
      </div>

      <div style={styles.calendarGrid}>
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} style={styles.calendarCellEmpty} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTasks = tasksByDate.get(dateKey) ?? []
          const isToday = dateKey === today
          const isPast = dateKey < today
          const completedCount = dayTasks.filter((t) => t.status === 'completed').length
          const totalCount = dayTasks.length

          return (
            <CalendarDay
              key={dateKey}
              day={day}
              dateKey={dateKey}
              tasks={dayTasks}
              isToday={isToday}
              isPast={isPast}
              completedCount={completedCount}
              totalCount={totalCount}
              onSelectTask={onSelectTask}
            />
          )
        })}
      </div>

      <CalendarLegend />
    </GlassPanel>
  )
}

function CalendarDay({ day, dateKey, tasks, isToday, isPast, completedCount, totalCount, onSelectTask }: {
  day: number
  dateKey: string
  tasks: StudyPlanTask[]
  isToday: boolean
  isPast: boolean
  completedCount: number
  totalCount: number
  onSelectTask: (task: StudyPlanTask) => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const totalMinutes = tasks.reduce((s, t) => s + t.estimatedMinutes, 0)
  const isRestDay = totalCount === 0 && !isPast

  const borderColor = isToday ? 'var(--primary)' : 'transparent'
  const bg = isToday ? 'var(--surface-container-low)' : 'transparent'
  const opacity = isPast && completedCount === 0 && totalCount > 0 ? 0.6 : 1

  return (
    <>
      <div
        style={{ ...styles.calendarCell, borderColor, background: bg, opacity, cursor: totalCount > 0 ? 'pointer' : 'default' }}
        onClick={() => { if (totalCount > 0) setShowDetail(true) }}
        role={totalCount > 0 ? 'button' : undefined}
        tabIndex={totalCount > 0 ? 0 : undefined}
        onKeyDown={(e) => { if (e.key === 'Enter' && totalCount > 0) setShowDetail(true) }}
      >
        <span style={{ ...styles.calendarDayNum, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--primary)' : undefined }}>
          {day}
        </span>

        <div style={styles.calendarTaskList}>
          {tasks.slice(0, 3).map((task) => {
            const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
            const shortTitle = task.title || typeLabel
            const sourceLabel = QuestionSourceLabels[task.questionSource as QuestionSource] ?? '题库'
            const isAi = task.questionSource === 'ai_generated'
            return (
              <div key={task.id} style={styles.calendarTaskLine}>
                <span style={{ ...styles.taskDot, background: getTaskColor(task.taskType, task.status === 'completed'), flexShrink: 0 }} />
                <span style={{ fontSize: 11, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.status === 'completed' ? 'var(--text-secondary)' : undefined, textDecoration: task.status === 'completed' ? 'line-through' : undefined }}>
                  {shortTitle}
                </span>
                <span style={{
                  fontSize: 8,
                  padding: '0 3px',
                  borderRadius: 3,
                  background: isAi ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--primary-container)',
                  color: isAi ? '#fff' : 'var(--on-primary-container)',
                  flexShrink: 0,
                  lineHeight: '14px',
                  fontWeight: 600
                }}>
                  {sourceLabel}
                </span>
              </div>
            )
          })}
          {totalCount > 3 && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', paddingLeft: 10 }}>+{totalCount - 3} 个任务</span>
          )}
          {isRestDay && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', opacity: 0.6 }}>休息日</span>
          )}
        </div>

        {totalCount > 0 && (
          <span style={styles.calendarMinutes}>{totalMinutes}分</span>
        )}
        {completedCount === totalCount && totalCount > 0 && (
          <MaterialIcon name="check_circle" size={12} />
        )}
      </div>

      {showDetail && (
        <CenteredDialog
          open
          title={`${dateKey} · ${totalCount} 个任务`}
          onClose={() => setShowDetail(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="ui-label">总时长：{totalMinutes} 分钟</p>
            {tasks.map((task) => (
              <TaskMiniCard key={task.id} task={task} onSelect={() => { setShowDetail(false); onSelectTask(task) }} />
            ))}
          </div>
        </CenteredDialog>
      )}
    </>
  )
}

function TaskMiniCard({ task, onSelect }: { task: StudyPlanTask; onSelect: () => void }) {
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status
  const title = task.title || typeLabel
  const sourceLabel = QuestionSourceLabels[task.questionSource as QuestionSource] ?? '题库'
  const isAi = task.questionSource === 'ai_generated'

  return (
    <div
      style={styles.taskMiniCard}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ ...styles.taskDot, background: getTaskColor(task.taskType, task.status === 'completed'), width: 8, height: 8 }} />
          <strong style={{ fontSize: 13 }}>{title}</strong>
          <span className="task-badge" style={{ fontSize: 10 }}>{typeLabel}</span>
          <span style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 4,
            background: isAi ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--primary-container)',
            color: isAi ? '#fff' : 'var(--on-primary-container)',
            fontWeight: 600
          }}>
            {sourceLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>{task.estimatedMinutes}分钟</span>
          <span>{statusLabel}</span>
        </div>
      </div>
      {task.status === 'completed' && <MaterialIcon name="check_circle" size={16} />}
    </div>
  )
}

function CalendarLegend() {
  return (
    <div style={styles.legend}>
      {[
        { label: 'Task 1', color: '#7c6cf0' },
        { label: 'Task 2', color: '#4a90d9' },
        { label: '错误复习', color: '#e8913a' },
        { label: '模考', color: '#3a6eb5' },
        { label: '已完成', color: '#34a853' }
      ].map((item) => (
        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function getTaskColor(taskType: string, completed: boolean): string {
  if (completed) return '#34a853'
  switch (taskType) {
    case 'task1': return '#7c6cf0'
    case 'task2': return '#4a90d9'
    case 'full_test': return '#3a6eb5'
    case 'error_review': return '#e8913a'
    case 'grammar_drill': case 'vocabulary_drill': return '#9c7cb0'
    case 'review': return '#6bb59a'
    default: return '#888'
  }
}

function TodayTasks({ tasks, onSelectTask }: { tasks: StudyPlanTask[]; onSelectTask: (t: StudyPlanTask) => void }) {
  if (tasks.length === 0) return null

  return (
    <GlassPanel style={styles.todayCard}>
      <h2 className="ui-title-md" style={{ marginBottom: 12 }}>今日任务</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((task) => {
          const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
          const title = task.title || typeLabel
          const writable = isWritableTaskType(task.taskType)
          const writeMode = taskTypeToWriteMode(task.taskType)

          return (
            <div key={task.id} style={styles.todayTaskRow}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ ...styles.taskDot, background: getTaskColor(task.taskType, task.status === 'completed'), width: 8, height: 8 }} />
                  <strong style={{ fontSize: 14 }}>{title}</strong>
                  <span className="task-badge" style={{ fontSize: 10 }}>{typeLabel}</span>
                </div>
                <span className="ui-label">{task.estimatedMinutes}分钟</span>
              </div>
              {task.status === 'completed' ? (
                <MaterialIcon name="check_circle" size={20} />
              ) : writable && writeMode ? (
                <Link className="ui-primary-button" href={`/write/${writeMode}?studyPlanTaskId=${task.id}`} style={{ fontSize: 12, padding: '4px 10px' }}>
                  开始
                </Link>
              ) : (
                <button className="ui-secondary-button" type="button" onClick={() => onSelectTask(task)} style={{ fontSize: 12, padding: '4px 10px' }}>
                  查看
                </button>
              )}
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

function BottomActions({ quota, onRegenerate, onSettings }: {
  quota?: StudyPlanGenerationQuota
  onRegenerate: () => void
  onSettings: () => void
}) {
  return (
    <div style={styles.bottomActions}>
      <button className="ui-secondary-button" type="button" onClick={onSettings}>
        <MaterialIcon name="tune" size={18} />
        设置
      </button>
      <button className="ui-primary-button" type="button" disabled={(quota?.remainingCount ?? 0) <= 0} onClick={onRegenerate}>
        重新规划
      </button>
      {quota && (
        <span className="ui-label">本月已规划 {quota.usedCount}/{quota.limit}</span>
      )}
    </div>
  )
}

function CreatePlanWizard({ profile, diagnosis, onGenerate, onClose }: {
  profile: StudyPlanProfile | null
  diagnosis?: StudyPlanDiagnosis
  onGenerate: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    overallTarget: profile?.overallTarget ?? 6.5,
    examDate: profile?.examDate ?? '',
    sessionsPerWeek: profile?.sessionsPerWeek ?? 4,
    minutesPerSession: profile?.minutesPerSession ?? 45,
    intensity: profile?.intensity ?? 'standard' as string,
    allowTimedPractice: profile?.allowTimedPractice ?? true,
    includeFullTests: profile?.includeFullTests ?? true,
    questionBankRatio: profile?.questionBankRatio ?? 80,
    aiGeneratedRatio: profile?.aiGeneratedRatio ?? 20
  })

  const questionSourcePresets = [
    { key: 'all_bank', label: '全部题库', bank: 100, ai: 0 },
    { key: 'bank_first', label: '题库优先', bank: 80, ai: 20 },
    { key: 'balanced', label: '均衡模式', bank: 50, ai: 50 },
    { key: 'ai_first', label: 'AI 个性化优先', bank: 20, ai: 80 },
    { key: 'all_ai', label: '全部 AI', bank: 0, ai: 100 }
  ]

  const activePreset = questionSourcePresets.find((p) => p.bank === form.questionBankRatio && p.ai === form.aiGeneratedRatio)?.key ?? 'custom'

  const handleBankRatioChange = (newBank: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newBank / 5) * 5))
    setForm({ ...form, questionBankRatio: clamped, aiGeneratedRatio: 100 - clamped })
  }

  const handlePreset = (preset: typeof questionSourcePresets[number]) => {
    setForm({ ...form, questionBankRatio: preset.bank, aiGeneratedRatio: preset.ai })
  }

  const [currentTime] = useState(() => Date.now())
  const totalQuestionTasks = useMemo(() => {
    const sessions = form.sessionsPerWeek
    const weeks = form.examDate
      ? Math.max(1, Math.ceil(Math.max(0, (new Date(form.examDate).getTime() - currentTime) / 86400000) / 7))
      : 4
    const totalStudyDays = weeks * sessions
    return Math.max(2, Math.ceil(totalStudyDays * 0.35)) + Math.max(3, Math.ceil(totalStudyDays * 0.45))
  }, [form.sessionsPerWeek, form.examDate, currentTime])

  const bankEstimate = Math.round(totalQuestionTasks * form.questionBankRatio / 100)
  const aiEstimate = totalQuestionTasks - bankEstimate

  return (
    <CenteredDialog
      open
      title="创建学习计划"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" onClick={() => onGenerate(form)}>
            后台生成
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {diagnosis?.currentAverage && (
          <div style={{ padding: 10, borderRadius: 10, background: 'var(--surface-container-low)', fontSize: 13 }}>
            根据最近作文，当前预测分数为 <strong>{diagnosis.currentAverage.toFixed(1)}</strong>
          </div>
        )}
        <FieldGroup label="目标分数">
          <OptionGrid options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))} value={form.overallTarget} onChange={(v) => setForm({ ...form, overallTarget: v as number })} />
        </FieldGroup>
        <FieldGroup label="考试日期">
          <input type="date" value={form.examDate} min={getDateKeyInTimeZone()} onChange={(e) => setForm({ ...form, examDate: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }} />
        </FieldGroup>
        <FieldGroup label="每周学习天数">
          <OptionGrid options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))} value={form.sessionsPerWeek} onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })} />
        </FieldGroup>
        <FieldGroup label="每天学习时间">
          <OptionGrid options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))} value={form.minutesPerSession} onChange={(v) => setForm({ ...form, minutesPerSession: v as number })} />
        </FieldGroup>
        <FieldGroup label="训练强度">
          <OptionGrid options={[
            { value: 'relaxed', label: '轻松', desc: '每天 1 个任务' },
            { value: 'standard', label: '标准', desc: '每天 1–2 个任务' },
            { value: 'intensive', label: '强化', desc: '每天 2–3 个任务' }
          ]} value={form.intensity} onChange={(v) => setForm({ ...form, intensity: v as string })} />
        </FieldGroup>

        <FieldGroup label="题目来源">
          <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            选择计划中的题目由现有题库抽取，还是由 AI 根据你的薄弱项生成。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {questionSourcePresets.map((preset) => (
              <button
                key={preset.key}
                className={`task-badge ${activePreset === preset.key ? 'is-custom' : ''}`}
                type="button"
                onClick={() => handlePreset(preset)}
                style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, minWidth: 70, color: 'var(--text-secondary)' }}>题库抽题</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.questionBankRatio}
                onChange={(e) => handleBankRatioChange(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.questionBankRatio}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, minWidth: 70, color: 'var(--text-secondary)' }}>AI 智能出题</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-container-low)', position: 'relative' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${form.aiGeneratedRatio}%`, borderRadius: 2, background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.aiGeneratedRatio}%</span>
            </div>
          </div>
          <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-container-low)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: 2 }}><strong>题库抽题：</strong>从平台现有正式题库中选择，题型和图表数据已经过校验。</p>
            <p><strong>AI 智能出题：</strong>根据你的薄弱项和目标分数生成新题，更个性化但生成时间可能更长。</p>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            预计 {totalQuestionTasks} 个写作任务中：{bankEstimate} 个来自题库，{aiEstimate} 个由 AI 生成。
          </p>
        </FieldGroup>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.allowTimedPractice} onChange={(e) => setForm({ ...form, allowTimedPractice: e.target.checked })} />
            <span className="ui-body-md">接受限时训练</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.includeFullTests} onChange={(e) => setForm({ ...form, includeFullTests: e.target.checked })} />
            <span className="ui-body-md">安排完整模考</span>
          </label>
        </div>
      </div>
    </CenteredDialog>
  )
}

function SettingsDialog({ profile, plan: _plan, onClose, onMutate }: {
  profile: StudyPlanProfile
  plan: StudyPlan | null
  onClose: () => void
  onMutate: () => void
}) {
  const { pushToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    overallTarget: profile.overallTarget,
    examDate: profile.examDate ?? '',
    sessionsPerWeek: profile.sessionsPerWeek,
    minutesPerSession: profile.minutesPerSession,
    intensity: profile.intensity,
    allowTimedPractice: profile.allowTimedPractice,
    includeFullTests: true,
    questionBankRatio: profile.questionBankRatio ?? 80,
    aiGeneratedRatio: profile.aiGeneratedRatio ?? 20
  })

  const questionSourcePresets = [
    { key: 'all_bank', label: '全部题库', bank: 100, ai: 0 },
    { key: 'bank_first', label: '题库优先', bank: 80, ai: 20 },
    { key: 'balanced', label: '均衡模式', bank: 50, ai: 50 },
    { key: 'ai_first', label: 'AI 个性化优先', bank: 20, ai: 80 },
    { key: 'all_ai', label: '全部 AI', bank: 0, ai: 100 }
  ]

  const activePreset = questionSourcePresets.find((p) => p.bank === form.questionBankRatio && p.ai === form.aiGeneratedRatio)?.key ?? 'custom'

  const handleBankRatioChange = (newBank: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newBank / 5) * 5))
    setForm({ ...form, questionBankRatio: clamped, aiGeneratedRatio: 100 - clamped })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/study-plan/update-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          examDate: form.examDate || null,
          questionBankRatio: form.questionBankRatio,
          aiGeneratedRatio: form.aiGeneratedRatio
        })
      })
      const data = await res.json() as { success?: boolean; message?: string }
      if (!res.ok || !data.success) {
        pushToast({ kind: 'error', title: '保存失败', message: data.message || '请稍后重试' })
        return
      }
      pushToast({ kind: 'success', title: '设置已更新' })
      onMutate()
      onClose()
    } catch {
      pushToast({ kind: 'error', title: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CenteredDialog
      open
      title="调整学习计划"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" disabled={saving} onClick={handleSave}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FieldGroup label="目标分数">
          <OptionGrid options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))} value={form.overallTarget} onChange={(v) => setForm({ ...form, overallTarget: v as number })} />
        </FieldGroup>
        <FieldGroup label="考试日期">
          <input type="date" value={form.examDate} min={getDateKeyInTimeZone()} onChange={(e) => setForm({ ...form, examDate: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }} />
        </FieldGroup>
        <FieldGroup label="每周学习天数">
          <OptionGrid options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))} value={form.sessionsPerWeek} onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })} />
        </FieldGroup>
        <FieldGroup label="每天学习时间">
          <OptionGrid options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))} value={form.minutesPerSession} onChange={(v) => setForm({ ...form, minutesPerSession: v as number })} />
        </FieldGroup>
        <FieldGroup label="训练强度">
          <OptionGrid options={[
            { value: 'relaxed', label: '轻松' },
            { value: 'standard', label: '标准' },
            { value: 'intensive', label: '强化' }
          ]} value={form.intensity} onChange={(v) => setForm({ ...form, intensity: v as 'relaxed' | 'standard' | 'intensive' })} />
        </FieldGroup>

        <FieldGroup label="题目来源比例">
          <p className="ui-body-md" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            修改后，仅未来未开始且未锁定的任务会按新比例重新分配题目。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {questionSourcePresets.map((preset) => (
              <button
                key={preset.key}
                className={`task-badge ${activePreset === preset.key ? 'is-custom' : ''}`}
                type="button"
                onClick={() => setForm({ ...form, questionBankRatio: preset.bank, aiGeneratedRatio: preset.ai })}
                style={{ cursor: 'pointer', padding: '5px 12px', fontSize: 12 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>题库</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.questionBankRatio}
              onChange={(e) => handleBankRatioChange(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--primary)' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.questionBankRatio}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, minWidth: 50, color: 'var(--text-secondary)' }}>AI</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-container-low)' }}>
              <div style={{ height: '100%', width: `${form.aiGeneratedRatio}%`, borderRadius: 2, background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{form.aiGeneratedRatio}%</span>
          </div>
        </FieldGroup>
      </div>
    </CenteredDialog>
  )
}

function TaskDetailDialog({ task, onClose, onMutate }: {
  task: StudyPlanTask
  onClose: () => void
  onMutate: () => void
}) {
  const { pushToast } = useToast()
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status
  const title = task.title || typeLabel
  const writable = isWritableTaskType(task.taskType)
  const writeMode = taskTypeToWriteMode(task.taskType)
  const sourceLabel = task.questionSource === 'ai_generated' ? 'AI 个性化生成' : '平台题库'
  const isAi = task.questionSource === 'ai_generated'

  const handleSkip = async () => {
    try {
      await fetch(`/api/study-plan/tasks/${task.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'other' })
      })
      pushToast({ kind: 'info', title: '已跳过' })
      onMutate()
      onClose()
    } catch { /* ignore */ }
  }

  return (
    <CenteredDialog
      open
      title={title}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {task.status !== 'completed' && (
            <button className="ui-secondary-button" type="button" onClick={handleSkip}>跳过</button>
          )}
          {task.status === 'completed' && task.writingRecordId && (
            <Link className="ui-primary-button" href={`/result?id=${task.writingRecordId}`}>查看结果</Link>
          )}
          {task.status !== 'completed' && writable && writeMode && (
            <Link className="ui-primary-button" href={`/write/${writeMode}?studyPlanTaskId=${task.id}`}>开始写作</Link>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="task-badge">{typeLabel}</span>
          <span className="task-badge">{statusLabel}</span>
          <span className="task-badge">{task.estimatedMinutes}分钟</span>
          {task.difficulty && <span className="task-badge">{task.difficulty}</span>}
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 6,
            background: isAi ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--primary-container)',
            color: isAi ? '#fff' : 'var(--on-primary-container)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <MaterialIcon name={isAi ? 'auto_awesome' : 'menu_book'} size={12} />
            {sourceLabel}
          </span>
        </div>
        {task.description && <p className="ui-body-md">{task.description}</p>}
        {task.generatedReason && (
          <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>原因：{task.generatedReason}</p>
        )}
        {task.focusCriteria.length > 0 && (
          <div>
            <span className="ui-label">重点：</span>
            <span className="ui-body-md">{task.focusCriteria.map((c) => ShortCriterionLabels[c] ?? c).join('、')}</span>
          </div>
        )}
        {isAi && task.fallbackReason && (
          <p className="ui-label" style={{ color: 'var(--text-secondary)' }}>
            备注：AI 生成失败，已自动切换为题库题目
          </p>
        )}
      </div>
    </CenteredDialog>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="ui-label" style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </div>
  )
}

function OptionGrid({ options, value, onChange }: {
  options: Array<{ value: unknown; label: string; desc?: string }>
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`task-badge ${value === opt.value ? 'is-custom' : ''}`}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{ cursor: 'pointer', padding: '6px 14px' }}
          title={opt.desc}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  emptyCard: {
    textAlign: 'center',
    padding: '48px 24px',
    borderRadius: 28
  },
  progressCard: {
    padding: 24,
    borderRadius: 28,
    background: 'linear-gradient(135deg, var(--surface-container-high), var(--surface-container))'
  },
  failedBanner: {
    padding: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20
  },
  overviewCard: {
    padding: 20,
    borderRadius: 24
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 12
  },
  overviewItem: {
    padding: '10px 12px',
    borderRadius: 14,
    background: 'var(--surface-container-low)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  calendarCard: {
    padding: 20,
    borderRadius: 24
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  calendarWeekDays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
    marginBottom: 4
  },
  calendarWeekDay: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-secondary)',
    padding: '4px 0',
    fontWeight: 600
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4
  },
  calendarCellEmpty: {
    borderRadius: 16,
    minHeight: 130
  },
  calendarCell: {
    borderRadius: 16,
    border: '2px solid transparent',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'border-color 0.15s, background 0.15s',
    minHeight: 130,
    overflow: 'hidden'
  },
  calendarDayNum: {
    fontSize: 13,
    lineHeight: 1,
    fontWeight: 400
  },
  calendarTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
    overflow: 'hidden'
  },
  calendarTaskLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 0
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    display: 'inline-block',
    flexShrink: 0
  },
  calendarMinutes: {
    fontSize: 10,
    color: 'var(--text-secondary)',
    lineHeight: 1,
    marginTop: 'auto'
  },
  legend: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--glass-border-1)'
  },
  todayCard: {
    padding: 20,
    borderRadius: 24
  },
  todayTaskRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: 14,
    background: 'var(--surface-container-low)',
    gap: 8
  },
  taskMiniCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 12,
    background: 'var(--surface-container-low)',
    cursor: 'pointer'
  },
  bottomActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap'
  }
}
