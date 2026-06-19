'use client'

import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { MaterialIcon } from '@/components/app-ui'
import { isResolvedAnnotation } from '@/lib/essay-annotations'
import {
  EssayAnnotationCriterionLabels,
  EssayAnnotationLabels,
  type EssayAnnotation
} from '@/lib/writing-records'

const SeverityLabels = {
  low: '轻微',
  medium: '主要',
  high: '系统性'
} as const

export function AnnotationDialog({
  annotation,
  annotations,
  originalEssay,
  acceptedIds,
  ignoredIds,
  canUndo,
  onClose,
  onSelect,
  onAccept,
  onIgnore,
  onUndo,
  onResetAll,
  onAcceptAllRequest
}: {
  annotation: EssayAnnotation | null
  annotations: EssayAnnotation[]
  originalEssay: string
  acceptedIds: Set<string>
  ignoredIds: Set<string>
  canUndo: boolean
  onClose: () => void
  onSelect: (annotationId: string) => void
  onAccept: (annotation: EssayAnnotation) => void
  onIgnore: (annotation: EssayAnnotation) => void
  onUndo: () => void
  onResetAll: () => void
  onAcceptAllRequest: () => void
}) {
  if (!annotation) {
    return (
      <CenteredDialog open={false} title="原文批注" onClose={onClose}>
        <span />
      </CenteredDialog>
    )
  }

  const currentIndex = Math.max(0, annotations.findIndex((item) => item.id === annotation.id))
  const accepted = acceptedIds.has(annotation.id)
  const ignored = ignoredIds.has(annotation.id)
  const unresolved = !isResolvedAnnotation(annotation, originalEssay)
  const canAccept = Boolean(annotation.replacement && !accepted && !ignored && !unresolved)

  function move(delta: number) {
    if (annotations.length === 0) return
    const nextIndex = (currentIndex + delta + annotations.length) % annotations.length
    onSelect(annotations[nextIndex].id)
  }

  return (
    <CenteredDialog
      open
      title="原文批注"
      description={`第 ${currentIndex + 1} / ${annotations.length} 个问题`}
      className="annotation-dialog"
      bodyClassName="annotation-dialog-body"
      onClose={onClose}
      footer={(
        <div className="annotation-dialog-actions">
          <button className="ui-secondary-button" type="button" onClick={() => move(-1)}>
            <MaterialIcon name="arrow_back" size={17} />
            上一个
          </button>
          <button className="ui-secondary-button" type="button" onClick={() => move(1)}>
            下一个
            <MaterialIcon name="arrow_forward" size={17} />
          </button>
        </div>
      )}
    >
      <div className="annotation-inspector-top">
        <span className={`annotation-type-chip annotation-${annotation.category}`}>
          {EssayAnnotationLabels[annotation.category]}
        </span>
        <span className={`severity-chip severity-${annotation.severity}`}>
          {SeverityLabels[annotation.severity]}
        </span>
      </div>

      <dl className="annotation-detail-list">
        <div>
          <dt>原文片段</dt>
          <dd className="original">{annotation.originalText}</dd>
        </div>
        <div>
          <dt>问题类型</dt>
          <dd>{EssayAnnotationLabels[annotation.category]}</dd>
        </div>
        <div>
          <dt>问题说明</dt>
          <dd>{annotation.explanationZh}</dd>
        </div>
        <div>
          <dt>建议修改</dt>
          <dd className="replacement">{annotation.replacement || annotation.suggestion}</dd>
        </div>
        <div>
          <dt>影响维度</dt>
          <dd>{EssayAnnotationCriterionLabels[annotation.scoreCriterion]}</dd>
        </div>
        <div>
          <dt>严重程度</dt>
          <dd>{SeverityLabels[annotation.severity]}</dd>
        </div>
      </dl>

      <div className="annotation-action-grid">
        <button className="ui-primary-button" type="button" onClick={() => onAccept(annotation)} disabled={!canAccept}>
          <MaterialIcon name={accepted ? 'check_circle' : 'done'} size={17} />
          {accepted ? '已接受' : '接受修改'}
        </button>
        <button className="ui-secondary-button" type="button" onClick={() => onIgnore(annotation)} disabled={ignored || accepted}>
          <MaterialIcon name="visibility_off" size={17} />
          {ignored ? '已忽略' : '忽略'}
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

      <button className="annotation-accept-all" type="button" onClick={onAcceptAllRequest}>
        <MaterialIcon name="done_all" size={17} />
        接受当前筛选下的全部可替换建议
      </button>
    </CenteredDialog>
  )
}
