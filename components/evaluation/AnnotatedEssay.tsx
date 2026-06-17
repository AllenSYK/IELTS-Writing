'use client'

import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { EssayAnnotationLabels, type EssayAnnotation } from '@/lib/writing-records'

type AnnotatedEssayProps = {
  essay: string
  annotations: EssayAnnotation[]
  selectedId?: string | null
  onSelect: (annotationId: string) => void
}

const severityRank = {
  high: 3,
  medium: 2,
  low: 1
} as const

function isRenderable(annotation: EssayAnnotation, essay: string) {
  return (
    !annotation.unresolved &&
    annotation.start >= 0 &&
    annotation.end > annotation.start &&
    annotation.end <= essay.length &&
    essay.slice(annotation.start, annotation.end) === annotation.originalText
  )
}

function primaryAnnotation(annotations: EssayAnnotation[]) {
  return annotations
    .slice()
    .sort((a, b) => {
      const severity = severityRank[b.severity] - severityRank[a.severity]
      if (severity !== 0) return severity
      const length = (b.end - b.start) - (a.end - a.start)
      if (length !== 0) return length
      return a.start - b.start
    })[0]
}

export const AnnotatedEssay = memo(function AnnotatedEssay({
  essay,
  annotations,
  selectedId,
  onSelect
}: AnnotatedEssayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderable = useMemo(
    () => annotations.filter((annotation) => isRenderable(annotation, essay)),
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

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      const text = essay.slice(start, end)
      if (!text) continue

      const covering = renderable.filter((annotation) => annotation.start < end && annotation.end > start)
      if (covering.length === 0) {
        nextNodes.push(text)
        continue
      }

      const primary = primaryAnnotation(covering)
      nextNodes.push(
        <button
          key={`${start}-${end}-${primary.id}`}
          type="button"
          className={`annotation-mark annotation-${primary.category} severity-${primary.severity} ${selectedId === primary.id ? 'is-active' : ''}`}
          aria-label={`${EssayAnnotationLabels[primary.category]}：${primary.originalText}`}
          aria-describedby={`annotation-desc-${primary.id}`}
          data-annotation-id={primary.id}
          data-annotation-count={covering.length}
          onClick={() => onSelect(primary.id)}
        >
          {text}
        </button>
      )
    }

    return nextNodes
  }, [essay, onSelect, renderable, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(selectedId)}"]`)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selectedId])

  return (
    <div ref={containerRef} className="annotated-essay" aria-label="带错误标注的作文原文">
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
