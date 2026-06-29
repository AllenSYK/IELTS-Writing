import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateMapSchemaStrict,
  MapSchemaValidationError,
  legacyMapReadAdapter,
  isLegacyMapSpec,
  legacyPointsToBlockMap
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

const validV2SpecWithMissingDataVersion: Task1MapSpec = {
  title: 'Test Map No Version',
  beforeLabel: 'Before',
  afterLabel: 'After',
  panels: [
    {
      id: 'panel-1',
      title: 'Before',
      features: [{ type: 'road', x: 0, y: 240, width: 520, height: 4 }],
    },
  ],
}

// ────────────────────────────────────────────────────────────────
// V1 legacy fixtures
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

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict - V2 input passes
// ════════════════════════════════════════════════════════════════

test('validateMapSchemaStrict accepts valid V2 schema', () => {
  const result = validateMapSchemaStrict(validV2Spec)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.equal(result.panels?.length, 2)
  assert.equal(result.panels?.[0]?.features.length, 3)
})

test('validateMapSchemaStrict rejects V1 with dataVersion=map-v1', () => {
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

test('validateMapSchemaStrict rejects V1 without dataVersion', () => {
  assert.throws(
    () => validateMapSchemaStrict(legacyV1SpecNoVersion),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      return true
    }
  )
})

test('validateMapSchemaStrict rejects mixed schema with both features.position and panels', () => {
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

test('validateMapSchemaStrict rejects feature with legacy position field', () => {
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

test('validateMapSchemaStrict rejects null input', () => {
  assert.throws(
    () => validateMapSchemaStrict(null),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      return true
    }
  )
})

test('validateMapSchemaStrict rejects non-object input', () => {
  assert.throws(
    () => validateMapSchemaStrict('not an object'),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA')
      return true
    }
  )
})

test('validateMapSchemaStrict rejects empty panels array', () => {
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

test('validateMapSchemaStrict rejects panel without id', () => {
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

test('validateMapSchemaStrict rejects feature without type', () => {
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

test('validateMapSchemaStrict rejects feature without numeric x/y', () => {
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
// TEST: legacyMapReadAdapter converts V1 for display
// ════════════════════════════════════════════════════════════════

test('legacyMapReadAdapter passes through valid V2 unchanged', () => {
  const result = legacyMapReadAdapter(validV2Spec)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.equal(result.panels?.length, 2)
})

test('legacyMapReadAdapter adds dataVersion to V2 spec missing it', () => {
  const result = legacyMapReadAdapter(validV2SpecWithMissingDataVersion)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.equal(result.panels?.length, 1)
})

test('legacyMapReadAdapter converts V1 to V2 for display', () => {
  const result = legacyMapReadAdapter(legacyV1Spec as Task1MapSpec)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.ok(result.panels && result.panels.length > 0)
  // Should have before/after panels
  assert.equal(result.panels.length, 2)
  assert.equal(result.panels[0].title, '2005')
  assert.equal(result.panels[1].title, '2025')
  // Each panel should have features
  assert.ok(result.panels[0].features.length > 0)
  assert.ok(result.panels[1].features.length > 0)
  // Features should have type, x, y (not legacy position)
  for (const panel of result.panels) {
    for (const feature of panel.features) {
      assert.ok(typeof feature.type === 'string')
      assert.ok(typeof feature.x === 'number')
      assert.ok(typeof feature.y === 'number')
      assert.ok(!('position' in feature))
    }
  }
})

test('legacyMapReadAdapter converts V1 with no dataVersion', () => {
  const result = legacyMapReadAdapter(legacyV1SpecNoVersion as Task1MapSpec)
  assert.equal(result.dataVersion, MAP_DATA_VERSION)
  assert.ok(result.panels && result.panels.length > 0)
})

// ════════════════════════════════════════════════════════════════
// TEST: isLegacyMapSpec detection
// ════════════════════════════════════════════════════════════════

test('isLegacyMapSpec returns false for V2 schema', () => {
  assert.equal(isLegacyMapSpec(validV2Spec), false)
})

test('isLegacyMapSpec returns true for V1 with dataVersion=map-v1', () => {
  assert.equal(isLegacyMapSpec(legacyV1Spec as Task1MapSpec), true)
})

test('isLegacyMapSpec returns true for V1 without dataVersion', () => {
  assert.equal(isLegacyMapSpec(legacyV1SpecNoVersion as Task1MapSpec), true)
})

test('isLegacyMapSpec returns false for V2 missing dataVersion but with panels', () => {
  assert.equal(isLegacyMapSpec(validV2SpecWithMissingDataVersion), false)
})

// ════════════════════════════════════════════════════════════════
// TEST: Round-trip - V1 adapter output passes strict validation
// ════════════════════════════════════════════════════════════════

test('legacyMapReadAdapter output passes validateMapSchemaStrict', () => {
  const adapted = legacyMapReadAdapter(legacyV1Spec as Task1MapSpec)
  // The adapted output should be valid V2
  assert.doesNotThrow(() => validateMapSchemaStrict(adapted))
})

test('legacyPointsToBlockMap output passes validateMapSchemaStrict', () => {
  const converted = legacyPointsToBlockMap(legacyV1Spec as Task1MapSpec)
  assert.doesNotThrow(() => validateMapSchemaStrict(converted))
})

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict is idempotent on valid V2
// ════════════════════════════════════════════════════════════════

test('validateMapSchemaStrict is idempotent on valid V2', () => {
  const first = validateMapSchemaStrict(validV2Spec)
  const second = validateMapSchemaStrict(first)
  assert.deepEqual(first, second)
})

// ════════════════════════════════════════════════════════════════
// TEST: validateMapSchemaStrict rejects all V1 patterns
// ════════════════════════════════════════════════════════════════

test('V1 input is rejected by API (not converted)', () => {
  // V1 schemas must never pass strict validation
  const v1Schemas = [
    legacyV1Spec,
    legacyV1SpecNoVersion,
    mixedSchemaSpec,
    featureWithLegacyPosition,
  ]

  for (const schema of v1Schemas) {
    assert.throws(
      () => validateMapSchemaStrict(schema),
      (err: unknown) => {
        assert.ok(err instanceof MapSchemaValidationError)
        return true
      },
      `Expected rejection for: ${schema.title}`
    )
  }
})

test('V2 input passes strict validation', () => {
  // Only fully valid V2 specs pass strict validation
  assert.doesNotThrow(
    () => validateMapSchemaStrict(validV2Spec),
    `Expected pass for: ${validV2Spec.title}`
  )
})

test('V2 without dataVersion is rejected by strict validation', () => {
  // Specs without explicit dataVersion are rejected at write boundary
  // They can still be read via legacyMapReadAdapter for display
  assert.throws(
    () => validateMapSchemaStrict(validV2SpecWithMissingDataVersion),
    (err: unknown) => {
      assert.ok(err instanceof MapSchemaValidationError)
      assert.equal(err.code, 'INVALID_MAP_SCHEMA_VERSION')
      return true
    }
  )
})
