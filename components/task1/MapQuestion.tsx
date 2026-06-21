'use client'

import type { Task1MapSpec } from '@/lib/task1-chart-schema'

type Props = {
  spec: Task1MapSpec
}

export function MapQuestion({ spec }: Props) {
  const features = spec.features
  const beforeFeatures = features.filter(f => f.change !== 'added')
  const afterFeatures = features.filter(f => f.change !== 'removed')

  return (
    <section className="task1-chart-wrapper" data-chart-type="map">
      {spec.title && (
        <header className="task1-chart-heading">
          <h3 className="task1-chart-title">{spec.title}</h3>
        </header>
      )}
      <div className="task1-map-container">
        <div className="task1-map-panel">
          <h4 className="task1-map-panel-title">{spec.beforeLabel}</h4>
          <svg viewBox="0 0 400 300" className="task1-map-svg">
            <rect x="0" y="0" width="400" height="300" fill="var(--surface-variant, #f5f5f5)" rx={8} />
            {beforeFeatures.map(f => (
              <g key={f.id}>
                <circle
                  cx={f.position.x * 3.6 + 20}
                  cy={f.position.y * 2.6 + 20}
                  r={12}
                  fill={f.change === 'removed' ? 'var(--error, #dc2626)' : 'var(--primary, #6750a4)'}
                  opacity={f.change === 'removed' ? 0.7 : 0.9}
                />
                <text
                  x={f.position.x * 3.6 + 20}
                  y={f.position.y * 2.6 + 24}
                  textAnchor="middle"
                  fontSize={9}
                  fill="white"
                  fontWeight={600}
                >
                  {f.label.slice(0, 3)}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div className="task1-map-arrow">
          <svg viewBox="0 0 40 30" width="40" height="30">
            <path d="M5 15 L30 15 M25 10 L30 15 L25 20" stroke="var(--on-surface, #1d1d1d)" strokeWidth="2" fill="none" />
          </svg>
        </div>
        <div className="task1-map-panel">
          <h4 className="task1-map-panel-title">{spec.afterLabel}</h4>
          <svg viewBox="0 0 400 300" className="task1-map-svg">
            <rect x="0" y="0" width="400" height="300" fill="var(--surface-variant, #f5f5f5)" rx={8} />
            {afterFeatures.map(f => (
              <g key={f.id}>
                <circle
                  cx={f.position.x * 3.6 + 20}
                  cy={f.position.y * 2.6 + 20}
                  r={12}
                  fill={f.change === 'added' ? 'var(--primary, #16a34a)' : 'var(--primary, #6750a4)'}
                  opacity={0.9}
                />
                <text
                  x={f.position.x * 3.6 + 20}
                  y={f.position.y * 2.6 + 24}
                  textAnchor="middle"
                  fontSize={9}
                  fill="white"
                  fontWeight={600}
                >
                  {f.label.slice(0, 3)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
      {features.some(f => f.description) && (
        <div className="task1-map-legend">
          {features.filter(f => f.description).map(f => (
            <div key={f.id} className="task1-map-legend-item">
              <span className={`task1-map-legend-dot ${f.change === 'added' ? 'added' : f.change === 'removed' ? 'removed' : ''}`} />
              <span><strong>{f.label}:</strong> {f.description}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
