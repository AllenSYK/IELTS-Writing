'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ActivityHeatmap } from '@/components/home/ActivityHeatmap'
import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
import {
  averageScore,
  formatBand,
  loadWritingRecords,
  type WritingRecord,
  type WritingTaskType
} from '@/lib/writing-records'

type TaskCardProps = {
  taskType: Exclude<WritingTaskType, 'mock'>
  title: string
  description: string
  icon: string
  latestScore: string | null
}

type MetricCardProps = {
  title: string
  description: string
  value: string
  icon: string
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function latestTaskScore(records: WritingRecord[], taskType: Exclude<WritingTaskType, 'mock'>) {
  const record = records.find((item) => item.taskType === taskType || Boolean(item.components?.[taskType]))
  if (!record) return null
  const evaluation = record.taskType === taskType ? record.evaluation : record.components?.[taskType]?.evaluation
  return evaluation ? formatBand(evaluation.overallBand || evaluation.bandEstimate) : null
}

function weeklyCount(records: WritingRecord[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return records.filter((record) => new Date(record.submittedAt).getTime() >= cutoff).length
}

function activityStreak(records: WritingRecord[]) {
  const dates = new Set(records.map((record) => dateKey(record.submittedAt)).filter(Boolean))
  if (dates.size === 0) return 0
  const latest = [...dates].sort().at(-1)
  if (!latest) return 0

  let streak = 0
  let cursor = new Date(`${latest}T00:00:00`)
  while (dates.has(dateKey(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }
  return streak
}

function TaskEntryCard({ taskType, title, description, icon, latestScore }: TaskCardProps) {
  return (
    <GlassPanel className="task-entry-card stitch-hover-glow">
      <span className="task-entry-icon">
        <MaterialIcon name={icon} size={24} />
      </span>
      <div className="task-entry-copy">
        <h2 className="stitch-title-md">{title}</h2>
        <p className="stitch-body-md">{description}</p>
        <span className="task-entry-score">最近成绩：{latestScore ?? '—'}</span>
      </div>
      <Link className="stitch-primary-button task-entry-action" href={`/write/${taskType}`}>
        开始练习
      </Link>
    </GlassPanel>
  )
}

function MetricCard({ title, description, value, icon }: MetricCardProps) {
  return (
    <GlassPanel level={2} className="home-metric-card stitch-hover-glow">
      <span className="home-metric-icon">
        <MaterialIcon name={icon} size={20} />
      </span>
      <div>
        <h3 className="stitch-title-md">{title}</h3>
        <p className="stitch-body-md">{description}</p>
      </div>
      <strong>{value}</strong>
    </GlassPanel>
  )
}

export default function HomePage() {
  const [records, setRecords] = useState<WritingRecord[]>([])

  useEffect(() => {
    window.queueMicrotask(() => setRecords(loadWritingRecords()))
  }, [])

  const average = useMemo(() => averageScore(records), [records])
  const task1Latest = useMemo(() => latestTaskScore(records, 'task1'), [records])
  const task2Latest = useMemo(() => latestTaskScore(records, 'task2'), [records])
  const weekTotal = useMemo(() => weeklyCount(records), [records])
  const streak = useMemo(() => activityStreak(records), [records])

  const metrics: MetricCardProps[] = [
    { title: '已完成作文', description: '本机真实批改记录', value: records.length ? String(records.length) : '—', icon: 'fact_check' },
    { title: '当前平均分', description: '按真实记录计算', value: average === null ? '—' : average.toFixed(1), icon: 'query_stats' },
    { title: '本周练习次数', description: '最近 7 天完成记录', value: weekTotal ? String(weekTotal) : '—', icon: 'calendar_view_week' },
    { title: '连续学习天数', description: '按最近活动日期计算', value: streak ? String(streak) : '—', icon: 'local_fire_department' }
  ]

  return (
    <main className="stitch-page" data-main-content tabIndex={-1}>
      <section className="stitch-container home-main">
        <header className="home-hero">
          <div>
            <h1 className="stitch-title-display">IELTS Writing</h1>
            <p className="stitch-body-lg">选择题型，开始一次真实写作练习。</p>
          </div>
          <Link className="stitch-primary-button home-cta" href="/practice">
            <MaterialIcon name="edit_note" size={18} />
            开始写作
          </Link>
        </header>

        <section className="home-task-grid" aria-label="IELTS Writing 入口">
          <TaskEntryCard
            taskType="task1"
            title="Task 1"
            description="图表 / 地图 / 流程图写作"
            icon="bar_chart"
            latestScore={task1Latest}
          />
          <TaskEntryCard
            taskType="task2"
            title="Task 2"
            description="议论文写作"
            icon="history_edu"
            latestScore={task2Latest}
          />
        </section>

        <section className="home-metric-grid" aria-label="学习概览">
          {metrics.map((metric) => (
            <MetricCard key={metric.title} {...metric} />
          ))}
        </section>

        <ActivityHeatmap records={records} />
      </section>
    </main>
  )
}
