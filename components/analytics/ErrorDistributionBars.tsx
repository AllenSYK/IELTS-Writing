'use client'

import type { ErrorDistributionItem } from '@/lib/learning-analytics'

export function ErrorDistributionBars({ items }: { items: ErrorDistributionItem[] }) {
  return (
    <div className="error-bars" aria-label="错误分布">
      {items.map((item) => (
        <div className="error-bar" key={item.key}>
          <span className="ui-label">{item.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
          </span>
          <span className="ui-label error-bar-count">
            {item.count}次 · {item.percent}%
          </span>
        </div>
      ))}
    </div>
  )
}
