'use client'

import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { Task1MapVisual } from './map/Task1MapVisual'

type Props = {
  spec: Task1MapSpec
}

/**
 * 地图题组件
 * 
 * 使用新的 SVG 平面图实现，替代原有的蓝色圆点节点
 */
export function MapQuestion({ spec }: Props) {
  return (
    <Task1MapVisual 
      title={spec.title}
    />
  )
}
