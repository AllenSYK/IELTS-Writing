'use client'

import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { Task1MapVisual } from './map/Task1MapVisual'
import { AlertTriangle } from 'lucide-react'

type Props = {
  spec: Task1MapSpec
}

/**
 * 检测是否为旧版地图数据格式（map-v1）
 * 
 * 旧格式特征：
 * - 有 features 数组
 * - features 包含 position: {x, y}
 * - 没有 dataVersion 或 dataVersion === 'map-v1'
 * - 没有 panels 数组
 */
function isLegacyMapSpec(spec: Task1MapSpec): boolean {
  // 如果明确标记为 map-v2，则不是旧格式
  if (spec.dataVersion === 'map-v2') return false
  
  // 如果有 panels 数组，说明是新格式
  if (spec.panels && spec.panels.length > 0) return false
  
  // 如果有 features 数组且包含 position，说明是旧格式
  if (spec.features && spec.features.length > 0) {
    const hasPosition = spec.features.some(f => f.position && typeof f.position.x === 'number')
    if (hasPosition) return true
  }
  
  return false
}

/**
 * 旧地图格式提示组件
 */
function LegacyMapNotice({ sourceImageUrl }: { sourceImageUrl?: string }) {
  return (
    <div className="task1-map-legacy-notice">
      <div className="task1-map-legacy-icon">
        <AlertTriangle size={24} />
      </div>
      <h4>旧版地图数据</h4>
      <p>此题目使用旧版地图格式，暂不支持新版可视化。</p>
      {sourceImageUrl ? (
        <a 
          href={sourceImageUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="task1-map-legacy-link"
        >
          查看原始图片
        </a>
      ) : (
        <p className="task1-map-legacy-hint">请联系管理员更新此题目。</p>
      )}
    </div>
  )
}

/**
 * 地图题组件
 * 
 * 使用新的 SVG 平面图实现，替代原有的蓝色圆点节点
 * 支持 map-v1（旧格式，显示迁移提示）和 map-v2（新格式，显示完整地图）
 */
export function MapQuestion({ spec }: Props) {
  // 检测旧格式
  if (isLegacyMapSpec(spec)) {
    return <LegacyMapNotice />
  }
  
  // 新格式，显示完整地图
  return (
    <Task1MapVisual 
      title={spec.title}
    />
  )
}
