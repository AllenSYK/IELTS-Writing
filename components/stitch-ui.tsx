'use client'

import type { CSSProperties, ReactNode } from 'react'

type IconProps = {
  name: string
  filled?: boolean
  className?: string
  size?: number
}

export function MaterialIcon({ name, filled = false, className = '', size }: IconProps) {
  const style: CSSProperties = {
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
    ...(size ? { fontSize: size } : {})
  }

  return (
    <span className={`material-symbols-outlined ${className}`} style={style} aria-hidden="true">
      {name}
    </span>
  )
}

export function GlassPanel({
  children,
  level = 1,
  className = '',
  style
}: {
  children: ReactNode
  level?: 1 | 2
  className?: string
  style?: CSSProperties
}) {
  return (
    <section className={`stitch-glass stitch-glass-${level} ${className}`} style={style}>
      {children}
    </section>
  )
}

export function ScoreRing({
  score,
  color = 'primary',
  label
}: {
  score: string
  color?: 'primary' | 'tertiary' | 'error'
  label?: string
}) {
  const numeric = Number(score.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)
  const circumference = 251.2
  const offset = circumference - (Math.min(Math.max(numeric, 0), 9) / 9) * circumference

  return (
    <div className="score-ring" aria-label={label}>
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" fill="transparent" r="40" strokeWidth="4" />
        <circle
          className={`ring-value ring-${color}`}
          cx="50"
          cy="50"
          fill="transparent"
          r="40"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <span>{score}</span>
    </div>
  )
}
