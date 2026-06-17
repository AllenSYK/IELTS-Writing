'use client'

import { useMemo, useState } from 'react'
import { MaterialIcon } from '@/components/stitch-ui'
import type { RadarMetric } from '@/lib/learning-analytics'
import { formatBandNumber } from '@/lib/ielts-scoring'

function pointFor(index: number, value: number, radius: number, centerX: number, centerY: number) {
  const angle = (-90 + index * 90) * (Math.PI / 180)
  const normalized = Math.min(9, Math.max(0, value)) / 9
  return {
    x: centerX + Math.cos(angle) * radius * normalized,
    y: centerY + Math.sin(angle) * radius * normalized
  }
}

function pointsToString(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
}

export function IeltsRadarChart({ metrics }: { metrics: RadarMetric[] }) {
  const [hovered, setHovered] = useState<RadarMetric | null>(null)
  const hasData = metrics.some((metric) => metric.current !== null)
  const centerX = 180
  const centerY = 148
  const radius = 86
  const labelRadius = 126

  const geometry = useMemo(() => {
    const current = metrics.map((metric, index) => pointFor(index, metric.current ?? 0, radius, centerX, centerY))
    const target = metrics.map((metric, index) => pointFor(index, metric.target, radius, centerX, centerY))
    const rings = [3, 6, 9].map((value) =>
      metrics.map((_, index) => pointFor(index, value, radius, centerX, centerY))
    )
    const labels = metrics.map((metric, index) => ({
      metric,
      ...pointFor(index, 9, labelRadius, centerX, centerY)
    }))
    return { current, target, rings, labels }
  }, [metrics])

  if (!hasData) {
    return (
      <div className="radar-empty-state">
        <MaterialIcon name="radar" size={28} />
        <p>完成更多作文批改后，系统会用真实四项评分生成标准表现雷达图。</p>
      </div>
    )
  }

  return (
    <div className="radar-chart" onMouseLeave={() => setHovered(null)}>
      <svg viewBox="0 0 360 300" role="img" aria-label="IELTS 四项能力雷达图">
        <defs>
          <linearGradient id="radar-current-fill" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#d8e2ff" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#adc6ff" stopOpacity="0.34" />
          </linearGradient>
        </defs>

        {geometry.rings.map((ring, index) => (
          <polygon
            key={index}
            points={pointsToString(ring)}
            fill="none"
            stroke="rgba(113, 119, 134, 0.28)"
            strokeWidth="1"
          />
        ))}
        {metrics.map((metric, index) => {
          const end = pointFor(index, 9, radius, centerX, centerY)
          return (
            <line
              key={metric.key}
              x1={centerX}
              x2={end.x}
              y1={centerY}
              y2={end.y}
              stroke="rgba(113, 119, 134, 0.22)"
              strokeWidth="1"
            />
          )
        })}

        <polygon
          points={pointsToString(geometry.target)}
          fill="none"
          stroke="#6750a4"
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <polygon
          points={pointsToString(geometry.current)}
          fill="url(#radar-current-fill)"
          stroke="#0058bc"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />

        {geometry.current.map((point, index) => {
          const metric = metrics[index]
          return (
            <circle
              key={metric.key}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#ffffff"
              stroke="#0058bc"
              strokeWidth="2"
              tabIndex={0}
              onFocus={() => setHovered(metric)}
              onMouseEnter={() => setHovered(metric)}
            >
              <title>{`${metric.label}: 当前 ${formatBandNumber(metric.current)}，目标 ${formatBandNumber(metric.target)}`}</title>
            </circle>
          )
        })}

        {geometry.labels.map(({ metric, x, y }, index) => (
          <text
            key={metric.key}
            fill="#414755"
            fontSize="12"
            fontWeight="700"
            textAnchor={index === 1 ? 'start' : index === 3 ? 'end' : 'middle'}
            x={x}
            y={index === 0 ? y + 4 : index === 2 ? y + 10 : y + 4}
          >
            <title>{metric.label}</title>
            {metric.shortLabel}
          </text>
        ))}
      </svg>

      <div className="radar-legend" aria-label="雷达图图例">
        <span><i className="legend-current" /> 当前表现</span>
        <span><i className="legend-target" /> 目标分</span>
      </div>

      <div className={`radar-tooltip ${hovered ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {hovered ? (
          <>
            <strong>{hovered.label}</strong>
            <span>当前 {formatBandNumber(hovered.current)} · 目标 {formatBandNumber(hovered.target)}</span>
          </>
        ) : (
          <>
            <strong>悬停查看维度</strong>
            <span>显示当前分与目标分</span>
          </>
        )}
      </div>
    </div>
  )
}
