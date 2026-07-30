'use client'

import { useMemo, useState } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import type { StudyPlan, StudyPlanTask, StudyPlanTaskType } from '@/lib/study-plan-types'
import { StudyPlanTaskTypeLabels, StudyPlanTaskStatusLabels, isWritableTaskType } from '@/lib/study-plan-types'
import { QuestionSourceLabels, StudyPlanTaskSourceLabels } from '@/lib/study-plan-types'
import type { QuestionSource } from '@/lib/study-plan-types'
import { styles } from './styles'

function taskSourceLabel(task: StudyPlanTask) {
  if (isWritableTaskType(task.taskType)) {
    return QuestionSourceLabels[task.questionSource as QuestionSource] ?? '题库'
  }
  return StudyPlanTaskSourceLabels[task.source] ?? '学习活动'
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
    default: return '#7c6cf0'
  }
}

export function MonthCalendar({ plan, currentMonth, onMonthChange, onSelectTask }: {
  plan: StudyPlan
  currentMonth: string
  onMonthChange: (m: string) => void
  onSelectTask: (task: StudyPlanTask) => void
}) {
  const today = getDateKeyInTimeZone()
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
    const tasks = plan.tasks ?? []
    const map = new Map<string, StudyPlanTask[]>()
    for (const t of tasks) {
      const arr = map.get(t.scheduledDate) ?? []
      arr.push(t)
      map.set(t.scheduledDate, arr)
    }
    return map
  }, [plan])

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
            const sourceLabel = taskSourceLabel(task)
            const isAi = task.questionSource === 'ai_generated'
            return (
              <div key={task.id} style={{ ...styles.calendarTaskLine, alignItems: 'flex-start' }}>
                <span style={{ ...styles.taskDot, background: getTaskColor(task.taskType, task.status === 'completed'), flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 550, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', color: task.status === 'completed' ? 'var(--text-secondary)' : undefined, textDecoration: task.status === 'completed' ? 'line-through' : undefined }}>
                    {shortTitle}
                  </span>
                  <span style={{
                    fontSize: 10,
                    padding: '0 4px',
                    borderRadius: 3,
                    background: isAi ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--primary-container)',
                    color: isAi ? '#fff' : 'var(--on-primary-container)',
                    alignSelf: 'flex-start',
                    lineHeight: '16px',
                    fontWeight: 600
                  }}>
                    {sourceLabel}
                  </span>
                </div>
              </div>
            )
          })}
          {totalCount > 3 && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 10 }}>+{totalCount - 3} 个任务</span>
          )}
          {isRestDay && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.6 }}>休息日</span>
          )}
        </div>

        {totalCount > 0 && (
          <span style={styles.calendarMinutes}>{totalMinutes} 分钟</span>
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
  const sourceLabel = taskSourceLabel(task)
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
        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
