'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task1ChartSpec, Task1ProcessSpec, Task1MapSpec, Task1ChartRenderer } from '@/lib/task1-chart-schema'
import { resolveChartRenderer } from '@/lib/task1-chart-schema'
import { LineChartQuestion } from './LineChartQuestion'
import { BarChartQuestion } from './BarChartQuestion'
import { PieChartQuestion } from './PieChartQuestion'
import { TableQuestion } from './TableQuestion'
import { MixedChartQuestion } from './MixedChartQuestion'
import { ProcessDiagramQuestion } from './ProcessDiagramQuestion'
import { MapQuestion } from './MapQuestion'

type Task1VisualProps = {
  chartType: string
  chartSpec?: Task1ChartSpec
  processSpec?: Task1ProcessSpec
  mapSpec?: Task1MapSpec
  title?: string
  className?: string
}

export function Task1Visual({ chartType, chartSpec, processSpec, mapSpec, title, className }: Task1VisualProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(() => (typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.45, 600) : 600))

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const initialWidth = el.offsetWidth
    if (initialWidth > 0) setContainerWidth(initialWidth)
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width)
        }
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const renderer = resolveChartRenderer(chartType)

  if (renderer === 'process') {
    if (!processSpec) {
      return <ChartError chartType={chartType} message="流程图数据缺失" />
    }
    return (
      <div ref={containerRef} className={`task1-visual ${className ?? ''}`}>
        <ProcessDiagramQuestion spec={processSpec} />
      </div>
    )
  }

  if (renderer === 'map') {
    if (!mapSpec) {
      return <ChartError chartType={chartType} message="地图数据缺失" />
    }
    return (
      <div ref={containerRef} className={`task1-visual ${className ?? ''}`}>
        <MapQuestion spec={mapSpec} />
      </div>
    )
  }

  if (!chartSpec) {
    return <ChartError chartType={chartType} message="图表数据缺失" />
  }

  return (
    <div ref={containerRef} className={`task1-visual ${className ?? ''}`}>
      {renderer === 'line' && <LineChartQuestion spec={chartSpec} containerWidth={containerWidth} />}
      {renderer === 'bar' && <BarChartQuestion spec={chartSpec} containerWidth={containerWidth} />}
      {renderer === 'pie' && <PieChartQuestion spec={chartSpec} containerWidth={containerWidth} />}
      {renderer === 'table' && <TableQuestion spec={chartSpec} />}
      {renderer === 'mixed' && <MixedChartQuestion spec={chartSpec} containerWidth={containerWidth} />}
    </div>
  )
}

function ChartError({ chartType, message }: { chartType: string; message: string }) {
  return (
    <div className="task1-chart-error" role="alert">
      <span className="task1-chart-error-icon">!</span>
      <p className="task1-chart-error-title">图表生成失败</p>
      <p className="task1-chart-error-message">未能生成有效的{chartType}数据。{message}</p>
    </div>
  )
}
