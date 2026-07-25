'use client'

import { useState, useCallback, useMemo, type KeyboardEvent } from 'react'
import { GlassPanel } from '@/components/app-ui'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import {
  formatBand,
  type CriterionKey,
  type EssayEvaluation,
  type WritingRecord,
  type WritingRecordComponent
} from '@/lib/writing-records'
import { criterionKeysForTask } from '@/lib/ielts-scoring'
import type { WritingTaskType } from '@/lib/writing-records'

type CriterionSummary = {
  key: CriterionKey
  shortLabel: string
  label: string
  score: string
  feedback?: string
  evidence?: string[]
  whyNotHigher?: string
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
        {criterion.evidence && criterion.evidence.length > 0 && (
          <div className="criteria-detail-feedback">
            <h3 className="ui-label">具体表现</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {criterion.evidence.map((e, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {criterion.whyNotHigher && (
          <div className="criteria-detail-feedback">
            <h3 className="ui-label">为什么不是更高分</h3>
            <p>{criterion.whyNotHigher}</p>
          </div>
        )}
      </div>
    </CenteredDialog>
  )
}

function MockTaskTabs({
  activeTask,
  task1Component,
  task2Component,
  onChange
}: {
  activeTask: 'task1' | 'task2'
  task1Component?: WritingRecordComponent
  task2Component?: WritingRecordComponent
  onChange: (task: 'task1' | 'task2') => void
}) {
  const t1Ready = Boolean(task1Component?.evaluation?.overallBand || task1Component?.evaluation?.bandEstimate)
  const t2Ready = Boolean(task2Component?.evaluation?.overallBand || task2Component?.evaluation?.bandEstimate)

  return (
    <div className="mock-task-tabs" role="tablist" aria-label="模考任务切换">
      <button
        className={`mock-task-tab ${activeTask === 'task1' ? 'is-active' : ''}`}
        type="button"
        role="tab"
        aria-selected={activeTask === 'task1'}
        onClick={() => onChange('task1')}
      >
        Task 1{t1Ready ? '' : ' · 待批改'}
      </button>
      <button
        className={`mock-task-tab ${activeTask === 'task2' ? 'is-active' : ''}`}
        type="button"
        role="tab"
        aria-selected={activeTask === 'task2'}
        onClick={() => onChange('task2')}
      >
        Task 2{t2Ready ? '' : ' · 待批改'}
      </button>
    </div>
  )
}

function buildCriteriaForTask(
  evaluation: EssayEvaluation | undefined,
  taskType: 'task1' | 'task2'
): CriterionSummary[] {
  const keys = criterionKeysForTask(taskType as WritingTaskType)
  return keys.map((key) => {
    const c = evaluation?.criteria?.[key]
    return {
      key,
      shortLabel: key === 'taskAchievement' ? 'TA' : key === 'taskResponse' ? 'TR' : key === 'coherenceCohesion' ? 'CC' : key === 'lexicalResource' ? 'LR' : 'GRA',
      label: key === 'taskAchievement' ? 'Task Achievement'
        : key === 'taskResponse' ? 'Task Response'
        : key === 'coherenceCohesion' ? 'Coherence and Cohesion'
        : key === 'lexicalResource' ? 'Lexical Resource'
        : 'Grammatical Range and Accuracy',
      score: c?.score ? formatBand(c.score) : '—',
      feedback: c?.feedback,
      evidence: c?.evidence,
      whyNotHigher: c?.whyNotHigher
    }
  })
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
  const [mockTask, setMockTask] = useState<'task1' | 'task2'>(() => {
    if (record.taskType !== 'mock') return 'task1'
    const t1 = record.components?.task1?.evaluation
    const t2 = record.components?.task2?.evaluation
    const t1Ready = Boolean(t1?.overallBand || t1?.bandEstimate)
    return t1Ready ? 'task1' : 'task2'
  })

  const isMock = record.taskType === 'mock'
  const task1Component = record.components?.task1
  const task2Component = record.components?.task2
  const t1Ready = Boolean(task1Component?.evaluation?.overallBand || task1Component?.evaluation?.bandEstimate)
    && Boolean(task1Component?.evaluation?.taskAchievement || task1Component?.evaluation?.criteria?.taskAchievement)
  const t2Ready = Boolean(task2Component?.evaluation?.overallBand || task2Component?.evaluation?.bandEstimate)
    && Boolean(task2Component?.evaluation?.taskResponse || task2Component?.evaluation?.criteria?.taskResponse)
  const mockComplete = t1Ready && t2Ready
  const activeComponent = isMock ? (mockTask === 'task1' ? task1Component : task2Component) : undefined
  const activeEvaluation = activeComponent?.evaluation

  const mockCriteria = useMemo(() => {
    if (!isMock) return criteria
    return buildCriteriaForTask(activeEvaluation, mockTask)
  }, [isMock, activeEvaluation, mockTask, criteria])

  const displayCriteria = isMock ? mockCriteria : criteria
  const displayOverall = isMock
    ? (mockComplete ? overall : (activeEvaluation ? formatBand(activeEvaluation.overallBand || activeEvaluation.bandEstimate) : '—'))
    : overall
  const displaySummary = isMock
    ? (mockComplete
      ? (evaluation.summary || evaluation.overallFeedback || '本次未返回总体评价。')
      : (activeEvaluation?.summary || activeEvaluation?.overallFeedback || '本次未返回该项具体说明。'))
    : (evaluation.summary || evaluation.overallFeedback || '本次未返回总体评价。')
  const taskLabel = isMock ? (mockTask === 'task1' ? 'Task 1' : 'Task 2') : null
  const mockPartialMessage = isMock && !mockComplete
    ? (t1Ready ? 'Task 2 批改尚未完成' : 'Task 1 批改尚未完成')
    : null

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
        {isMock && (
          <MockTaskTabs
            activeTask={mockTask}
            task1Component={task1Component}
            task2Component={task2Component}
            onChange={setMockTask}
          />
        )}

        <div className="score-summary-heading">
          <div className="score-summary-hero">
            <span className="ui-label">{taskLabel ? `${taskLabel} 写作分数` : '写作总分'}</span>
            <strong>{displayOverall}</strong>
            <p className="ui-body-md">
              {isMock
                ? (mockComplete ? 'Task 2 加权综合评分' : (activeEvaluation ? `${taskLabel} 评分` : `${taskLabel} 批改未完成`))
                : '雅思写作模拟评分'}
            </p>
            {mockPartialMessage && (
              <p className="ui-label" style={{ color: 'var(--warning, #d06b00)', marginTop: 4 }}>{mockPartialMessage}</p>
            )}
          </div>

          <div className="score-summary-overview">
            <span className="ui-label">总体评价</span>
            <p>{displaySummary}</p>
          </div>
        </div>

        <div className="criteria-grid" aria-label="四项评分">
          {displayCriteria.map((criterion) => (
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
              <span
                className="criteria-detail-btn"
                role="presentation"
                aria-hidden="true"
              >
                查看详情
              </span>
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
