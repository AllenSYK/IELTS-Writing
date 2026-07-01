'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ProcessV2 } from '@/lib/task1-chart-schema'

type Props = {
  spec: ProcessV2
}

type LayoutMode = 'horizontal' | 'grid' | 'vertical'

function determineLayoutMode(containerWidth: number, stepCount: number): LayoutMode {
  if (containerWidth < 480) return 'vertical'
  if (containerWidth < 600) return stepCount > 5 ? 'vertical' : 'grid'
  if (containerWidth >= 900) return stepCount > 6 ? 'grid' : 'horizontal'
  return stepCount > 4 ? 'grid' : 'horizontal'
}

function getGridColumns(containerWidth: number, stepCount: number): number {
  if (containerWidth < 600) return 2
  if (stepCount <= 4) return stepCount
  if (stepCount <= 6) return 3
  return 4
}

export const ProcessDiagramQuestion = memo(function ProcessDiagramQuestion({ spec }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(600)
  const steps = spec.steps
  const layoutMode = determineLayoutMode(containerWidth, steps.length)
  const isCyclic = spec.isCyclic ?? false

  const measure = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const w = el.getBoundingClientRect().width
    setContainerWidth((prev) => Math.abs(prev - w) > 1 ? w : prev)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [measure])

  const gridCols = layoutMode === 'grid' ? getGridColumns(containerWidth, steps.length) : 1

  return (
    <div ref={containerRef} className="process-v2" data-layout={layoutMode}>
      {spec.title && <h3 className="process-v2-title">{spec.title}</h3>}

      <div
        className="process-v2-container"
        style={layoutMode === 'grid' ? { '--process-cols': gridCols } as React.CSSProperties : undefined}
      >
        {steps.map((step, i) => {
          const isFirst = i === 0
          const isLast = i === steps.length - 1
          const showArrow = !isLast || isCyclic

          return (
            <div key={step.id} className="process-v2-step-group" data-layout={layoutMode}>
              <div className="process-v2-step">
                {spec.startLabel && isFirst && (
                  <span className="process-v2-endpoint-label">{spec.startLabel}</span>
                )}
                <div className="process-v2-step-content">
                  <span className="process-v2-step-title">{step.title}</span>
                  {step.description && (
                    <span className="process-v2-step-desc">{step.description}</span>
                  )}
                </div>
                {spec.endLabel && isLast && (
                  <span className="process-v2-endpoint-label">{spec.endLabel}</span>
                )}
              </div>

              {showArrow && layoutMode === 'horizontal' && (
                <div className="process-v2-arrow" data-direction="right" aria-hidden="true">
                  <svg viewBox="0 0 32 16" fill="none">
                    <path d="M2 8h24M22 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {showArrow && layoutMode === 'vertical' && (
                <div className="process-v2-arrow" data-direction="down" aria-hidden="true">
                  <svg viewBox="0 0 16 32" fill="none">
                    <path d="M8 2v24M3 22l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}

              {showArrow && layoutMode === 'grid' && (
                <GridArrow
                  index={i}
                  cols={gridCols}
                  total={steps.length}
                  isCyclic={isCyclic}
                />
              )}
            </div>
          )
        })}

        {isCyclic && layoutMode === 'grid' && (
          <div className="process-v2-cycle-return" aria-label="Process returns to start">
            <svg viewBox="0 0 100 30" fill="none" preserveAspectRatio="none">
              <path d="M90 5 C90 25, 10 25, 10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 3" />
              <path d="M14 8 L10 5 L16 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="process-v2-cycle-label">Back to {steps[0]?.title}</span>
          </div>
        )}
      </div>
    </div>
  )
})

function GridArrow({
  index,
  cols,
  total,
  isCyclic
}: {
  index: number
  cols: number
  total: number
  isCyclic: boolean
}) {
  const posInRow = index % cols
  const isRowLast = posInRow === cols - 1
  const isLastStep = index === total - 1

  if (isLastStep && isCyclic) {
    return (
      <div className="process-v2-arrow" data-direction="cycle" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 4 C18 4, 20 10, 16 14 C12 18, 6 16, 6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M9 13 L6 10 L10 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  if (isLastStep) return null

  if (isRowLast) {
    return (
      <div className="process-v2-arrow" data-direction="down-left" aria-hidden="true">
        <svg viewBox="0 0 40 32" fill="none">
          <path d="M38 4 L38 16 L2 16 L2 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M5 24 L2 28 L6 27" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <div className="process-v2-arrow" data-direction="right" aria-hidden="true">
      <svg viewBox="0 0 32 16" fill="none">
        <path d="M2 8h24M22 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
