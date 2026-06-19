'use client'

import { memo, useMemo, type ReactNode } from 'react'
import { compareAnnotationPriority, isResolvedAnnotation } from '@/lib/essay-annotations'
import { EssayAnnotationLabels, type EssayAnnotation } from '@/lib/writing-records'

type AnnotatedEssayProps = {
  essay: string
  annotations: EssayAnnotation[]
  selectedId?: string | null
  onSelect: (annotationId: string) => void
}

export const AnnotatedEssay = memo(function AnnotatedEssay({
  essay,
  annotations,
  selectedId,
  onSelect
}: AnnotatedEssayProps) {
  const renderable = useMemo(
    () => annotations.filter((annotation) => isResolvedAnnotation(annotation, essay)),
    [annotations, essay]
  )

  const nodes = useMemo<ReactNode[]>(() => {
    if (renderable.length === 0) return [essay]

    const boundaries = new Set<number>([0, essay.length])
    for (const annotation of renderable) {
      boundaries.add(annotation.start)
      boundaries.add(annotation.end)
    }
    const points = Array.from(boundaries).sort((a, b) => a - b)
    const nextNodes: ReactNode[] = []
    const sortedAnnotations = renderable.slice().sort((a, b) => a.start - b.start || a.end - b.end)
    const activeAnnotations = new Map<string, EssayAnnotation>()
    let annotationCursor = 0

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      const text = essay.slice(start, end)
      if (!text) continue

      for (const [id, annotation] of activeAnnotations) {
        if (annotation.end <= start) activeAnnotations.delete(id)
      }
      while (
        annotationCursor < sortedAnnotations.length &&
        sortedAnnotations[annotationCursor].start <= start
      ) {
        const annotation = sortedAnnotations[annotationCursor]
        if (annotation.end > start) activeAnnotations.set(annotation.id, annotation)
        annotationCursor += 1
      }
      const covering = Array.from(activeAnnotations.values())
      if (covering.length === 0) {
        nextNodes.push(text)
        continue
      }

      const ordered = covering.slice().sort(compareAnnotationPriority)
      const selectedIndex = ordered.findIndex((annotation) => annotation.id === selectedId)
      const active = selectedIndex >= 0 ? ordered[selectedIndex] : ordered[0]
      nextNodes.push(
        <button
          key={`${start}-${end}-${ordered.map((annotation) => annotation.id).join('-')}`}
          type="button"
          className={`annotation-mark annotation-${active.category} severity-${active.severity} ${selectedIndex >= 0 ? 'is-active' : ''}`}
          aria-label={`${EssayAnnotationLabels[active.category]}：${active.originalText}${covering.length > 1 ? `，此处共 ${covering.length} 个问题` : ''}`}
          aria-describedby={`annotation-desc-${active.id}`}
          data-annotation-id={active.id}
          data-annotation-count={covering.length}
          onClick={() => onSelect(ordered[(selectedIndex + 1 + ordered.length) % ordered.length].id)}
        >
          {text}
          {covering.length > 1 ? <sup className="annotation-count-badge">{covering.length}</sup> : null}
        </button>
      )
    }

    return nextNodes
  }, [essay, onSelect, renderable, selectedId])

  return (
    <div className="annotated-essay" aria-label="带错误标注的作文原文">
      <span className="sr-only">
        {renderable.map((annotation) => (
          <span key={annotation.id} id={`annotation-desc-${annotation.id}`}>
            {EssayAnnotationLabels[annotation.category]}，严重程度 {annotation.severity}，建议：{annotation.suggestion}
          </span>
        ))}
      </span>
      {nodes}
    </div>
  )
})
