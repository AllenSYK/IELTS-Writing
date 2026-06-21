'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label
} from 'recharts'
import type { Task1ChartSpec } from '@/lib/task1-chart-schema'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#4f46e5']

type Props = {
  spec: Task1ChartSpec
  containerWidth: number
}

export function LineChartQuestion({ spec, containerWidth }: Props) {
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

  const chartHeight = Math.max(280, Math.min(400, containerWidth * 0.5))

  return (
    <div className="task1-chart-wrapper">
      {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
      {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--outline-variant, #e0e0e0)" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'var(--on-surface, #1d1d1d)' }}
            tickLine={{ stroke: 'var(--outline-variant, #e0e0e0)' }}
          >
            {spec.xAxis.label && <Label value={spec.xAxis.label} position="bottom" offset={0} style={{ fontSize: 12, fill: 'var(--on-surface-variant, #666)' }} />}
          </XAxis>
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--on-surface, #1d1d1d)' }}
            tickLine={{ stroke: 'var(--outline-variant, #e0e0e0)' }}
            domain={spec.yAxis ? [spec.yAxis.min ?? 'auto', spec.yAxis.max ?? 'auto'] : ['auto', 'auto']}
          >
            {spec.yAxis?.label && <Label value={spec.yAxis.unit ? `${spec.yAxis.label} (${spec.yAxis.unit})` : spec.yAxis.label} angle={-90} position="insideLeft" style={{ fontSize: 12, fill: 'var(--on-surface-variant, #666)' }} />}
          </YAxis>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface, #fff)',
              border: '1px solid var(--outline-variant, #e0e0e0)',
              borderRadius: 8,
              fontSize: 13
            }}
          />
          {spec.legend !== false && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
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
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </div>
  )
}
