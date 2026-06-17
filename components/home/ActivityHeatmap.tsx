'use client'

import { useMemo } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
import { activityTooltip, buildActivityHeatmap } from '@/lib/activity-heatmap'
import type { WritingRecord } from '@/lib/writing-records'

export function ActivityHeatmap({ records }: { records: WritingRecord[] }) {
  const data = useMemo(() => buildActivityHeatmap(records, 12), [records])

  return (
    <GlassPanel className="activity-panel">
      <header className="activity-header">
        <div>
          <h2 className="stitch-title-md">学习活动</h2>
          <p className="stitch-body-md">过去一年共完成 {data.total} 次写作与练习</p>
        </div>
        <span className="activity-icon">
          <MaterialIcon name="calendar_month" size={20} />
        </span>
      </header>

      <div className="activity-scroll" aria-label="过去一年学习活动热力图">
        <div className="activity-months" style={{ gridTemplateColumns: `repeat(${data.weekCount}, 12px)` }}>
          {data.monthLabels.map((month) => (
            <span key={`${month.label}-${month.weekIndex}`} style={{ gridColumnStart: month.weekIndex }}>
              {month.label}
            </span>
          ))}
        </div>

        <div className="activity-body">
          <div className="activity-weekdays" aria-hidden="true">
            <span>日</span>
            <span />
            <span>二</span>
            <span />
            <span>四</span>
            <span />
            <span>六</span>
          </div>
          <div className="activity-grid" style={{ gridTemplateColumns: `repeat(${data.weekCount}, 12px)` }}>
            {data.days.map((day) => {
              const tooltip = activityTooltip(day)
              return (
                <span
                  key={day.date}
                  className={`activity-day level-${day.level} ${day.inRange ? '' : 'is-outside'}`}
                  aria-label={tooltip}
                  data-tooltip={tooltip}
                  title={tooltip}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div className="activity-footer">
        {data.total === 0 ? <span className="stitch-label">暂无学习活动，完成练习后这里会自动点亮。</span> : <span />}
        <div className="activity-legend" aria-label="活动强度图例">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`level-${level}`} />
          ))}
          <span>多</span>
        </div>
      </div>
    </GlassPanel>
  )
}
