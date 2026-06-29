'use client'

import { MapPanel, MapLegend, DynamicMapPanel } from './MapElements'
import { Map1968 } from './Map1968'
import { MapNowFuture } from './MapNowFuture'
import type { Task1MapSpec } from '@/lib/task1-chart-schema'

/**
 * Task 1 地图可视化组件
 *
 * 替代原有的错误实现（蓝色圆点节点）
 * 使用真实的 SVG 平面图布局
 * 支持动态渲染 map-v2 数据
 */

type Task1MapVisualProps = {
  title?: string
  className?: string
  spec?: Task1MapSpec
}

export function Task1MapVisual({ title, className = '', spec }: Task1MapVisualProps) {
  // If we have spec with panels, render dynamically
  if (spec?.panels && spec.panels.length > 0) {
    return (
      <section className={`task1-map-visual ${className}`} data-chart-type="map">
        {title && (
          <header className="task1-map-header">
            <h3 className="task1-map-title">{title}</h3>
          </header>
        )}

        <div className="task1-map-grid">
          {spec.panels.map((panel, index) => (
            <div key={panel.id} style={{ display: 'contents' }}>
              {index > 0 && (
                <div className="map-change-arrow" aria-hidden="true">
                  <svg viewBox="0 0 40 30" width="40" height="30">
                    <path
                      d="M5 15 L30 15 M25 10 L30 15 L25 20"
                      stroke="var(--on-surface, #1d1d1d)"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </div>
              )}
              <MapPanel title={panel.title}>
                <DynamicMapPanel features={panel.features} />
              </MapPanel>
            </div>
          ))}
        </div>

        <MapLegend />
      </section>
    )
  }

  // Fallback: hardcoded river crossing map (for backward compatibility)
  return (
    <section className={`task1-map-visual ${className}`} data-chart-type="map">
      {title && (
        <header className="task1-map-header">
          <h3 className="task1-map-title">{title}</h3>
        </header>
      )}

      <div className="task1-map-grid">
        <MapPanel title="1968">
          <Map1968 />
        </MapPanel>

        <div className="map-change-arrow" aria-hidden="true">
          <svg viewBox="0 0 40 30" width="40" height="30">
            <path
              d="M5 15 L30 15 M25 10 L30 15 L25 20"
              stroke="var(--on-surface, #1d1d1d)"
              strokeWidth="2"
              fill="none"
            />
          </svg>
        </div>

        <MapPanel title="Now and Future">
          <MapNowFuture />
        </MapPanel>
      </div>

      <MapLegend />
    </section>
  )
}

// 导出子组件供单独使用
export { MapPanel, MapLegend, Map1968, MapNowFuture }
