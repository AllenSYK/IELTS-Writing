'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { MaterialIcon } from '@/components/app-ui'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import type { StudyPlanTask, StudyPlanTaskType } from '@/lib/study-plan-types'
import { StudyPlanTaskTypeLabels, isWritableTaskType, taskTypeToWriteMode } from '@/lib/study-plan-types'

type DashboardPlanData = {
  plan: { tasks?: StudyPlanTask[] } | null
}

async function fetchPlanSummary(): Promise<DashboardPlanData> {
  const res = await fetch('/api/study-plan')
  if (!res.ok) return { plan: null }
  const data = await res.json() as { plan?: { tasks?: StudyPlanTask[] } | null }
  return { plan: data.plan ?? null }
}

export function DashboardLearningTasks() {
  const { data, isLoading } = useSWR('dashboard-study-plan', fetchPlanSummary, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  })

  if (isLoading || !data?.plan?.tasks) return null

  const today = getDateKeyInTimeZone()
  const todayTasks = data.plan.tasks.filter((t) => t.scheduledDate === today && t.status !== 'rescheduled')
  const pendingTasks = todayTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress')
  const completedCount = todayTasks.filter((t) => t.status === 'completed').length

  if (todayTasks.length === 0) return null

  return (
    <section className="dashboard-panel dashboard-license-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MaterialIcon name="school" size={20} />
          今日学习任务
        </h2>
        <Link className="ui-label" href="/study-plan" style={{ color: 'var(--primary)' }}>
          查看全部
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pendingTasks.slice(0, 3).map((task) => {
          const typeLabel = StudyPlanTaskTypeLabels[task.taskType as StudyPlanTaskType] ?? task.taskType
          const writable = isWritableTaskType(task.taskType)
          const writeMode = taskTypeToWriteMode(task.taskType)
          const title = task.title || typeLabel

          return (
            <div
              key={task.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 10, background: 'var(--surface-container-low)',
                gap: 8, flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <span className="task-badge" style={{ fontSize: 11 }}>{typeLabel}</span>
                <span className="ui-body-md" style={{ fontSize: 14 }}>{title}</span>
                <span className="ui-label">{task.estimatedMinutes}分钟</span>
              </div>
              {writable && writeMode && (
                <Link
                  className="ui-primary-button"
                  href={`/write/${writeMode}`}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  开始
                </Link>
              )}
            </div>
          )
        })}
        {pendingTasks.length > 3 && (
          <Link className="ui-label" href="/study-plan" style={{ textAlign: 'center', color: 'var(--primary)' }}>
            还有 {pendingTasks.length - 3} 个任务
          </Link>
        )}
        {completedCount > 0 && (
          <p className="ui-label" style={{ textAlign: 'center' }}>
            今日已完成 {completedCount} / {todayTasks.length} 个任务
          </p>
        )}
      </div>
    </section>
  )
}
