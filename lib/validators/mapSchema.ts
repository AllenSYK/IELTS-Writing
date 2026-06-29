import type { Task1MapSpec, MapPanel, MapFeatureV2 } from '@/lib/task1-chart-schema'
import { MAP_DATA_VERSION } from '@/lib/task1-chart-schema'

/**
 * Convert legacy point-based map features (map-v1) to structured block format (map-v2).
 *
 * Legacy format has features with:
 *   { id, label, position: {x, y}, change?, description? }
 *
 * V2 format requires panels with:
 *   { id, title, features: [{ type, x, y, width?, height?, ... }] }
 *
 * This transformer creates a best-effort block layout from point positions.
 */
export function legacyPointsToBlockMap(spec: Task1MapSpec): Task1MapSpec {
  // Already v2 with panels
  if (spec.dataVersion === MAP_DATA_VERSION && spec.panels && spec.panels.length > 0) {
    return spec
  }

  // No legacy features to convert
  const features = spec.features
  if (!features || features.length === 0) {
    // Return a minimal valid v2 spec
    return {
      ...spec,
      dataVersion: MAP_DATA_VERSION,
      panels: spec.panels ?? [],
    }
  }

  // At this point, features is guaranteed to be non-empty
  const legacyFeatures = features

  // Group features by change type to split into before/after panels
  const beforeFeatures = legacyFeatures.filter(
    (f) => f.change !== 'added'
  )
  const afterFeatures = legacyFeatures.filter(
    (f) => f.change !== 'removed'
  )

  function convertFeature(f: NonNullable<typeof features>[number], index: number): MapFeatureV2 {
    const label = (f.label || '').toLowerCase()
    const desc = (f.description || '').toLowerCase()
    const combined = `${label} ${desc}`

    // Detect feature type from label/description
    let type: MapFeatureV2['type'] = 'building_row'
    let extra: Partial<MapFeatureV2> = {}

    if (combined.includes('river') || combined.includes('water')) {
      type = 'river'
      extra = {
        path: `M${f.position.x * 5} 0 C${f.position.x * 5 - 15} 80 ${f.position.x * 5 + 15} 200 ${f.position.x * 5 - 10} 400 L${f.position.x * 5 + 90} 400 C${f.position.x * 5 + 105} 200 ${f.position.x * 5 + 80} 80 ${f.position.x * 5 + 95} 0 Z`,
        width: 100,
        height: 480,
      }
    } else if (combined.includes('road') || combined.includes('street') || combined.includes('highway')) {
      type = 'road'
      extra = {
        width: 520,
        height: 4,
        style: f.change === 'added' ? 'future' : 'current',
      }
    } else if (combined.includes('bridge')) {
      type = 'bridge'
      extra = { width: 90, height: 14 }
    } else if (combined.includes('forest') || combined.includes('wood') || combined.includes('tree')) {
      type = 'forest'
      extra = { width: 120, height: 100, treeCount: 6 }
    } else if (combined.includes('house') || combined.includes('housing') || combined.includes('residential')) {
      type = 'housing'
      extra = { rows: 2, columns: 3 }
    } else if (combined.includes('car park') || combined.includes('parking') || combined.includes('car_park')) {
      type = 'car_park'
      extra = {
        width: 100,
        height: 70,
        label: f.label,
        planned: f.change === 'added',
      }
    } else if (combined.includes('building') || combined.includes('warehouse') || combined.includes('commercial')) {
      type = 'building_row'
      extra = { rows: 2, columns: 4, units: 4 }
    } else if (combined.includes('church') || combined.includes('temple') || combined.includes('religious')) {
      type = 'church'
      extra = { planned: f.change === 'added' }
    } else if (combined.includes('path') || combined.includes('footpath') || combined.includes('walkway')) {
      type = 'footpath'
      extra = {
        path: `M${f.position.x * 5} ${f.position.y * 4.8} C${f.position.x * 5 + 50} ${f.position.y * 4.8 + 20} ${f.position.x * 5 + 100} ${f.position.y * 4.8 + 40} ${f.position.x * 5 + 150} ${f.position.y * 4.8 + 60}`,
        style: f.change === 'added' ? 'future' : 'current',
      }
    } else if (combined.includes('ferry') || combined.includes('dock') || combined.includes('port') || combined.includes('harbour') || combined.includes('harbor')) {
      type = 'ferry'
      extra = { width: 25, height: 30 }
    } else if (combined.includes('park') || combined.includes('garden') || combined.includes('green') || combined.includes('recreation')) {
      type = 'forest'
      extra = { width: 100, height: 80, treeCount: 4 }
    } else if (combined.includes('school') || combined.includes('university') || combined.includes('college') || combined.includes('library')) {
      type = 'building_row'
      extra = { rows: 1, columns: 3, units: 3 }
    } else if (combined.includes('shop') || combined.includes('store') || combined.includes('mall') || combined.includes('market') || combined.includes('commercial')) {
      type = 'building_row'
      extra = { rows: 2, columns: 5, units: 5 }
    } else if (combined.includes('sport') || combined.includes('stadium') || combined.includes('gym') || combined.includes('field')) {
      type = 'car_park'
      extra = { width: 120, height: 90, label: f.label }
    } else if (combined.includes('hospital') || combined.includes('clinic') || combined.includes('medical')) {
      type = 'building_row'
      extra = { rows: 1, columns: 2, units: 2 }
    } else if (combined.includes('factory') || combined.includes('industrial') || combined.includes('plant')) {
      type = 'building_row'
      extra = { rows: 1, columns: 3, units: 3 }
    } else if (combined.includes('hotel') || combined.includes('motel') || combined.includes('accommodation')) {
      type = 'building_row'
      extra = { rows: 1, columns: 4, units: 4 }
    } else if (combined.includes('restaurant') || combined.includes('cafe') || combined.includes('food')) {
      type = 'building_row'
      extra = { rows: 1, columns: 2, units: 2 }
    } else if (combined.includes('office') || combined.includes('commercial')) {
      type = 'building_row'
      extra = { rows: 2, columns: 3, units: 3 }
    } else if (combined.includes('cinema') || combined.includes('theater') || combined.includes('theatre') || combined.includes('entertainment')) {
      type = 'building_row'
      extra = { rows: 1, columns: 2, units: 2 }
    } else if (combined.includes('supermarket') || combined.includes('grocery')) {
      type = 'building_row'
      extra = { rows: 1, columns: 3, units: 3 }
    } else if (combined.includes('gas') || combined.includes('petrol') || combined.includes('fuel')) {
      type = 'car_park'
      extra = { width: 60, height: 40, label: f.label }
    } else if (combined.includes('playground') || combined.includes('play')) {
      type = 'forest'
      extra = { width: 80, height: 60, treeCount: 3 }
    }

    // Convert percentage position (0-100) to pixel position (0-520 x 0-480)
    const x = Math.round(f.position.x * 5.2)
    const y = Math.round(f.position.y * 4.8)

    return {
      type,
      x,
      y,
      ...extra,
    }
  }

  const beforePanel: MapPanel = {
    id: 'panel-before',
    title: spec.beforeLabel || 'Before',
    features: beforeFeatures.map((f, i) => convertFeature(f, i)),
  }

  const afterPanel: MapPanel = {
    id: 'panel-after',
    title: spec.afterLabel || 'After',
    features: afterFeatures.map((f, i) => convertFeature(f, i)),
  }

  // If we ended up with empty panels, add at least one feature each
  if (beforePanel.features.length === 0) {
    beforePanel.features = [{ type: 'road', x: 0, y: 240, width: 520, height: 4, style: 'current' }]
  }
  if (afterPanel.features.length === 0) {
    afterPanel.features = [{ type: 'road', x: 0, y: 240, width: 520, height: 4, style: 'current' }]
  }

  return {
    title: spec.title,
    dataVersion: MAP_DATA_VERSION,
    beforeLabel: spec.beforeLabel || 'Before',
    afterLabel: spec.afterLabel || 'After',
    panels: [beforePanel, afterPanel],
    legend: spec.legend,
  }
}

/**
 * Ensure a map spec is in v2 format. Auto-converts legacy formats.
 * This is the main entry point for runtime schema normalization.
 */
export function ensureMapV2(spec: Task1MapSpec): Task1MapSpec {
  // Already v2 with panels
  if (spec.dataVersion === MAP_DATA_VERSION && spec.panels && spec.panels.length > 0) {
    return spec
  }

  // Has panels but missing dataVersion
  if (spec.panels && spec.panels.length > 0) {
    return {
      ...spec,
      dataVersion: MAP_DATA_VERSION,
    }
  }

  // Legacy format - convert
  return legacyPointsToBlockMap(spec)
}

/**
 * Check if a map spec is legacy (v1) format
 */
export function isLegacyMapSpec(spec: Task1MapSpec): boolean {
  if (spec.dataVersion === MAP_DATA_VERSION) return false
  if (spec.panels && spec.panels.length > 0) return false
  if (spec.features && spec.features.length > 0) {
    return spec.features.some((f) => f.position && typeof f.position.x === 'number')
  }
  return false
}
