import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateMapSchemaStrict,
  MapSchemaValidationError
} from '../lib/validators/mapSchema'
import { MAP_DATA_VERSION, type Task1MapSpec } from '../lib/task1-chart-schema'

// ────────────────────────────────────────────────────────────────
// V2 valid fixtures
// ────────────────────────────────────────────────────────────────

const validV2Spec: Task1MapSpec = {
  title: 'Test Map',
  dataVersion: 'map-v2',
  beforeLabel: 'Before',
  afterLabel: 'After',
  panels: [
    {
      id: 'panel-1',
      title: 'Before',
      features: [
        { type: 'river', x: 220, y: 0, width: 105, height: 480 },
        { type: 'road', x: 0, y: 250, width: 220, height: 4, style: 'current' },
        { type: 'housing', x: 350, y: 45, rows: 3, columns: 3 },
      ],
    },
    {
      id: 'panel-2',
      title: 'After',
      features: [
        { type: 'river', x: 220, y: 0, width: 105, height: 480 },
        { type: 'bridge', x: 220, y: 228, width: 90, height: 14 },
        { type: 'car_park', x: 25, y: 40, width: 90, height: 70, label: 'Car park' },
        { type: 'church', x: 335, y: 380, planned: true },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────
// V1 legacy fixtures (must be rejected)
// ────────────────────────────────────────────────────────────────

const legacyV1Spec = {
  title: 'Legacy Map',
  dataVersion: 'map-v1' as const,
  beforeLabel: '2005',
  afterLabel: '2025',
  features: [
    { id: 'f1', label: 'Main River', position: { x: 50, y: 30 }, change: 'unchanged' as const, description: 'A river runs north to south' },
    { id: 'f2', label: 'Old Warehouse', position: { x: 60, y: 40 }, change: 'removed' as const, description: 'Warehouse demolished' },
    { id: 'f3', label: 'New Apartments', position: { x: 60, y: 40 }, change: 'added' as const, description: 'Apartments built on warehouse site' },
  ],
}

const legacyV1SpecNoVersion = {
  title: 'Legacy Map No Version',
  beforeLabel: 'Before',
  afterLabel: 'After',
  features: [
    { id: 'f1', label: 'Forest Area', position: { x: 25, y: 25 }, change: 'unchanged' as const, description: 'Forest in the northwest' },
    { id: 'f2', label: 'New Road', position: { x: 50, y: 50 }, change: 'added' as const, description: 'Road built through the center' },
  ],
}

// ────────────────────────────────────────────────────────────────
// Mixed / invalid fixtures
// ────────────────────────────────────────────────────────────────

const mixedSchemaSpec = {
  title: 'Mixed Schema',
  dataVersion: MAP_DATA_VERSION,
  features: [
    { id: 'f1', label: 'River', position: { x: 50, y: 30 }, change: 'unchanged' as const },
  ],
  panels: [
    {
      id: 'panel-1',
      title: 'Before',
      features: [{ type: 'road' as const, x: 0, y: 240, width: 520, height: 4 }],
    },
  ],
}

const featureWithLegacyPosition = {
  title: 'Feature with Position',
  dataVersion: MAP_DATA_VERSION,
  panels: [
    {
      id: 'panel-1',
      title: 'Before',
      features: [
        { type: 'road' as const, x: 0, y: 240, width: 520, height: 4 },
        { type: 'housing' as const, x: 350, y: 45, position: { x: 50, y: 50 } },
      ],
    },
  ],
}

const v2MissingDataVersion = {
  title: 'V2 Missing Version',
  beforeLabel: 'Before',
  afterLabel: 'After',
  panels: [
    {
      id: 'panel-1',
      title: 'Before',
      features: [{ type: 'road' as const, x: 0, y: 240, width: 520, height: 4 }],
    },
  ],
}

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict - V2 input passes
// ════════════════════════════════════════════════════════════════

test('validateMapSchemaStrict accepts valid V2 schema', () => {
  const result = validateMapSchemaStrict(validV2Spec)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.equal(result.panels?.length, 2)
  assert.equal(result.panels?.[0]?.features.length, 3)
})

test('validateMapSchemaStrict is idempotent on valid V2', () => {
  const first = validateMapSchemaStrict(validV2Spec)
  const second = validateMapSchemaStrict(first)
  assert.deepEqual(first, second)
})

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict - V1 input is REJECTED (not converted)
// ════════════════════════════════════════════════════════════════

test('rejects V1 with dataVersion=map-v1', () => {
  assert.throws(
    () => validateMapSchemaStrict(legacyV1Spec),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      assert.match(err.message, /v2/)
      return true
    }
  )
})

test('rejects V1 without dataVersion', () => {
  assert.throws(
    () => validateMapSchemaStrict(legacyV1SpecNoVersion),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      return true
    }
  )
})

test('rejects mixed schema with both features.position and panels', () => {
  assert.throws(
    () => validateMapSchemaStrict(mixedSchemaSpec),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      assert.match(err.message, /legacy features\[\].position/)
      return true
    }
  )
})

test('rejects feature with legacy position field', () => {
  assert.throws(
    () => validateMapSchemaStrict(featureWithLegacyPosition),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      assert.match(err.message, /legacy position/)
      return true
    }
  )
})

test('rejects V2 without explicit dataVersion', () => {
  assert.throws(
    () => validateMapSchemaStrict(v2MissingDataVersion),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      return true
    }
  )
})

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict - structural validation
// ════════════════════════════════════════════════════════════════

test('rejects null input', () => {
  assert.throws(
    () => validateMapSchemaStrict(null),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      return true
    }
  )
})

test('rejects non-object input', () => {
  assert.throws(
    () => validateMapSchemaStrict('not an object'),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      return true
    }
  )
})

test('rejects empty panels array', () => {
  assert.throws(
    () => validateMapSchemaStrict({ title: 'Empty', dataVersion: MAP_DATA_VERSION, panels: [] }),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      assert.match(err.message, /non-empty panels/)
      return true
    }
  )
})

test('rejects panel without id', () => {
  assert.throws(
    () => validateMapSchemaStrict({
      title: 'No ID',
      dataVersion: MAP_DATA_VERSION,
      panels: [{ title: 'Before', features: [{ type: 'road', x: 0, y: 0 }] }],
    }),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      assert.match(err.message, /string id/)
      return true
    }
  )
})

test('rejects feature without type', () => {
  assert.throws(
    () => validateMapSchemaStrict({
      title: 'No Type',
      dataVersion: MAP_DATA_VERSION,
      panels: [{ id: 'p1', title: 'Before', features: [{ x: 0, y: 0 }] }],
    }),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      assert.match(err.message, /string type/)
      return true
    }
  )
})

test('rejects feature without numeric x/y', () => {
  assert.throws(
    () => validateMapSchemaStrict({
      title: 'Bad XY',
      dataVersion: MAP_DATA_VERSION,
      panels: [{ id: 'p1', title: 'Before', features: [{ type: 'road', x: 'bad', y: 0 }] }],
    }),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      assert.match(err.message, /numeric x and y/)
      return true
    }
  )
})

// ════════════════════════════════════════════════════════════════
// TEST: All V1 patterns are rejected by strict validation
// ════════════════════════════════════════════════════════════════

test('V1 input is rejected by API (not converted)', () => {
  const v1Schemas = [
    legacyV1Spec,
    legacyV1SpecNoVersion,
    mixedSchemaSpec,
    featureWithLegacyPosition,
    v2MissingDataVersion,
  ]

  for (const schema of v1Schemas) {
    assert.throws(
      () => validateMapSchemaStrict(schema),
      (err: unknown) => {
        assert.ok(err instanceof MapSchemaValidationError)
        return true
      },
      `Expected rejection for: ${(schema as { title: string }).title}`
    )
  }
})

// ════════════════════════════════════════════════════════════════
// TEST: No legacy conversion functions exist
// ════════════════════════════════════════════════════════════════

test('mapSchema module exports only validateMapSchemaStrict and MapSchemaValidationError', async () => {
  const mod = await import('../lib/validators/mapSchema')
  const exports = Object.keys(mod).sort()
  assert.deepEqual(exports, ['MapSchemaValidationError', 'validateMapSchemaStrict'])
})

test('legacyMapReadAdapter is removed', async () => {
  const mod = await import('../lib/validators/mapSchema')
  assert.equal('legacyMapReadAdapter' in mod, false, 'legacyMapReadAdapter must be removed')
})

test('ensureMapV2 alias is removed', async () => {
  const mod = await import('../lib/validators/mapSchema')
  assert.equal('ensureMapV2' in mod, false, 'ensureMapV2 alias must be removed')
})

test('legacyPointsToBlockMap is removed', async () => {
  const mod = await import('../lib/validators/mapSchema')
  assert.equal('legacyPointsToBlockMap' in mod, false, 'legacyPointsToBlockMap must be removed')
})

test('isLegacyMapSpec is removed', async () => {
  const mod = await import('../lib/validators/mapSchema')
  assert.equal('isLegacyMapSpec' in mod, false, 'isLegacyMapSpec must be removed')
})
