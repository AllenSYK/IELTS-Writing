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
 *
 * @deprecated Only for UI read adapter. Never use in API/DB write paths.
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

  function convertFeature(f: NonNullable<typeof features>[number], _index: number): MapFeatureV2 {
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
 * Strict validation for MapSchema at write-time (API/DB boundaries).
 *
 * RULE: Only MapSchemaV2 is accepted. V1 and mixed schemas are REJECTED.
 * This function NEVER converts or migrates - it only validates.
 *
 * @throws Error with code 'INVALID_MAP_SCHEMA_VERSION' if not V2
 * @throws Error with code 'INVALID_MAP_SCHEMA' if structure is invalid
 */
export function validateMapSchemaStrict(spec: unknown): Task1MapSpec {
  if (!spec || typeof spec !== 'object') {
    throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Map spec must be an object')
  }

  const s = spec as Record<string, unknown>

  // Must have dataVersion = 'map-v2'
  if (s.dataVersion !== MAP_DATA_VERSION) {
    throw new MapSchemaValidationError(
      'INVALID_MAP_SCHEMA_VERSION',
      `Map schema must be v2 (got: ${String(s.dataVersion ?? 'undefined')}). Legacy v1 format is not allowed.`
    )
  }

  // Must have panels array
  if (!Array.isArray(s.panels) || s.panels.length === 0) {
    throw new MapSchemaValidationError(
      'INVALID_MAP_SCHEMA',
      'Map schema v2 requires non-empty panels[] array'
    )
  }

  // Must NOT have legacy features with position
  if (Array.isArray(s.features) && s.features.length > 0) {
    const hasLegacyPosition = s.features.some(
      (f: unknown) => f && typeof f === 'object' && 'position' in (f as Record<string, unknown>)
    )
    if (hasLegacyPosition) {
      throw new MapSchemaValidationError(
        'INVALID_MAP_SCHEMA_VERSION',
        'Map schema must not contain legacy features[].position data'
      )
    }
  }

  // Validate each panel
  for (const panel of s.panels) {
    if (!panel || typeof panel !== 'object') {
      throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Each panel must be an object')
    }
    const p = panel as Record<string, unknown>
    if (typeof p.id !== 'string' || !p.id) {
      throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Panel must have a string id')
    }
    if (typeof p.title !== 'string' || !p.title) {
      throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Panel must have a string title')
    }
    if (!Array.isArray(p.features)) {
      throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Panel must have a features[] array')
    }

    // Validate each feature in panel
    for (const feature of p.features) {
      if (!feature || typeof feature !== 'object') {
        throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Each feature must be an object')
      }
      const f = feature as Record<string, unknown>
      if (typeof f.type !== 'string' || !f.type) {
        throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Feature must have a string type')
      }
      if (typeof f.x !== 'number' || typeof f.y !== 'number') {
        throw new MapSchemaValidationError('INVALID_MAP_SCHEMA', 'Feature must have numeric x and y')
      }
      // Reject if feature has legacy position field
      if ('position' in f) {
        throw new MapSchemaValidationError(
          'INVALID_MAP_SCHEMA_VERSION',
          'Feature must not contain legacy position field'
        )
      }
    }
  }

  // Return typed spec (we've validated it's V2)
  return spec as Task1MapSpec
}

/**
 * Custom error class for map schema validation failures.
 * Provides a machine-readable code for API responses.
 */
export class MapSchemaValidationError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'MapSchemaValidationError'
    this.code = code
  }
}

/**
 * Legacy read adapter for UI rendering only.
 *
 * Converts any map spec (v1 or v2) to v2 format for display purposes.
 * This is the ONLY place where v1->v2 conversion is allowed.
 *
 * NEVER use this in API or DB write paths - use validateMapSchemaStrict() instead.
 *
 * @deprecated Only for backward-compatible UI rendering of old stored data
 */
export function legacyMapReadAdapter(spec: Task1MapSpec): Task1MapSpec {
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

  // Legacy format - convert for display only
  return legacyPointsToBlockMap(spec)
}

// Keep old export name as alias for backward compatibility during migration
export const ensureMapV2 = legacyMapReadAdapter

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
