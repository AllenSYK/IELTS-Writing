'use client'

import type { Task1ChartSpec, Task1StandaloneChartSpec } from '@/lib/task1-chart-schema'
import { BarChartQuestion } from './BarChartQuestion'
import { LineChartQuestion } from './LineChartQuestion'
import { PieChartQuestion } from './PieChartQuestion'
import { TableQuestion } from './TableQuestion'

type Props = {
  spec: Task1ChartSpec
}

function toChartSpec(chart: Task1StandaloneChartSpec): Task1ChartSpec {
  return {
    kind: chart.chartType,
    title: chart.title,
    subtitle: chart.subtitle,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    series: chart.series,
    pieData: chart.pieData,
    tableData: chart.tableData,
    legend: chart.legend,
    source: chart.source
  }
}

function MixedChartPanel({ chart }: { chart: Task1StandaloneChartSpec }) {
  const childSpec = toChartSpec(chart)
  return (
    <section className="task1-mixed-panel" data-chart-type={chart.chartType}>
      {chart.chartType === 'bar' && <BarChartQuestion spec={childSpec} />}
      {chart.chartType === 'line' && <LineChartQuestion spec={childSpec} />}
      {chart.chartType === 'pie' && <PieChartQuestion spec={childSpec} />}
      {chart.chartType === 'table' && <TableQuestion spec={childSpec} />}
    </section>
  )
}

export function MixedChartQuestion({ spec }: Props) {
  if (!spec.charts || spec.charts.length < 2) {
    return <div className="task1-chart-empty">组合图数据不完整</div>
  }

  return (
    <section className="task1-chart-wrapper task1-mixed-chart" data-testid="mixed-chart" data-chart-type="mixed">
      {(spec.title || spec.subtitle) && (
        <header className="task1-chart-heading">
          {spec.title && <h3 className="task1-chart-title">{spec.title}</h3>}
          {spec.subtitle && <p className="task1-chart-subtitle">{spec.subtitle}</p>}
        </header>
      )}
      <div className="task1-mixed-grid">
        {spec.charts.map((chart, index) => (
          <MixedChartPanel key={`${chart.chartType}-${chart.title || index}`} chart={chart} />
        ))}
      </div>
      {spec.source && <p className="task1-chart-source">{spec.source}</p>}
    </section>
  )
}
