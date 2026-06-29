'use client'

import { useMemo } from 'react'
import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { legacyMapReadAdapter } from '@/lib/validators/mapSchema'
import { Task1MapVisual } from './map/Task1MapVisual'

type Props = {
  spec: Task1MapSpec
}

/**
 * 地图题组件
 *
 * Uses legacyMapReadAdapter to render any stored map data (including legacy v1)
 * as block-based v2 visualization. This is the ONLY allowed place for v1->v2 conversion.
 */
export function MapQuestion({ spec }: Props) {
  // Adapt legacy specs for display only - never persisted
  const displaySpec = useMemo(() => legacyMapReadAdapter(spec), [spec])

  return (
    <Task1MapVisual
      title={displaySpec.title}
      spec={displaySpec}
    />
  )
}
