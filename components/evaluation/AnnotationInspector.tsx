'use client'

import { MaterialIcon } from '@/components/app-ui'
import {
  EssayAnnotationCriterionLabels,
  EssayAnnotationLabels,
  type EssayAnnotation
} from '@/lib/writing-records'

type AnnotationInspectorProps = {
  annotations: EssayAnnotation[]
  selectedId?: string | null
  emptyMessage: string
  acceptedIds: Set<string>
  ignoredIds: Set<string>
  canUndo: boolean
  onSelect: (annotationId: string) => void
  onAccept: (annotation: EssayAnnotation) => void
  onIgnore: (annotation: EssayAnnotation) => void
  onUndo: () => void
  onResetAll: () => void
  onAcceptAllRequest: () => void
}

const SeverityLabels = {
  low: '低',
  medium: '中',
  high: '高'
} as const

export function AnnotationInspector({
  annotations,
  selectedId,
  emptyMessage,
  acceptedIds,
  ignoredIds,
  canUndo,
  onSelect,
  onAccept,
  onIgnore,
  onUndo,
  onResetAll,
  onAcceptAllRequest
}: AnnotationInspectorProps) {
  const currentIndex = Math.max(0, annotations.findIndex((annotation) => annotation.id === selectedId))
  const annotation = annotations[currentIndex] ?? null
  const accepted = annotation ? acceptedIds.has(annotation.id) : false
  const ignored = annotation ? ignoredIds.has(annotation.id) : false
  const canAccept = Boolean(annotation?.replacement && !accepted && !ignored)

  function move(delta: number) {
    if (annotations.length === 0) return
    const nextIndex = (currentIndex + delta + annotations.length) % annotations.length
    onSelect(annotations[nextIndex].id)
  }

  if (!annotation) {
    return (
      <aside className="annotation-inspector is-empty" aria-live="polite">
        <div className="annotation-empty-icon">
          <MaterialIcon name="rule" size={22} />
        </div>
        <h2 className="ui-title-md">原文标注</h2>
        <p className="ui-body-md">{emptyMessage}</p>
      </aside>
    )
  }

  return (
    <aside className="annotation-inspector" aria-live="polite" id={`annotation-inspector-${annotation.id}`}>
      <div className="annotation-inspector-top">
        <span className={`annotation-type-chip annotation-${annotation.category}`}>
          <MaterialIcon name={iconForCategory(annotation.category)} size={16} />
          {EssayAnnotationLabels[annotation.category]}
        </span>
        <span className={`severity-chip severity-${annotation.severity}`}>{SeverityLabels[annotation.severity]}</span>
      </div>

      <div key={annotation.id} className="annotation-inspector-body">
        <div className="annotation-counter">
          <span>第 {currentIndex + 1} / {annotations.length} 个问题</span>
          {accepted ? <strong>已接受</strong> : ignored ? <strong>已忽略</strong> : null}
        </div>

        <dl className="annotation-detail-list">
          <div>
            <dt>评分维度</dt>
            <dd>{EssayAnnotationCriterionLabels[annotation.scoreCriterion]}</dd>
          </div>
          <div>
            <dt>原文</dt>
            <dd className="original">{annotation.originalText}</dd>
          </div>
          <div>
            <dt>推荐修改</dt>
            <dd className="replacement">{annotation.replacement || annotation.suggestion}</dd>
          </div>
          <div>
            <dt>中文解释</dt>
            <dd>{annotation.explanationZh}</dd>
          </div>
          <div>
            <dt>为什么影响分数</dt>
            <dd>{annotation.impactOnScore}</dd>
          </div>
          <div>
            <dt>建议</dt>
            <dd>{annotation.suggestion}</dd>
          </div>
        </dl>
      </div>

      <div className="annotation-nav-row">
        <button className="ui-secondary-button" type="button" onClick={() => move(-1)}>
          <MaterialIcon name="arrow_upward" size={17} />
          上一个
        </button>
        <button className="ui-secondary-button" type="button" onClick={() => move(1)}>
          <MaterialIcon name="arrow_downward" size={17} />
          下一个
        </button>
      </div>

      <div className="annotation-action-grid">
        <button className="ui-primary-button" type="button" onClick={() => onAccept(annotation)} disabled={!canAccept} title={!annotation.replacement ? '此建议没有可直接替换的文本' : accepted ? '此建议已接受' : ignored ? '此建议已忽略' : undefined}>
          <MaterialIcon name={accepted ? 'check_circle' : 'done'} size={17} />
          接受修改
        </button>
        <button className="ui-secondary-button" type="button" onClick={() => onIgnore(annotation)} disabled={ignored || accepted}>
          <MaterialIcon name="visibility_off" size={17} />
          忽略
        </button>
        <button className="ui-secondary-button" type="button" onClick={onUndo} disabled={!canUndo}>
          <MaterialIcon name="undo" size={17} />
          撤销
        </button>
        <button className="ui-secondary-button" type="button" onClick={onResetAll} disabled={!canUndo}>
          <MaterialIcon name="restart_alt" size={17} />
          重置全部
        </button>
      </div>

      <button className="annotation-accept-all" type="button" onClick={onAcceptAllRequest} disabled={annotations.every((item) => acceptedIds.has(item.id) || ignoredIds.has(item.id) || !item.replacement)}>
        <MaterialIcon name="done_all" size={17} />
        接受全部
      </button>
    </aside>
  )
}

function iconForCategory(category: EssayAnnotation['category']) {
  if (category === 'spelling' || category === 'punctuation' || category === 'grammar') return 'spellcheck'
  if (category === 'vocabulary' || category === 'collocation' || category === 'style' || category === 'repetition') return 'menu_book'
  if (category === 'task-response') return 'assignment_turned_in'
  return 'schema'
}
