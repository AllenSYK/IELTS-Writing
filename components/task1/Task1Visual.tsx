'use client'

import { Suspense, useCallback, useEffect, useRef, useState, lazy, type ReactNode } from 'react'
import type { Task1ChartSpec, Task1ProcessSpec, Task1MapSpec } from '@/lib/task1-chart-schema'
import { resolveChartRenderer } from '@/lib/task1-chart-schema'

const LineChartQuestion = lazy(() => import('./LineChartQuestion').then((m) => ({ default: m.LineChartQuestion })))
const BarChartQuestion = lazy(() => import('./BarChartQuestion').then((m) => ({ default: m.BarChartQuestion })))
const PieChartQuestion = lazy(() => import('./PieChartQuestion').then((m) => ({ default: m.PieChartQuestion })))
const TableQuestion = lazy(() => import('./TableQuestion').then((m) => ({ default: m.TableQuestion })))
const MixedChartQuestion = lazy(() => import('./MixedChartQuestion').then((m) => ({ default: m.MixedChartQuestion })))
const ProcessDiagramQuestion = lazy(() => import('./ProcessDiagramQuestion').then((m) => ({ default: m.ProcessDiagramQuestion })))
const MapQuestion = lazy(() => import('./MapQuestion').then((m) => ({ default: m.MapQuestion })))

type Task1VisualProps = {
  chartType: string
  chartSpec?: Task1ChartSpec
  processSpec?: Task1ProcessSpec
  mapSpec?: Task1MapSpec
  title?: string
  className?: string
}

export function Task1Visual({ chartType, chartSpec, processSpec, mapSpec, className }: Task1VisualProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollState, setScrollState] = useState({ hasOverflow: false, canScrollLeft: false, canScrollRight: false })
  const renderer = resolveChartRenderer(chartType)

  const measure = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const container = containerRef.current
      const scrollRegion = scrollRef.current
      if (!container || !scrollRegion) return

      const width = container.getBoundingClientRect().width
      const hasOverflow = scrollRegion.scrollWidth > scrollRegion.clientWidth + 1
      const canScrollLeft = hasOverflow && scrollRegion.scrollLeft > 1
      const canScrollRight = hasOverflow
        && scrollRegion.scrollLeft + scrollRegion.clientWidth < scrollRegion.scrollWidth - 1

      setContainerWidth((current) => Math.abs(current - width) > 0.5 ? width : current)
      setScrollState((current) => (
        current.hasOverflow === hasOverflow
        && current.canScrollLeft === canScrollLeft
        && current.canScrollRight === canScrollRight
          ? current
          : { hasOverflow, canScrollLeft, canScrollRight }
      ))
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const scrollRegion = scrollRef.current
    const content = contentRef.current
    if (!container || !scrollRegion || !content) return

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(scrollRegion)
    observer.observe(content)
    scrollRegion.addEventListener('scroll', measure, { passive: true })
    measure()

    return () => {
      observer.disconnect()
      scrollRegion.removeEventListener('scroll', measure)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [measure, renderer])

  const chartFallback = <div className="task1-visual-loading" aria-hidden="true" />

  if (renderer === 'process') {
    if (!processSpec) {
      return <ChartError chartType={chartType} message="流程图数据缺失" />
    }
    return renderVisual(<Suspense fallback={chartFallback}><ProcessDiagramQuestion spec={processSpec} /></Suspense>)
  }

  if (renderer === 'map') {
    if (!mapSpec) {
      return <ChartError chartType={chartType} message="地图数据缺失" />
    }
    return renderVisual(<Suspense fallback={chartFallback}><MapQuestion spec={mapSpec} /></Suspense>)
  }

  if (!chartSpec) {
    return <ChartError chartType={chartType} message="图表数据缺失" />
  }

  return renderVisual(
    <Suspense fallback={chartFallback}>
      {renderer === 'line' && <LineChartQuestion spec={chartSpec} />}
      {renderer === 'bar' && <BarChartQuestion spec={chartSpec} />}
      {renderer === 'pie' && <PieChartQuestion spec={chartSpec} />}
      {renderer === 'table' && <TableQuestion spec={chartSpec} />}
      {renderer === 'mixed' && <MixedChartQuestion spec={chartSpec} />}
    </Suspense>
  )

  function renderVisual(content: ReactNode) {
    const shadowClasses = [
      scrollState.canScrollLeft ? 'can-scroll-left' : '',
      scrollState.canScrollRight ? 'can-scroll-right' : ''
    ].filter(Boolean).join(' ')

    return (
      <div
        ref={containerRef}
        className={`task1-visual ${className ?? ''}`.trim()}
        data-container-width={Math.round(containerWidth)}
      >
        <div className={`task1-visual-scroll-shell ${shadowClasses}`.trim()}>
          <div
            ref={scrollRef}
            className="task1-visual-scroll-region"
            tabIndex={scrollState.hasOverflow ? 0 : -1}
            aria-label={scrollState.hasOverflow ? 'Task 1 视觉材料，可左右滑动查看完整内容' : 'Task 1 视觉材料'}
          >
            <div ref={contentRef} className="task1-visual-content" data-renderer={renderer}>
              {content}
            </div>
          </div>
        </div>
        {scrollState.hasOverflow ? (
          <p className="task1-scroll-hint" aria-hidden="true">左右滑动查看完整图表</p>
        ) : null}
      </div>
    )
  }
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
