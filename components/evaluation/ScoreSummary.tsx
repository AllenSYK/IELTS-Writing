'use client'

import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
import { formatBandNumber } from '@/lib/ielts-scoring'
import {
  formatBand,
  type CriterionKey,
  type EssayEvaluation,
  type WritingRecord
} from '@/lib/writing-records'

type CriterionSummary = {
  key: CriterionKey
  label: string
  score: string
  feedback?: string
}

export function ScoreSummary({
  record,
  evaluation,
  criteria,
  topIssues
}: {
  record: WritingRecord
  evaluation: EssayEvaluation
  criteria: CriterionSummary[]
  topIssues: string[]
}) {
  const overall = formatBand(evaluation.overallBand || evaluation.bandEstimate)

  return (
    <GlassPanel className="score-summary-panel">
      <div className="score-summary-hero">
        <span className="stitch-label">Overall Band Score</span>
        <strong>{overall}</strong>
        <p className="stitch-body-md">
          {record.taskType === 'mock' ? 'Task 2 加权综合评分' : '真实批改结果'} · {record.wordCount} words
        </p>
        {overall === '—' && (
          <p className="score-not-available">AI 未返回总分，仅展示各项评分</p>
        )}
      </div>

      {record.taskType === 'mock' && record.components ? (
        <div className="score-summary-mini-grid" aria-label="模考分项">
          {(['task1', 'task2'] as const).map((taskType) => {
            const component = record.components?.[taskType]
            if (!component) return null
            return (
              <div key={taskType}>
                <span>{taskType === 'task1' ? 'Task 1' : 'Task 2'}</span>
                <strong>{formatBand(component.evaluation.overallBand || component.evaluation.bandEstimate)}</strong>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="score-summary-section">
        <h2 className="stitch-title-md">四项评分</h2>
        <div className="criterion-summary-list">
          {criteria.map((criterion) => (
            <article key={criterion.key} className="criterion-summary-item">
              <div>
                <span className="stitch-label">{criterion.label}</span>
                {criterion.feedback ? <p>{criterion.feedback}</p> : null}
              </div>
              <strong>{criterion.score}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="score-summary-section">
        <h2 className="stitch-title-md">
          <MaterialIcon name="warning" className="text-tertiary" size={19} />
          重点问题
        </h2>
        {topIssues.length > 0 ? (
          <ul className="issue-list">
            {topIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>
                <span className="issue-dot" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="stitch-body-md">AI 本次未返回问题列表。</p>
        )}
      </div>

      {evaluation.summary || evaluation.overallFeedback ? (
        <div className="score-summary-section">
          <h2 className="stitch-title-md">总体评价</h2>
          <p className="stitch-body-md">{evaluation.summary || evaluation.overallFeedback}</p>
        </div>
      ) : null}

      {evaluation.strengths && evaluation.strengths.length > 0 ? (
        <div className="score-summary-section">
          <h2 className="stitch-title-md">优点</h2>
          <ul className="issue-list">
            {evaluation.strengths.slice(0, 3).map((strength) => (
              <li key={strength}>
                <span className="issue-dot" />
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {evaluation.nextSteps && evaluation.nextSteps.length > 0 ? (
        <div className="score-summary-section">
          <h2 className="stitch-title-md">下一步建议</h2>
          <ul className="issue-list">
            {evaluation.nextSteps.slice(0, 3).map((suggestion) => (
              <li key={suggestion}>
                <span className="issue-dot" />
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <span className="sr-only">当前总分为 {formatBandNumber(Number(overall))}</span>
    </GlassPanel>
  )
}
