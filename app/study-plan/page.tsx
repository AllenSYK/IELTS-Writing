'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast, ConfirmDialog } from '@/components/interaction-system'
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
  AICoachingSuggestion
} from '@/lib/study-plan-types'
import {
  StudyPlanTaskTypeLabels,
  StudyPlanTaskStatusLabels,
  PlanPhaseLabels,
  ErrorTagLabels,
  SkipReasonLabels,
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
  const [generating, setGenerating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<StudyPlanTask | null>(null)

  const handleGenerate = useCallback(async (formData?: Record<string, unknown>) => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/study-plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData ?? {})
      })
      const json = await res.json() as { success?: boolean; code?: string; message?: string }
      if (!res.ok || !json.success) {
        pushToast({ kind: 'error', title: '规划失败', message: json.message || '请稍后重试。' })
        return
      }
      pushToast({ kind: 'success', title: '学习规划已生成' })
      setShowCreate(false)
      void mutate()
    } catch {
      pushToast({ kind: 'error', title: '规划失败', message: '请稍后重试。' })
    } finally {
      setGenerating(false)
    }
  }, [generating, pushToast, mutate])

  if (!userId || isLoading) return <PageSkeleton variant="chart" />

  if (error) {
    return (
      <main className="ui-page" data-main-content tabIndex={-1}>
        <section className="analytics-main" style={{ paddingTop: 40 }}>
          <header className="page-section-header">
            <h1 className="ui-title-display">学习规划</h1>
          </header>
          <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
            <MaterialIcon name="error" size={48} />
            <h2 className="ui-title-headline" style={{ marginTop: 16 }}>加载失败</h2>
            <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
              {error.status === 401 ? '请重新登录后再试。' : '学习规划加载失败，请稍后重试。'}
            </p>
            <button className="ui-primary-button" type="button" style={{ marginTop: 16 }} onClick={() => void mutate()}>
              重新加载
            </button>
          </GlassPanel>
        </section>
      </main>
    )
  }

  const plan = data?.plan ?? null
  const profile = data?.profile ?? null
  const quota = data?.quota

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="analytics-main" style={{ paddingTop: 40 }}>
        <header className="page-section-header">
          <div>
            <h1 className="ui-title-display">雅思写作学习规划</h1>
            <p className="ui-body-md" style={{ marginTop: 4 }}>根据你的目标和真实写作表现，动态调整每日任务。</p>
          </div>
          {plan && (
            <button className="ui-secondary-button" type="button" onClick={() => setShowCreate(true)}>
              <MaterialIcon name="tune" size={18} />
              调整计划
            </button>
          )}
        </header>

        {!plan ? (
          <EmptyPlan
            quota={quota}
            generating={generating}
            onGenerate={() => setShowCreate(true)}
          />
        ) : (
          <PlanContent
            plan={plan}
            profile={profile}
            quota={quota}
            onRegenerate={() => handleGenerate()}
            generating={generating}
            onSelectTask={setSelectedTask}
          />
        )}

        {showCreate && (
          <CreatePlanWizard
            profile={profile}
            diagnosis={plan?.diagnosis}
            generating={generating}
            onGenerate={handleGenerate}
            onClose={() => setShowCreate(false)}
          />
        )}

        {selectedTask && (
          <TaskDetailDialog
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onMutate={() => void mutate()}
          />
        )}
      </section>
    </main>
  )
}

function EmptyPlan({ quota, generating, onGenerate }: {
  quota?: StudyPlanGenerationQuota
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
      <MaterialIcon name="school" size={48} />
      <h2 className="ui-title-headline" style={{ marginTop: 16 }}>创建你的雅思写作学习计划</h2>
      <p className="ui-body-md" style={{ maxWidth: 440, margin: '8px auto' }}>
        根据你的目标分数、考试日期和真实写作表现，自动生成每日学习任务并动态调整。
      </p>
      <button
        className="ui-primary-button"
        type="button"
        disabled={generating}
        onClick={onGenerate}
        style={{ marginTop: 16 }}
      >
        {generating ? '正在分析…' : '创建学习计划'}
      </button>
      {quota && quota.remainingCount <= 0 && (
        <p className="ui-label" style={{ marginTop: 8, color: 'var(--error)' }}>
          本月重新规划次数已用完，下个月将自动恢复。
        </p>
      )}
    </GlassPanel>
  )
}

function PlanContent({ plan, profile, quota, onRegenerate, generating, onSelectTask }: {
  plan: StudyPlan
  profile: StudyPlanProfile | null
  quota?: StudyPlanGenerationQuota
  onRegenerate: () => void
  generating: boolean
  onSelectTask: (task: StudyPlanTask) => void
}) {
  const today = getDateKeyInTimeZone()
  const todayTasks = plan.tasks?.filter((t) => t.scheduledDate === today && t.status !== 'rescheduled') ?? []
  const weekTasks = plan.tasks?.filter((t) => {
    const weekEnd = addDaysToDateKey(today, 6)
    return t.scheduledDate >= today && t.scheduledDate <= weekEnd && t.status !== 'rescheduled'
  }) ?? []
  const completedThisWeek = weekTasks.filter((t) => t.status === 'completed').length
  const examDays = computeExamDays(profile?.examDate ?? null)

  const diagnosis = plan.diagnosis
  const suggestions = useMemo(() => buildCoachingSuggestions(diagnosis), [diagnosis])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <OverviewCards plan={plan} examDays={examDays} completedThisWeek={completedThisWeek} weekTaskCount={weekTasks.length} />

      {diagnosis.profileConfidence === 'low' && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--surface-container)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MaterialIcon name="info" size={18} />
          <span className="ui-body-md">当前能力画像基于有限数据，完成更多作文后会自动更新。</span>
        </div>
      )}

      <TodayTasks tasks={todayTasks} onSelectTask={onSelectTask} />

      <WeeklyView tasks={plan.tasks ?? []} today={today} onSelectTask={onSelectTask} />

      <AbilityProfile diagnosis={diagnosis} />

      {suggestions.length > 0 && <AICoaching suggestions={suggestions} />}

      <WeeklyReviewSection />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          className="ui-primary-button"
          type="button"
          disabled={generating || (quota?.remainingCount ?? 0) <= 0}
          onClick={onRegenerate}
        >
          {generating ? '正在生成…' : '重新规划'}
        </button>
        {quota && (
          <span className="ui-label" style={{ alignSelf: 'center' }}>
            本月已规划 {quota.usedCount} / {quota.limit} 次
          </span>
        )}
      </div>
    </div>
  )
}

function OverviewCards({ plan, examDays, completedThisWeek, weekTaskCount }: {
  plan: StudyPlan
  examDays: number | null
  completedThisWeek: number
  weekTaskCount: number
}) {
  const goalBand = plan.goalsSnapshot?.overallTarget ?? '—'
  const currentBand = plan.diagnosis?.currentAverage?.toFixed(1) ?? '—'
  const completionRate = weekTaskCount > 0 ? Math.round((completedThisWeek / weekTaskCount) * 100) : 0
  const phase = plan.currentPhase ? PlanPhaseLabels[plan.currentPhase] ?? plan.currentPhase : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
      <MetricCard icon="flag" label="目标分数" value={String(goalBand)} />
      <MetricCard icon="trending_up" label="当前预测" value={currentBand} />
      <MetricCard icon="event" label="距离考试" value={examDays !== null ? `${examDays} 天` : '—'} />
      <MetricCard icon="check_circle" label="本周完成" value={`${completedThisWeek}/${weekTaskCount} (${completionRate}%)`} />
      {phase && <MetricCard icon="route" label="当前阶段" value={phase} />}
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <GlassPanel className="ui-hover-glow" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <MaterialIcon name={icon} size={18} className="text-primary" />
        <span className="ui-label">{label}</span>
      </div>
      <strong style={{ fontSize: 18 }}>{value}</strong>
    </GlassPanel>
  )
}

function TodayTasks({ tasks, onSelectTask }: { tasks: StudyPlanTask[]; onSelectTask: (t: StudyPlanTask) => void }) {
  if (tasks.length === 0) {
    return (
      <GlassPanel className="ui-hover-glow">
        <h2 className="ui-title-md" style={{ marginBottom: 12 }}>今日任务</h2>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <MaterialIcon name="free_cancellation" size={40} />
          <p className="ui-body-md" style={{ marginTop: 8 }}>今天没有安排任务，可以休息或开始额外练习。</p>
          <Link className="ui-secondary-button" href="/practice" style={{ marginTop: 12, display: 'inline-flex' }}>
            开始额外练习
          </Link>
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="ui-hover-glow">
      <h2 className="ui-title-md" style={{ marginBottom: 16 }}>今日任务</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onSelect={() => onSelectTask(task)} />
        ))}
      </div>
    </GlassPanel>
  )
}

function TaskCard({ task, onSelect }: { task: StudyPlanTask; onSelect: () => void }) {
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status
  const writable = isWritableTaskType(task.taskType)
  const writeMode = taskTypeToWriteMode(task.taskType)
  const title = task.title || typeLabel

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 16, borderRadius: 12, background: 'var(--surface-container-low)',
        cursor: 'pointer', gap: 12, flexWrap: 'wrap'
      }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className="task-badge">{typeLabel}</span>
          {task.difficulty && (
            <span className={`task-badge ${task.difficulty === 'hard' ? 'is-custom' : ''}`}>
              {task.difficulty === 'easy' ? '简单' : task.difficulty === 'hard' ? '困难' : '中等'}
            </span>
          )}
          <span className="ui-label">{task.estimatedMinutes} 分钟</span>
        </div>
        <p className="ui-body-md" style={{ fontWeight: 500 }}>{title}</p>
        {task.description && <p className="ui-body-md" style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{task.description}</p>}
        {task.generatedReason && <p className="ui-label" style={{ marginTop: 4 }}>{task.generatedReason}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`task-badge ${task.status === 'completed' ? 'is-custom' : task.status === 'skipped' ? '' : ''}`}>{statusLabel}</span>
        {task.status === 'pending' && writable && writeMode && (
          <Link
            className="ui-primary-button"
            href={`/write/${writeMode}?studyPlanTaskId=${task.id}`}
            style={{ fontSize: 13, padding: '6px 12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            开始任务
          </Link>
        )}
        {task.status === 'in_progress' && writable && writeMode && (
          <Link
            className="ui-primary-button"
            href={`/write/${writeMode}?studyPlanTaskId=${task.id}`}
            style={{ fontSize: 13, padding: '6px 12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            继续任务
          </Link>
        )}
        {task.status === 'completed' && task.writingRecordId && (
          <Link
            className="ui-secondary-button"
            href={`/result?id=${task.writingRecordId}`}
            style={{ fontSize: 13, padding: '6px 12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            查看结果
          </Link>
        )}
      </div>
    </div>
  )
}

function WeeklyView({ tasks, today, onSelectTask }: { tasks: StudyPlanTask[]; today: string; onSelectTask: (t: StudyPlanTask) => void }) {
  const days = useMemo(() => {
    const result: Array<{ date: string; label: string; tasks: StudyPlanTask[] }> = []
    const dayNames = ['日', '一', '二', '三', '四', '五', '六']
    for (let i = 0; i < 7; i++) {
      const date = addDaysToDateKey(today, i)
      const d = new Date(date + 'T00:00:00Z')
      const dayTasks = tasks.filter((t) => t.scheduledDate === date && t.status !== 'rescheduled')
      const isToday = i === 0
      result.push({
        date,
        label: isToday ? '今天' : `周${dayNames[d.getUTCDay()]}`,
        tasks: dayTasks
      })
    }
    return result
  }, [tasks, today])

  return (
    <GlassPanel className="ui-hover-glow">
      <h2 className="ui-title-md" style={{ marginBottom: 16 }}>本周计划</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        {days.map((day) => {
          const completed = day.tasks.filter((t) => t.status === 'completed').length
          const total = day.tasks.length
          const totalMinutes = day.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)

          return (
            <div
              key={day.date}
              style={{
                padding: 12, borderRadius: 12,
                background: day.date === today ? 'var(--surface-container-high)' : 'var(--surface-container-low)',
                border: day.date === today ? '1.5px solid var(--primary)' : '1px solid transparent',
                minHeight: 100
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{day.label}</strong>
                {total > 0 && <span className="ui-label">{completed}/{total}</span>}
              </div>
              {total > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {day.tasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      style={{
                        fontSize: 12, padding: '3px 6px', borderRadius: 6,
                        background: task.status === 'completed' ? 'var(--surface-container)' : 'var(--surface-variant)',
                        cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}
                      onClick={() => onSelectTask(task)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSelectTask(task) }}
                    >
                      {(task.title || StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType]) ?? task.taskType}
                    </div>
                  ))}
                  {day.tasks.length > 3 && <span className="ui-label">+{day.tasks.length - 3} 更多</span>}
                  <span className="ui-label" style={{ marginTop: 4 }}>{totalMinutes} 分钟</span>
                </div>
              ) : (
                <p className="ui-label" style={{ opacity: 0.6 }}>休息</p>
              )}
            </div>
          )
        })}
      </div>
    </GlassPanel>
  )
}

function AbilityProfile({ diagnosis }: { diagnosis: StudyPlanDiagnosis }) {
  const criteria = [
    { key: 'taTr', label: 'TA/TR', value: diagnosis.taTr },
    { key: 'cc', label: 'CC', value: diagnosis.cc },
    { key: 'lr', label: 'LR', value: diagnosis.lr },
    { key: 'gra', label: 'GRA', value: diagnosis.gra }
  ]

  return (
    <GlassPanel className="ui-hover-glow">
      <h2 className="ui-title-md" style={{ marginBottom: 16 }}>能力画像</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {criteria.map((c) => (
          <div key={c.key} style={{ padding: 12, borderRadius: 10, background: 'var(--surface-container-low)' }}>
            <span className="ui-label">{c.label}</span>
            <div style={{ marginTop: 4 }}>
              {c.value !== null ? (
                <div>
                  <strong style={{ fontSize: 20 }}>{c.value?.toFixed(1)}</strong>
                  <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--surface-variant)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${((c.value ?? 0) / 9) * 100}%`, borderRadius: 2, background: 'var(--primary)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              ) : (
                <span className="ui-body-md" style={{ opacity: 0.5 }}>—</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {diagnosis.weakestCriteria.length > 0 && (
          <div>
            <span className="ui-label">最弱项：</span>
            <span className="ui-body-md">{diagnosis.weakestCriteria.join('、')}</span>
          </div>
        )}
        {diagnosis.strongestCriteria.length > 0 && (
          <div>
            <span className="ui-label">最强项：</span>
            <span className="ui-body-md">{diagnosis.strongestCriteria.join('、')}</span>
          </div>
        )}
        <div>
          <span className="ui-label">数据可信度：</span>
          <span className="ui-body-md">{diagnosis.profileConfidence === 'high' ? '高' : diagnosis.profileConfidence === 'medium' ? '中' : '低'}</span>
        </div>
      </div>
    </GlassPanel>
  )
}

function AICoaching({ suggestions }: { suggestions: AICoachingSuggestion[] }) {
  return (
    <GlassPanel className="ui-hover-glow">
      <h2 className="ui-title-md" style={{ marginBottom: 12 }}>AI 教练建议</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {suggestions.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <MaterialIcon name={s.icon} size={18} className="text-primary" />
            <div>
              <p className="ui-body-md" style={{ fontWeight: 500 }}>{s.title}</p>
              <p className="ui-body-md" style={{ fontSize: 13, opacity: 0.8 }}>{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function buildCoachingSuggestions(diagnosis: StudyPlanDiagnosis): AICoachingSuggestion[] {
  const suggestions: AICoachingSuggestion[] = []

  if (diagnosis.weakestCriteria.length > 0) {
    const weak = diagnosis.weakestCriteria[0]
    const label = ShortCriterionLabels[weak] ?? weak
    suggestions.push({
      icon: 'priority_high',
      title: `${label} 是你目前最需要提升的评分项`,
      detail: `本周已安排针对性训练，帮助你在这项上取得进步。`
    })
  }

  const highErrors = diagnosis.priorityErrorTags.filter((t) => t.priority === 'high')
  if (highErrors.length > 0) {
    const tagLabel = ErrorTagLabels[highErrors[0].tag] ?? highErrors[0].tag
    suggestions.push({
      icon: 'spellcheck',
      title: `「${tagLabel}」是你最近最常见的问题`,
      detail: '建议在写作时特别留意这一点，完成后回顾批改标注。'
    })
  }

  if (diagnosis.task1Average !== null && diagnosis.task2Average !== null) {
    const diff = diagnosis.task2Average - diagnosis.task1Average
    if (diff > 0.5) {
      suggestions.push({
        icon: 'bar_chart',
        title: 'Task 1 分数低于 Task 2',
        detail: '本周已增加 Task 1 训练比例，重点提升数据描述和概述能力。'
      })
    } else if (diff < -0.5) {
      suggestions.push({
        icon: 'edit_note',
        title: 'Task 2 分数低于 Task 1',
        detail: '本周已增加 Task 2 训练比例，重点提升论证和结构。'
      })
    }
  }

  return suggestions.slice(0, 3)
}

function TaskDetailDialog({ task, onClose, onMutate }: {
  task: StudyPlanTask
  onClose: () => void
  onMutate: () => void
}) {
  const { pushToast } = useToast()
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const writable = isWritableTaskType(task.taskType)
  const writeMode = taskTypeToWriteMode(task.taskType)
  const title = task.title || typeLabel

  async function handleAction(action: string, body?: Record<string, unknown>) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/study-plan/tasks/${task.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {})
      })
      if (!res.ok) throw new Error('Action failed')
      pushToast({ kind: 'success', title: '操作成功' })
      onMutate()
      onClose()
    } catch {
      pushToast({ kind: 'error', title: '操作失败' })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <CenteredDialog
        open
        title={title}
        onClose={onClose}
        footer={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {task.status === 'pending' && (
              <>
                <button className="ui-secondary-button" type="button" disabled={actionLoading} onClick={() => setShowReplace(true)}>
                  更换任务
                </button>
                <button className="ui-secondary-button" type="button" disabled={actionLoading} onClick={() => setShowReschedule(true)}>
                  延期
                </button>
                <button className="ui-secondary-button" type="button" disabled={actionLoading} onClick={() => setShowSkipConfirm(true)}>
                  跳过
                </button>
              </>
            )}
            {(task.status === 'pending' || task.status === 'in_progress') && writable && writeMode && (
              <Link className="ui-primary-button" href={`/write/${writeMode}?studyPlanTaskId=${task.id}`} onClick={onClose}>
                {task.status === 'pending' ? '开始任务' : '继续任务'}
              </Link>
            )}
            {task.status === 'completed' && task.writingRecordId && (
              <Link className="ui-primary-button" href={`/result?id=${task.writingRecordId}`} onClick={onClose}>
                查看结果
              </Link>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="task-badge">{typeLabel}</span>
            {task.difficulty && (
              <span className="task-badge">{task.difficulty === 'easy' ? '简单' : task.difficulty === 'hard' ? '困难' : '中等'}</span>
            )}
            <span className="ui-label">{task.estimatedMinutes} 分钟</span>
            <span className={`task-badge ${task.status === 'completed' ? 'is-custom' : ''}`}>
              {StudyPlanTaskStatusLabels[task.status]}
            </span>
          </div>
          {task.description && <p className="ui-body-md">{task.description}</p>}
          {task.generatedReason && (
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
              <span className="ui-label">安排原因：</span>
              <p className="ui-body-md">{task.generatedReason}</p>
            </div>
          )}
          {task.focusCriteria.length > 0 && (
            <div>
              <span className="ui-label">重点评分项：</span>
              <span className="ui-body-md">{task.focusCriteria.join('、')}</span>
            </div>
          )}
          {task.focusErrorTags.length > 0 && (
            <div>
              <span className="ui-label">关注错误：</span>
              <span className="ui-body-md">{task.focusErrorTags.map((t) => ErrorTagLabels[t] ?? t).join('、')}</span>
            </div>
          )}
          {task.completedAt && (
            <div>
              <span className="ui-label">完成时间：</span>
              <span className="ui-body-md">{new Date(task.completedAt).toLocaleString('zh-CN')}</span>
            </div>
          )}
          {task.skipReason && (
            <div>
              <span className="ui-label">跳过原因：</span>
              <span className="ui-body-md">{SkipReasonLabels[task.skipReason] ?? task.skipReason}</span>
            </div>
          )}
        </div>
      </CenteredDialog>

      <ConfirmDialog
        open={showSkipConfirm}
        title="跳过这个任务？"
        message="跳过不会影响你的学习进度。"
        confirmLabel="确认跳过"
        cancelLabel="取消"
        onCancel={() => setShowSkipConfirm(false)}
        onConfirm={() => { setShowSkipConfirm(false); void handleAction('skip', { reason: 'other' }) }}
      />

      {showReschedule && (
        <RescheduleDialog
          task={task}
          onClose={() => setShowReschedule(false)}
          onConfirm={(date) => { setShowReschedule(false); void handleAction('reschedule', { newDate: date }) }}
        />
      )}

      {showReplace && (
        <ReplaceDialog
          task={task}
          onClose={() => setShowReplace(false)}
          onConfirm={(data) => { setShowReplace(false); void handleAction('replace', data) }}
        />
      )}
    </>
  )
}

function RescheduleDialog({ task, onClose, onConfirm }: {
  task: StudyPlanTask
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const today = getDateKeyInTimeZone()
  const [selectedDate, setSelectedDate] = useState(addDaysToDateKey(today, 1))

  const presets = [
    { label: '明天', date: addDaysToDateKey(today, 1) },
    { label: '后天', date: addDaysToDateKey(today, 2) },
    { label: '本周末', date: addDaysToDateKey(today, (6 - new Date(today + 'T00:00:00Z').getUTCDay() + 7) % 7 || 7) }
  ]

  return (
    <CenteredDialog
      open
      title="延期任务"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" onClick={() => onConfirm(selectedDate)}>确认延期</button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="ui-body-md">将「{task.title || StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType]}」延期到：</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button
              key={p.date}
              className={`task-badge ${selectedDate === p.date ? 'is-custom' : ''}`}
              type="button"
              onClick={() => setSelectedDate(p.date)}
              style={{ cursor: 'pointer' }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={selectedDate}
          min={today}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)' }}
        />
      </div>
    </CenteredDialog>
  )
}

function ReplaceDialog({ task, onClose, onConfirm }: {
  task: StudyPlanTask
  onClose: () => void
  onConfirm: (data: { newTaskType: string; newTitle: string; newDescription: string }) => void
}) {
  const alternatives = useMemo(() => getAlternatives(task.taskType), [task.taskType])
  const [selected, setSelected] = useState(0)

  return (
    <CenteredDialog
      open
      title="更换任务"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button className="ui-primary-button" type="button" onClick={() => onConfirm(alternatives[selected])}>确认更换</button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="ui-body-md">选择一个替代任务：</p>
        {alternatives.map((alt, i) => (
          <div
            key={i}
            style={{
              padding: 12, borderRadius: 10, cursor: 'pointer',
              background: selected === i ? 'var(--surface-container-high)' : 'var(--surface-container-low)',
              border: selected === i ? '1.5px solid var(--primary)' : '1px solid transparent'
            }}
            onClick={() => setSelected(i)}
            role="radio"
            aria-checked={selected === i}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelected(i) }}
          >
            <strong>{alt.newTitle}</strong>
            <p className="ui-body-md" style={{ fontSize: 13, marginTop: 2 }}>{alt.newDescription}</p>
          </div>
        ))}
      </div>
    </CenteredDialog>
  )
}

function getAlternatives(taskType: StudyPlanTaskType) {
  const map: Record<string, Array<{ newTaskType: string; newTitle: string; newDescription: string }>> = {
    task2: [
      { newTaskType: 'task2', newTitle: 'Task 2 提纲训练', newDescription: '只写提纲和论点，不写全文，训练审题和结构规划。' },
      { newTaskType: 'task2', newTitle: 'Task 2 主体段训练', newDescription: '只写两个主体段，专注论证展开和衔接。' },
      { newTaskType: 'error_review', newTitle: '错误复盘', newDescription: '回顾最近作文中的重复错误，总结改进方法。' }
    ],
    task1: [
      { newTaskType: 'task1', newTitle: 'Task 1 数据选择训练', newDescription: '只练习选取关键数据和写 Overview。' },
      { newTaskType: 'task1', newTitle: 'Task 1 比较训练', newDescription: '只练习数据比较和对比句型。' },
      { newTaskType: 'error_review', newTitle: '错误复盘', newDescription: '回顾 Task 1 常见错误。' }
    ],
    full_test: [
      { newTaskType: 'task2', newTitle: 'Task 2 完整写作', newDescription: '只完成一篇 Task 2，不进行完整模考。' },
      { newTaskType: 'timed_practice', newTitle: '限时训练', newDescription: '在限定时间内完成一篇写作。' }
    ]
  }
  return map[taskType] ?? [
    { newTaskType: 'error_review', newTitle: '错误复盘', newDescription: '回顾最近作文中的重复错误。' },
    { newTaskType: 'review', newTitle: '复习回顾', newDescription: '复习之前的学习内容。' }
  ]
}

type WeeklyReviewData = {
  weekStart: string
  weekEnd: string
  completionRate: number
  totalTasks: number
  completedTasks: number
  skippedTasks: number
  averageBand: number | null
  task1Band: number | null
  task2Band: number | null
  summary: string
}

function WeeklyReviewSection() {
  const { data, isLoading } = useSWR<{ review: WeeklyReviewData | null }>(
    'study-plan-review',
    async () => {
      const res = await fetch('/api/study-plan/review')
      if (!res.ok) return { review: null }
      return res.json()
    },
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  )

  if (isLoading || !data?.review) return null

  const review = data.review

  return (
    <GlassPanel className="ui-hover-glow">
      <h2 className="ui-title-md" style={{ marginBottom: 12 }}>本周复盘</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
          <span className="ui-label">完成率</span>
          <strong style={{ display: 'block', fontSize: 18 }}>{review.completionRate}%</strong>
        </div>
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
          <span className="ui-label">完成任务</span>
          <strong style={{ display: 'block', fontSize: 18 }}>{review.completedTasks}/{review.totalTasks}</strong>
        </div>
        {review.averageBand !== null && (
          <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
            <span className="ui-label">平均分</span>
            <strong style={{ display: 'block', fontSize: 18 }}>{review.averageBand.toFixed(1)}</strong>
          </div>
        )}
        {review.task1Band !== null && (
          <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
            <span className="ui-label">Task 1</span>
            <strong style={{ display: 'block', fontSize: 18 }}>{review.task1Band.toFixed(1)}</strong>
          </div>
        )}
        {review.task2Band !== null && (
          <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-container-low)' }}>
            <span className="ui-label">Task 2</span>
            <strong style={{ display: 'block', fontSize: 18 }}>{review.task2Band.toFixed(1)}</strong>
          </div>
        )}
      </div>
      <p className="ui-body-md">{review.summary}</p>
    </GlassPanel>
  )
}

function CreatePlanWizard({ profile, diagnosis, generating, onGenerate, onClose }: {
  profile: StudyPlanProfile | null
  diagnosis?: StudyPlanDiagnosis
  generating: boolean
  onGenerate: (data: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    overallTarget: profile?.overallTarget ?? 6.5,
    task1Target: profile?.task1Target ?? 6.0,
    task2Target: profile?.task2Target ?? 6.5,
    examDate: profile?.examDate ?? '',
    sessionsPerWeek: profile?.sessionsPerWeek ?? 4,
    minutesPerSession: profile?.minutesPerSession ?? 45,
    intensity: profile?.intensity ?? 'standard' as string,
    allowTimedPractice: profile?.allowTimedPractice ?? true,
    includeFullTests: profile?.includeFullTests ?? true,
    currentLevel: diagnosis?.currentAverage ?? profile?.currentLevel ?? null
  })

  const examDays = computeExamDays(form.examDate || null)

  return (
    <CenteredDialog
      open
      title="创建你的雅思写作学习计划"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onClose}>取消</button>
          <button
            className="ui-primary-button"
            type="button"
            disabled={generating}
            onClick={() => onGenerate(form)}
          >
            {generating ? '正在生成…' : '生成我的学习计划'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {diagnosis?.currentAverage && (
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-container-low)' }}>
            <span className="ui-label">根据你最近的作文记录，你当前预测写作分数为 </span>
            <strong>{diagnosis.currentAverage.toFixed(1)}</strong>
          </div>
        )}

        <FieldGroup label="目标写作分数">
          <OptionGrid
            options={[5.5, 6, 6.5, 7, 7.5, 8].map((v) => ({ value: v, label: String(v) }))}
            value={form.overallTarget}
            onChange={(v) => setForm({ ...form, overallTarget: v as number })}
          />
        </FieldGroup>

        <FieldGroup label="当前写作水平">
          {diagnosis?.currentAverage ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ui-body-md">预测 {diagnosis.currentAverage.toFixed(1)}</span>
              <button
                className="ui-secondary-button"
                type="button"
                style={{ fontSize: 12, padding: '4px 8px' }}
                onClick={() => setForm({ ...form, currentLevel: diagnosis.currentAverage })}
              >
                使用预测值
              </button>
            </div>
          ) : null}
          <OptionGrid
            options={[null, 5, 5.5, 6, 6.5, 7].map((v) => ({ value: v, label: v === null ? '不确定' : String(v) }))}
            value={form.currentLevel}
            onChange={(v) => setForm({ ...form, currentLevel: v as number | null })}
          />
        </FieldGroup>

        <FieldGroup label="考试日期">
          <input
            type="date"
            value={form.examDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm({ ...form, examDate: e.target.value })}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 200 }}
          />
          {examDays !== null && examDays <= 7 && (
            <p className="ui-label" style={{ color: 'var(--error)' }}>冲刺计划：距离考试仅 {examDays} 天</p>
          )}
          {examDays !== null && examDays > 180 && (
            <p className="ui-label">长期计划：距离考试 {examDays} 天</p>
          )}
        </FieldGroup>

        <FieldGroup label="每周学习天数">
          <OptionGrid
            options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} 天` }))}
            value={form.sessionsPerWeek}
            onChange={(v) => setForm({ ...form, sessionsPerWeek: v as number })}
          />
        </FieldGroup>

        <FieldGroup label="每天学习时间">
          <OptionGrid
            options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v} 分钟` }))}
            value={form.minutesPerSession}
            onChange={(v) => setForm({ ...form, minutesPerSession: v as number })}
          />
        </FieldGroup>

        <FieldGroup label="训练偏好">
          <OptionGrid
            options={[
              { value: 'relaxed', label: '轻松计划', desc: '每天 1 个主要任务' },
              { value: 'standard', label: '标准计划', desc: '每天 1–2 个任务' },
              { value: 'intensive', label: '强化计划', desc: '每天 2–3 个任务' }
            ]}
            value={form.intensity}
            onChange={(v) => setForm({ ...form, intensity: v as string })}
          />
        </FieldGroup>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.allowTimedPractice} onChange={(e) => setForm({ ...form, allowTimedPractice: e.target.checked })} />
            <span className="ui-body-md">接受限时写作</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.includeFullTests} onChange={(e) => setForm({ ...form, includeFullTests: e.target.checked })} />
            <span className="ui-body-md">每周安排完整模考</span>
          </label>
        </div>
      </div>
    </CenteredDialog>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="ui-label" style={{ display: 'block', marginBottom: 8 }}>{label}</span>
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
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
