'use client'

import useSWR from 'swr'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { WritingActivityDay } from '@/lib/writing-activity'

type ActivityRange = 365 | 183 | 30

type HeatmapCell = WritingActivityDay & {
  level: 0 | 1 | 2 | 3 | 4
}

const rangeOptions: Array<{ days: ActivityRange; label: string }> = [
  { days: 365, label: '一年' },
  { days: 183, label: '半年' },
  { days: 30, label: '一个月' }
]

function intensityLevel(count: number): HeatmapCell['level'] {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function mondayIndex(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()
  return day === 0 ? 6 : day - 1
}

function formatTooltip(dateKey: string, count: number) {
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${dateKey}T00:00:00.000Z`))
  return `${date}：${count} 次写作批改`
}

function buildWeeks(activity: WritingActivityDay[]) {
  if (activity.length === 0) return [] as Array<Array<HeatmapCell | null>>
  const padded: Array<HeatmapCell | null> = [
    ...Array.from({ length: mondayIndex(activity[0].date) }, () => null),
    ...activity.map((day) => ({ ...day, level: intensityLevel(day.count) }))
  ]
  while (padded.length % 7 !== 0) padded.push(null)
  return Array.from({ length: padded.length / 7 }, (_, index) => padded.slice(index * 7, index * 7 + 7))
}

function monthLabels(weeks: Array<Array<HeatmapCell | null>>) {
  let previousMonth = ''
  return weeks.map((week) => {
    const firstDay = week.find(Boolean)
    if (!firstDay) return { key: `empty-${previousMonth}`, label: '' }
    const month = firstDay.date.slice(0, 7)
    const label = month === previousMonth
      ? ''
      : new Intl.DateTimeFormat('zh-CN', { month: 'short', timeZone: 'UTC' }).format(
          new Date(`${firstDay.date}T00:00:00.000Z`)
        )
    previousMonth = month
    return { key: firstDay.date, label }
  })
}

async function fetchActivity(days: ActivityRange) {
  const response = await fetch(`/api/user/writing-activity?days=${days}`, {
    cache: 'no-store'
  })
  const data = await response.json() as {
    success?: boolean
    activity?: WritingActivityDay[]
    message?: string
  }
  if (!response.ok || !data.success || !data.activity) {
    throw new Error(data.message || '写作活动加载失败')
  }
  return data.activity
}

function HeatmapSkeleton() {
  return (
    <div className="activity-skeleton" aria-label="写作热力图加载中">
      <div className="activity-skeleton-grid">
        {Array.from({ length: 98 }, (_, index) => <span key={`activity-skeleton-${index}`} />)}
      </div>
    </div>
  )
}

export function WritingActivityHeatmap({ userId }: { userId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<ActivityRange>(365)
  const { data: activity, isLoading } = useSWR(
    ['writing-activity', userId, range],
    () => fetchActivity(range),
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
      dedupingInterval: 30_000
    }
  )
  const days = activity ?? []
  const weeks = buildWeeks(days)
  const labels = monthLabels(weeks)
  const total = days.reduce((sum, day) => sum + day.count, 0)
  const activeDays = days.filter((day) => day.count > 0).length
  const chartStyle = { '--activity-week-count': weeks.length } as CSSProperties
  const latestDate = days.at(-1)?.date || ''

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
  }, [latestDate, range, weeks.length])

  return (
    <section className="dashboard-panel activity-panel" aria-labelledby="writing-activity-title">
      <header className="activity-panel-header">
        <div>
          <p className="ui-label">写作活动</p>
          <h2 id="writing-activity-title">写作热力图</h2>
        </div>
        <div className="activity-header-actions">
          <div className="activity-range-control" role="group" aria-label="热力图时间范围">
            {rangeOptions.map((option) => (
              <button
                key={option.days}
                type="button"
                className={range === option.days ? 'is-active' : ''}
                aria-pressed={range === option.days}
                onClick={() => setRange(option.days)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <strong>{total} 次</strong>
        </div>
      </header>

      {isLoading ? (
        <HeatmapSkeleton />
      ) : (
        <div
          ref={scrollRef}
          className="activity-scroll"
          tabIndex={0}
          role="img"
          aria-label={`最近 ${range} 天共完成 ${total} 次写作批改，活跃 ${activeDays} 天，最新日期位于最右侧`}
        >
          <div className="activity-chart" style={chartStyle} aria-hidden="true">
            <div className="activity-months" aria-hidden="true">
              {labels.map((label) => (
                <span key={label.key}>{label.label}</span>
              ))}
            </div>
            <div className="activity-body">
              <div className="activity-weekdays" aria-hidden="true">
                <span>一</span>
                <span />
                <span>三</span>
                <span />
                <span>五</span>
                <span />
                <span>日</span>
              </div>
              <div className="activity-weeks">
                {weeks.map((week, weekIndex) => {
                  const weekKey = week.find(Boolean)?.date || `empty-week-${weekIndex}`
                  return (
                    <div className="activity-week" key={weekKey}>
                      {week.map((day, dayIndex) => (
                        day ? (
                          <span
                            className={`activity-cell level-${day.level}`}
                            key={day.date}
                            title={formatTooltip(day.date, day.count)}
                          />
                        ) : <span className="activity-cell is-placeholder" key={`${weekKey}-empty-${dayIndex}`} />
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="activity-legend">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => <i className={`activity-cell level-${level}`} key={level} />)}
        <span>多</span>
      </footer>
    </section>
  )
}
