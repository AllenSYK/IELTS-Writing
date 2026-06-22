'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useToast } from '@/components/interaction-system'
import { PageSkeleton } from '@/components/loading/PageSkeleton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import type {
  StudyPlan,
  StudyPlanProfile,
  StudyPlanGenerationQuota,
  StudyPlanTask,
  StudyPlanTaskType
} from '@/lib/study-plan-types'
import {
  StudyPlanTaskTypeLabels,
  StudyPlanTaskStatusLabels,
  ErrorTagLabels
} from '@/lib/study-plan-types'

type PlanData = {
  success?: boolean
  plan: StudyPlan | null
  profile: StudyPlanProfile | null
  quota: StudyPlanGenerationQuota
}

async function fetchPlan(): Promise<PlanData> {
  const res = await fetch('/api/study-plan')
  return res.json()
}

export default function StudyPlanPage() {
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const { data, mutate, isLoading } = useSWR(userId ? 'study-plan' : null, fetchPlan, { revalidateOnFocus: false })
  const [generating, setGenerating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/study-plan/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json() as { success?: boolean; code?: string; message?: string }
      if (!res.ok || !json.success) {
        pushToast({ kind: 'error', title: '规划失败', message: json.message || '请稍后重试。' })
        return
      }
      pushToast({ kind: 'success', title: '学习规划已生成' })
      void mutate()
    } catch {
      pushToast({ kind: 'error', title: '规划失败', message: '请稍后重试。' })
    } finally {
      setGenerating(false)
    }
  }

  if (!userId || isLoading) return <PageSkeleton />

  const plan = data?.plan ?? null
  const profile = data?.profile ?? null
  const quota = data?.quota

  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = plan?.tasks?.filter((t) => t.scheduledDate === today) ?? []
  const weekTasks = plan?.tasks?.filter((t) => {
    const d = new Date(t.scheduledDate)
    const now = new Date(today)
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return d >= now && d <= end
  }) ?? []
  const completedThisWeek = weekTasks.filter((t) => t.status === 'completed').length

  return (
    <main className="ui-page" data-main-content tabIndex={-1}>
      <section className="analytics-main" style={{ paddingTop: 40 }}>
        <header className="page-section-header">
          <h1 className="ui-title-display">学习规划</h1>
        </header>

        {!plan ? (
          <EmptyPlan
            quota={quota}
            generating={generating}
            onGenerate={handleGenerate}
          />
        ) : (
          <>
            <PlanOverview
              plan={plan}
              profile={profile}
              quota={quota}
              completedThisWeek={completedThisWeek}
              weekTaskCount={weekTasks.length}
            />

            {todayTasks.length > 0 && (
              <GlassPanel className="ui-hover-glow">
                <h2 className="ui-title-md" style={{ marginBottom: 16 }}>今日学习任务</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {todayTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </GlassPanel>
            )}

            <GlassPanel className="ui-hover-glow">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 className="ui-title-md">本周计划</h2>
                <span className="ui-label">{completedThisWeek} / {weekTasks.length} 已完成</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weekTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
                {weekTasks.length === 0 && <p className="ui-body-md">本周暂无安排。</p>}
              </div>
            </GlassPanel>

            {plan.diagnosis?.priorityErrorTags && plan.diagnosis.priorityErrorTags.length > 0 && (
              <GlassPanel className="ui-hover-glow">
                <h2 className="ui-title-md" style={{ marginBottom: 16 }}>薄弱项分析</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {plan.diagnosis.priorityErrorTags.slice(0, 6).map((tag) => (
                    <div key={tag.tag} style={{ padding: 12, borderRadius: 10, background: 'var(--surface-container-low)' }}>
                      <span className="ui-label">{ErrorTagLabels[tag.tag] ?? tag.tag}</span>
                      <p className="ui-body-md">出现 {tag.frequency} 次</p>
                      <span className={`task-badge ${tag.priority === 'high' ? 'is-custom' : ''}`}>
                        {tag.priority === 'high' ? '高优先' : tag.priority === 'medium' ? '中优先' : '低优先'}
                      </span>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="ui-primary-button"
                type="button"
                disabled={generating || (quota?.remainingCount ?? 0) <= 0}
                onClick={handleGenerate}
              >
                {generating ? '正在生成…' : '重新规划'}
              </button>
              <button className="ui-secondary-button" type="button" onClick={() => setShowSettings((v) => !v)}>
                <MaterialIcon name="settings" size={18} />
                规划设置
              </button>
            </div>

            {quota && (
              <p className="ui-label" style={{ marginTop: 8 }}>
                本月已规划 {quota.usedCount} / {quota.limit} 次
                {quota.remainingCount <= 0 ? '，本月重新规划次数已用完，下个月将自动恢复。' : `，还可重新规划 ${quota.remainingCount} 次`}
              </p>
            )}

            {showSettings && <StudyPlanSettings profile={profile} onSaved={() => void mutate()} />}
          </>
        )}
      </section>
    </main>
  )
}

function EmptyPlan({ quota, generating, onGenerate }: { quota?: StudyPlanGenerationQuota; generating: boolean; onGenerate: () => void }) {
  return (
    <GlassPanel level={2} className="empty-state" style={{ textAlign: 'center', padding: 48 }}>
      <MaterialIcon name="school" size={48} />
      <h2 className="ui-title-headline" style={{ marginTop: 16 }}>创建你的专属学习规划</h2>
      <p className="ui-body-md" style={{ maxWidth: 400, margin: '8px auto' }}>
        根据真实批改记录、目标分和可用时间，生成每日学习安排。
      </p>
      <button
        className="ui-primary-button"
        type="button"
        disabled={generating || (quota?.remainingCount ?? 0) <= 0}
        onClick={onGenerate}
        style={{ marginTop: 16 }}
      >
        {generating ? '正在分析…' : '创建学习规划'}
      </button>
      {quota && quota.remainingCount <= 0 && (
        <p className="ui-label" style={{ marginTop: 8, color: 'var(--error)' }}>
          本月重新规划次数已用完，下个月将自动恢复。
        </p>
      )}
    </GlassPanel>
  )
}

function PlanOverview({ plan, profile, quota, completedThisWeek, weekTaskCount }: {
  plan: StudyPlan; profile: StudyPlanProfile | null; quota?: StudyPlanGenerationQuota;
  completedThisWeek: number; weekTaskCount: number
}) {
  const examDays = profile?.examDate ? Math.max(0, Math.ceil((new Date(profile.examDate).getTime() - new Date(new Date().toDateString()).getTime()) / (86400000))) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      <MetricCard icon="flag" label="目标分" value={String(plan.goalsSnapshot?.overallTarget ?? '—')} />
      <MetricCard icon="trending_up" label="当前平均分" value={plan.diagnosis?.currentAverage?.toFixed(1) ?? '—'} />
      <MetricCard icon="event" label="距离考试" value={examDays !== null ? `${examDays} 天` : '—'} />
      <MetricCard icon="repeat" label="每周计划" value={`${plan.preferencesSnapshot?.sessionsPerWeek ?? '—'} 次`} />
      <MetricCard icon="check_circle" label="本周完成" value={`${completedThisWeek} / ${weekTaskCount}`} />
      <MetricCard icon="event_repeat" label="本月还可规划" value={`${quota?.remainingCount ?? '—'} 次`} />
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

function TaskCard({ task }: { task: StudyPlanTask }) {
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, background: 'var(--surface-container-low)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="task-badge">{typeLabel}</span>
          <span className="ui-label">{task.estimatedMinutes} 分钟</span>
        </div>
        {task.focusCriteria.length > 0 && (
          <p className="ui-body-md">重点：{task.focusCriteria.join('、')}</p>
        )}
        {task.focusErrorTags.length > 0 && (
          <p className="ui-label">{task.focusErrorTags.map((t) => ErrorTagLabels[t] ?? t).join('、')}</p>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`task-badge ${task.status === 'completed' ? 'is-custom' : ''}`}>{statusLabel}</span>
        {task.status === 'pending' && task.taskType !== 'grammar_drill' && task.taskType !== 'vocabulary_drill' && (
          <Link className="ui-primary-button" href={`/write/${task.taskType === 'full_test' ? 'mock' : task.taskType}`} style={{ fontSize: 13, padding: '6px 12px' }}>
            开始练习
          </Link>
        )}
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: StudyPlanTask }) {
  const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
  const statusLabel = StudyPlanTaskStatusLabels[task.status] ?? task.status

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: task.status === 'completed' ? 'var(--surface-container)' : 'var(--surface-container-low)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ui-label" style={{ minWidth: 60 }}>{task.scheduledDate.slice(5)}</span>
        <span className="task-badge">{typeLabel}</span>
        <span className="ui-body-md">{task.focusCriteria.slice(0, 2).join('、')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="ui-label">{task.estimatedMinutes}分钟</span>
        <span className={`task-badge ${task.status === 'completed' ? 'is-custom' : ''}`}>{statusLabel}</span>
      </div>
    </div>
  )
}

function StudyPlanSettings({ profile, onSaved }: { profile: StudyPlanProfile | null; onSaved: () => void }) {
  const { pushToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    overallTarget: profile?.overallTarget ?? 6.5,
    task1Target: profile?.task1Target ?? 6.0,
    task2Target: profile?.task2Target ?? 6.5,
    examDate: profile?.examDate ?? '',
    sessionsPerWeek: profile?.sessionsPerWeek ?? 4,
    minutesPerSession: profile?.minutesPerSession ?? 45,
    includeFullTests: profile?.includeFullTests ?? true,
    includePastPapers: profile?.includePastPapers ?? true
  })

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/study-plan/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          examDate: form.examDate || null
        })
      })
      if (!res.ok) throw new Error('Save failed')
      pushToast({ kind: 'success', title: '设置已保存' })
      onSaved()
    } catch {
      pushToast({ kind: 'error', title: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassPanel style={{ padding: 24 }}>
      <h2 className="ui-title-md" style={{ marginBottom: 16 }}>规划设置</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <label className="field">
          <span>目标总分</span>
          <select value={form.overallTarget} onChange={(e) => setForm({ ...form, overallTarget: Number(e.target.value) })}>
            {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Task 1 目标分</span>
          <select value={form.task1Target} onChange={(e) => setForm({ ...form, task1Target: Number(e.target.value) })}>
            {[5, 5.5, 6, 6.5, 7, 7.5, 8].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Task 2 目标分</span>
          <select value={form.task2Target} onChange={(e) => setForm({ ...form, task2Target: Number(e.target.value) })}>
            {[5, 5.5, 6, 6.5, 7, 7.5, 8].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>预计考试日期</span>
          <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
        </label>
        <label className="field">
          <span>每周学习天数</span>
          <select value={form.sessionsPerWeek} onChange={(e) => setForm({ ...form, sessionsPerWeek: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6, 7].map((v) => <option key={v} value={v}>每周 {v} 天</option>)}
          </select>
        </label>
        <label className="field">
          <span>每次学习时长</span>
          <select value={form.minutesPerSession} onChange={(e) => setForm({ ...form, minutesPerSession: Number(e.target.value) })}>
            {[20, 30, 45, 60, 90, 120].map((v) => <option key={v} value={v}>每天 {v} 分钟</option>)}
          </select>
        </label>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.includeFullTests} onChange={(e) => setForm({ ...form, includeFullTests: e.target.checked })} />
          <span>包含完整测试</span>
        </label>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.includePastPapers} onChange={(e) => setForm({ ...form, includePastPapers: e.target.checked })} />
          <span>优先使用真题</span>
        </label>
      </div>
      <div style={{ marginTop: 16 }}>
        <button className="ui-primary-button" type="button" disabled={saving} onClick={handleSave}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </GlassPanel>
  )
}
