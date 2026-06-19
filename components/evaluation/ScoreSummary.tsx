'use client'

import { GlassPanel } from '@/components/app-ui'
import {
  formatBand,
  type CriterionKey,
  type EssayEvaluation,
  type WritingRecord
} from '@/lib/writing-records'

type CriterionSummary = {
  key: CriterionKey
  shortLabel: string
  label: string
  score: string
  feedback?: string
}

export function ScoreSummary({
  record,
  evaluation,
  criteria
}: {
  record: WritingRecord
  evaluation: EssayEvaluation
  criteria: CriterionSummary[]
}) {
  const overall = formatBand(evaluation.overallBand || evaluation.bandEstimate)

  return (
    <GlassPanel className="score-summary-panel">
      <div className="score-summary-heading">
        <div className="score-summary-hero">
          <span className="ui-label">Overall Band Score</span>
          <strong>{overall}</strong>
          <p className="ui-body-md">
            {record.taskType === 'mock' ? 'Task 2 加权综合评分' : 'IELTS Writing 模拟评分'}
          </p>
        </div>

        <div className="score-summary-overview">
          <span className="ui-label">总体评价</span>
          <p>{evaluation.summary || evaluation.overallFeedback || '本次未返回总体评价。'}</p>
        </div>
      </div>

      <div className="criterion-summary-grid" aria-label="四项评分">
        {criteria.map((criterion) => (
          <article key={criterion.key} className="criterion-summary-card">
            <div className="criterion-summary-score">
              <strong>{criterion.score}</strong>
              <span>{criterion.shortLabel}</span>
            </div>
            <div>
              <h2>{criterion.label}</h2>
              <p>{criterion.feedback || '本次未返回该项具体说明。'}</p>
            </div>
          </article>
        ))}
      </div>
    </GlassPanel>
  )
}
