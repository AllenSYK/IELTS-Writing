'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import { GlassPanel } from '@/components/app-ui'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
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

function CriteriaDetailDialog({
  criterion,
  onClose
}: {
  criterion: CriterionSummary
  onClose: () => void
}) {
  return (
    <CenteredDialog
      open
      title={criterion.label}
      onClose={onClose}
      className="criteria-detail-dialog"
    >
      <div className="criteria-detail-body">
        <div className="criteria-detail-hero">
          <strong className="criteria-detail-score">{criterion.score}</strong>
          <span className="criteria-detail-abbr">{criterion.shortLabel}</span>
        </div>
        <div className="criteria-detail-feedback">
          <h3 className="ui-label">评分说明</h3>
          <p>{criterion.feedback || '本次未返回该项具体说明。'}</p>
        </div>
      </div>
    </CenteredDialog>
  )
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
  const [activeCriterion, setActiveCriterion] = useState<CriterionSummary | null>(null)

  const handleCardClick = useCallback((criterion: CriterionSummary) => {
    setActiveCriterion(criterion)
  }, [])

  const handleCardKeyDown = useCallback((criterion: CriterionSummary, event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setActiveCriterion(criterion)
    }
  }, [])

  return (
    <>
      <GlassPanel className="score-summary-panel">
        <div className="score-summary-heading">
          <div className="score-summary-hero">
            <span className="ui-label">Overall Band Score</span>
            <strong>{overall}</strong>
            <p className="ui-body-md">
              {record.taskType === 'mock' ? 'Task 2 加权综合评分' : '雅思写作模拟评分'}
            </p>
          </div>

          <div className="score-summary-overview">
            <span className="ui-label">总体评价</span>
            <p>{evaluation.summary || evaluation.overallFeedback || '本次未返回总体评价。'}</p>
          </div>
        </div>

        <div className="criteria-grid" aria-label="四项评分">
          {criteria.map((criterion) => (
            <button
              key={criterion.key}
              className="criterion-card"
              type="button"
              aria-label={`${criterion.label}：${criterion.score}分，点击查看详细评语`}
              onClick={() => handleCardClick(criterion)}
              onKeyDown={(e) => handleCardKeyDown(criterion, e)}
            >
              <span className="criterion-card-label">{criterion.label}</span>
              <strong className="criterion-card-score">{criterion.score}</strong>
              <span className="criterion-card-abbr">{criterion.shortLabel}</span>
            </button>
          ))}
        </div>
      </GlassPanel>

      {activeCriterion && (
        <CriteriaDetailDialog
          criterion={activeCriterion}
          onClose={() => setActiveCriterion(null)}
        />
      )}
    </>
  )
}
