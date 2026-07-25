'use client'

import type { CSSProperties } from 'react'
import { MaterialIcon } from '@/components/app-ui'
import { buildGoalStatus } from '@/lib/learning-analytics'
import { formatBandNumber } from '@/lib/ielts-scoring'
import type { UserProfile } from '@/lib/user-profile'
import type { WritingRecord } from '@/lib/writing-records'

export function GoalStatusPanel({
  records,
  profile,
  currentAverageOverride,
  compact = false
}: {
  records: WritingRecord[]
  profile: UserProfile
  currentAverageOverride?: number | null
  compact?: boolean
}) {
  const status = buildGoalStatus(records, profile, { currentAverageOverride })
  const hasData = status.currentAverage !== null

  return (
    <section className={`goal-status-panel ${compact ? 'is-compact' : ''}`} aria-label="目标状态">
      <div className="goal-status-header">
        <div>
          <span className="ui-label">目标状态</span>
          <h2 className="ui-title-md">目标分达成度 {status.progressPercent}%</h2>
        </div>
        <span className="goal-progress-ring" style={{ '--goal-progress': `${status.progressPercent}%` } as CSSProperties}>
          <strong>{formatBandNumber(status.targetOverall)}</strong>
        </span>
      </div>

      {hasData ? (
        <>
          <div className="goal-progress-track" aria-hidden="true">
            <span style={{ width: `${status.progressPercent}%` }} />
          </div>
          <dl className="goal-status-grid">
            <div>
              <dt>当前平均分</dt>
              <dd>
                {formatBandNumber(status.currentAverage)}
                {currentAverageOverride !== null && currentAverageOverride !== undefined ? <small className="manual-score-mark">已调整</small> : null}
              </dd>
            </div>
            <div>
              <dt>目标分</dt>
              <dd>{formatBandNumber(status.targetOverall)}</dd>
            </div>
            <div>
              <dt>距离目标</dt>
              <dd>{formatBandNumber(status.distance)}</dd>
            </div>
            <div>
              <dt>最近成绩</dt>
              <dd>{formatBandNumber(status.recentScore)}</dd>
            </div>
            <div>
              <dt>Task 1平均分</dt>
              <dd>{formatBandNumber(status.task1Average)}</dd>
            </div>
            <div>
              <dt>Task 2平均分</dt>
              <dd>{formatBandNumber(status.task2Average)}</dd>
            </div>
            <div>
              <dt>本周完成</dt>
              <dd>{status.weeklyCompleted} / {status.weeklyTarget}篇</dd>
            </div>
          </dl>
          <div className="goal-focus-box">
            <MaterialIcon name="target" size={18} />
            <span>
              {status.focusDimensions.length > 0
                ? `预计还需要提高：${status.focusDimensions.join('、')}`
                : '当前四项表现接近目标，请继续保持稳定练习。'}
            </span>
          </div>
        </>
      ) : (
        <div className="goal-empty-state">
          <MaterialIcon name="insights" size={22} />
          <p>完成一次真实批改后，这里会显示当前平均分、距离目标和本周完成情况。</p>
        </div>
      )}
    </section>
  )
}
