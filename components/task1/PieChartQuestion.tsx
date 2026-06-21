'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { Task1ChartSpec } from '@/lib/task1-chart-schema'
import { Task1Legend } from './Task1Legend'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#4f46e5']
const INITIAL_PIE_DIMENSION = { width: 400, height: 320 }

type Props = {
  spec: Task1ChartSpec
}

export function PieChartQuestion({ spec }: Props) {
  const data = useMemo(() => {
    if (!spec.pieData) return []
    return spec.pieData.flatMap(d => d.value === null ? [] : [{
      name: d.label,
      value: d.value
    }])
  }, [spec])

  if (!spec.pieData || data.length === 0) {
    return <div className="task1-chart-empty">饼图数据不完整</div>
  }

  return (
    <section className="task1-chart-wrapper" data-chart-type="pie">
      {(spec.title || spec.subtitle) && (
        <header className="task1-chart-heading">
          {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
          {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
        </header>
      )}
      <div className="task1-pie-layout">
        <div className="task1-pie-canvas">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={320}
            initialDimension={INITIAL_PIE_DIMENSION}
          >
            <PieChart margin={{ top: 12, right: 12, left: 12, bottom: 12 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ percent }) => percent !== undefined && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : null}
                outerRadius="78%"
                dataKey="value"
                stroke="var(--surface, #fff)"
                strokeWidth={2}
              >
                {data.map((slice, index) => (
                  <Cell key={`${slice.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value}%`, name]}
                contentStyle={{
                  backgroundColor: 'var(--surface, #fff)',
                  border: '1px solid var(--outline-variant, #e0e0e0)',
                  borderRadius: 8,
                  fontSize: 13
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <Task1Legend
          className="task1-pie-legend"
          items={data.map((slice, index) => ({
            color: COLORS[index % COLORS.length],
            label: slice.name,
            value: `${slice.value}%`
          }))}
        />
      </div>
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </section>
  )
}
