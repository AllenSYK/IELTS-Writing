'use client'

import type { ReactNode } from 'react'

export function EvaluationLayout({
  scoreSummary,
  essayPanel,
  inspector
}: {
  scoreSummary: ReactNode
  essayPanel: ReactNode
  inspector: ReactNode
}) {
  return (
    <section className="evaluation-layout" aria-label="批改结果工作区">
      <div className="evaluation-score-column">{scoreSummary}</div>
      <div className="evaluation-body-grid">
        <div className="evaluation-essay-column">{essayPanel}</div>
        <div className="evaluation-inspector-column">{inspector}</div>
      </div>
    </section>
  )
}
