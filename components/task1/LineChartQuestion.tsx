'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { Task1ChartSpec } from '@/lib/task1-chart-schema'
import { Task1Legend } from './Task1Legend'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#4f46e5']
const INITIAL_CHART_DIMENSION = { width: 480, height: 350 }

type Props = {
  spec: Task1ChartSpec
}

export function LineChartQuestion({ spec }: Props) {
  const data = useMemo(() => {
    if (!spec.xAxis || !spec.series) return []
    return spec.xAxis.categories.map((cat, i) => {
      const row: Record<string, string | number | null> = { name: cat }
      for (const s of spec.series!) {
        row[s.id] = s.values[i] ?? null
      }
      return row
    })
  }, [spec])

  if (!spec.xAxis || !spec.series || data.length === 0) {
    return <div className="task1-chart-empty">折线图数据不完整</div>
  }

  const rotateTicks = data.length > 8

  return (
    <section className="task1-chart-wrapper" data-chart-type="line">
      {(spec.title || spec.subtitle) && (
        <header className="task1-chart-heading">
          {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
          {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
        </header>
      )}
      {spec.yAxis?.label && (
        <p className="task1-axis-caption task1-axis-caption-y">
          {spec.yAxis.unit ? `${spec.yAxis.label} (${spec.yAxis.unit})` : spec.yAxis.label}
        </p>
      )}
      <div className="task1-cartesian-canvas">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={350}
          initialDimension={INITIAL_CHART_DIMENSION}
        >
          <LineChart data={data} margin={{ top: 12, right: 20, left: 8, bottom: rotateTicks ? 18 : 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant, #e0e0e0)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--on-surface, #1d1d1d)' }}
              tickLine={{ stroke: 'var(--outline-variant, #e0e0e0)' }}
              interval={rotateTicks ? 'preserveStartEnd' : 0}
              angle={rotateTicks ? -35 : 0}
              textAnchor={rotateTicks ? 'end' : 'middle'}
              height={rotateTicks ? 58 : 34}
              tickMargin={10}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--on-surface, #1d1d1d)' }}
              tickLine={{ stroke: 'var(--outline-variant, #e0e0e0)' }}
              domain={spec.yAxis ? [spec.yAxis.min ?? 'auto', spec.yAxis.max ?? 'auto'] : ['auto', 'auto']}
              width={64}
              tickMargin={8}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface, #fff)',
                border: '1px solid var(--outline-variant, #e0e0e0)',
                borderRadius: 8,
                fontSize: 13
              }}
            />
            {spec.series.map((s, i) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, fill: COLORS[i % COLORS.length] }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {spec.xAxis.label && <p className="task1-axis-caption task1-axis-caption-x">{spec.xAxis.label}</p>}
      {spec.legend !== false && (
        <Task1Legend items={spec.series.map((series, index) => ({
          color: COLORS[index % COLORS.length],
          label: series.name
        }))} />
      )}
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </section>
  )
}
