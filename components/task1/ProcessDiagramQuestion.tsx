'use client'

import type { Task1ProcessSpec } from '@/lib/task1-chart-schema'

type Props = {
  spec: Task1ProcessSpec
}

function StageIcon({ stageIndex, label }: { stageIndex: number; label: string }) {
  const l = label.toLowerCase()
  const isRecycledPaper = l.includes('废纸') || l.includes('收集') || l.includes('分类') || l.includes('制浆') || l.includes('脱墨') || l.includes('滚压') || l.includes('干燥') || l.includes('再生')

  if (isRecycledPaper) {
    if (l.includes('废纸') || (stageIndex === 0 && l.includes('收集'))) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="14" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M8 14h24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 14V11a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17 22l3 4 3-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 20v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    }
    if (l.includes('分类') || l.includes('分级')) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="8" width="30" height="6" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M12 14v10l-7 8h30l-7-8V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="14" cy="26" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="20" cy="28" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="26" cy="25" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )
    }
    if (l.includes('制浆')) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="20" cy="30" rx="13" ry="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M7 30V14c0-3 3-6 6-6h14c3 0 6 3 6 6v16" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M13 16c2 2 4 3 7 3s5-1 7-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <line x1="16" y1="12" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="20" y1="12" x2="20" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="24" y1="12" x2="24" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    }
    if (l.includes('清洗') || l.includes('脱墨')) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 10h24v20a4 4 0 01-4 4H12a4 4 0 01-4-4V10z" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <path d="M8 10h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 18c1 2 2 3 3 4s2 2 3 2 2-1 3-2 2-2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
          <circle cx="16" cy="24" r="1.5" fill="currentColor" opacity="0.4" />
          <circle cx="24" cy="22" r="1.5" fill="currentColor" opacity="0.4" />
          <circle cx="20" cy="26" r="1" fill="currentColor" opacity="0.4" />
        </svg>
      )
    }
    if (l.includes('压榨') || l.includes('滚压')) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="16" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <circle cx="28" cy="16" r="7" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <circle cx="14" cy="16" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="28" cy="16" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M7 28h26" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M10 32h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <path d="M14 23L28 23" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    }
    if (l.includes('干燥') || l.includes('再生纸')) {
      return (
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="10" width="24" height="22" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <line x1="12" y1="16" x2="28" y2="16" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
          <line x1="12" y1="20" x2="28" y2="20" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
          <line x1="12" y1="24" x2="22" y2="24" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
          <path d="M24 4l2 3-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M30 4l-2 3 2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M27 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    }
  }

  // Generic icons for non-recycled-paper process diagrams
  const genericIcons = [
    // Stage 1: Start/input
    <svg key={0} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M15 20l10-6v12L15 20z" fill="currentColor" opacity="0.7" />
    </svg>,
    // Stage 2: Process/filter
    <svg key={1} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10h24l-8 10v10l-8-2V20L8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </svg>,
    // Stage 3: Mixing/container
    <svg key={2} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="20" cy="30" rx="12" ry="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M8 30V16c0-3 3-6 5-6h14c2 0 5 3 5 6v14" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>,
    // Stage 4: Cleaning/water
    <svg key={3} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 8c-6 8-10 12-10 18a10 10 0 0020 0c0-6-4-10-10-18z" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>,
    // Stage 5: Mechanical/pressure
    <svg key={4} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="18" r="8" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="28" cy="18" r="8" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="14" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="28" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>,
    // Stage 6: Output/complete
    <svg key={5} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="10" width="24" height="22" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <polyline points="15,22 19,26 27,17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>,
  ]

  return genericIcons[stageIndex % genericIcons.length]
}

export function ProcessDiagramQuestion({ spec }: Props) {
  const stages = spec.stages

  return (
    <div className="task1-process-diagram">
      {spec.title && <h3 className="task1-process-diagram-title">{spec.title}</h3>}

      <div className="task1-process-flow">
        {stages.map((stage, i) => (
          <div key={stage.id} className="task1-process-stage-wrapper">
            <div className="task1-process-stage">
              <div className="task1-process-stage-icon">
                <StageIcon stageIndex={i} label={stage.label} />
              </div>
              <div className="task1-process-stage-number">{i + 1}</div>
              <div className="task1-process-stage-label">{stage.label}</div>
              {stage.description && (
                <div className="task1-process-stage-desc">{stage.description}</div>
              )}
            </div>
            {i < stages.length - 1 && (
              <div className="task1-process-arrow" aria-hidden="true">
                <svg viewBox="0 0 40 24" className="task1-process-arrow-svg">
                  <defs>
                    <marker id={`arrow-${i}`} markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                      <path d="M0 0L10 4L0 8" fill="none" stroke="var(--outline, #86868b)" strokeWidth="1.5" strokeLinejoin="round" />
                    </marker>
                  </defs>
                  <line x1="2" y1="12" x2="32" y2="12" stroke="var(--outline, #86868b)" strokeWidth="1.8" markerEnd={`url(#arrow-${i})`} />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
