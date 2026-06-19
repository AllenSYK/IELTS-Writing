'use client'

import type { ReactNode } from 'react'

export function EvaluationLayout({
  scoreSummary,
  essayPanel
}: {
  scoreSummary: ReactNode
  essayPanel: ReactNode
}) {
  return (
    <section className="evaluation-layout" aria-label="批改结果工作区">
      <div className="evaluation-score-column">{scoreSummary}</div>
      <div className="evaluation-essay-column">{essayPanel}</div>
    </section>
  )
}
