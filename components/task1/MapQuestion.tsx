'use client'

import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { Task1MapVisual } from './map/Task1MapVisual'

type Props = {
  spec: Task1MapSpec
}

/**
 * Map question component.
 *
 * Renders V2 block-based map data directly.
 * Legacy V1 data has been purged from the database and is rejected at all write boundaries.
 * No runtime conversion is performed — all stored data is guaranteed V2.
 */
export function MapQuestion({ spec }: Props) {
  return (
    <Task1MapVisual
      title={spec.title}
      spec={spec}
    />
  )
}
