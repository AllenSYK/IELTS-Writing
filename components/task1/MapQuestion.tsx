'use client'

import { useMemo } from 'react'
import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { ensureMapV2 } from '@/lib/validators/mapSchema'
import { Task1MapVisual } from './map/Task1MapVisual'

type Props = {
  spec: Task1MapSpec
}

/**
 * 地图题组件
 *
 * 自动将所有地图数据转换为 v2 格式并渲染。
 * 不再显示旧版警告 UI - 所有地图都必须渲染为块状可视化。
 */
export function MapQuestion({ spec }: Props) {
  // Auto-convert any legacy spec to v2 at render time
  const v2Spec = useMemo(() => ensureMapV2(spec), [spec])

  return (
    <Task1MapVisual
      title={v2Spec.title}
      spec={v2Spec}
    />
  )
}
