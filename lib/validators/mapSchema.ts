import type { Task1MapSpec } from '@/lib/task1-chart-schema'
import { MAP_DATA_VERSION } from '@/lib/task1-chart-schema'

/**
 * Strict validation for MapSchema at write-time (API/DB boundaries).
 *
 * RULE: Only MapSchemaV2 is accepted. V1 and mixed schemas are REJECTED.
 * This function NEVER converts or migrates - it only validates.
 *
 * @throws MapSchemaValidationError with code 'INVALID_MAP_SCHEMA_VERSION' if not V2
 * @throws MapSchemaValidationError with code 'INVALID_MAP_SCHEMA' if structure is invalid
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
