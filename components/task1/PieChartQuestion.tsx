'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Task1ChartSpec } from '@/lib/task1-chart-schema'

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be185d', '#4f46e5']

type Props = {
  spec: Task1ChartSpec
  containerWidth: number
}

export function PieChartQuestion({ spec, containerWidth }: Props) {
  const data = useMemo(() => {
    if (!spec.pieData) return []
    return spec.pieData.map(d => ({
      name: d.label,
      value: d.value
    }))
  }, [spec])

  if (!spec.pieData || data.length === 0) {
    return <div className="task1-chart-empty">饼图数据不完整</div>
  }

  const chartHeight = Math.max(280, Math.min(400, containerWidth * 0.5))

  return (
    <div className="task1-chart-wrapper">
      {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
      {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ percent }) => percent !== undefined && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : null}
            outerRadius={Math.min(chartHeight * 0.35, 120)}
            dataKey="value"
            stroke="var(--surface, #fff)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
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
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 12, paddingLeft: 16 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </div>
  )
}
