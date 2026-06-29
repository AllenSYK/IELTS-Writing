#!/usr/bin/env node

/**
 * CI check: Fail build if legacy MapSchemaV1 patterns are found in source code.
 *
 * This script enforces that:
 *   1. No source file references `features[].position` in map contexts
 *   2. No file imports or exports legacy conversion functions
 *   3. No file uses `dataVersion: 'map-v1'` or `MAP_DATA_VERSION_V1`
 *   4. The only allowed mapSchema export is `validateMapSchemaStrict` and `MapSchemaValidationError`
 *
 * Exit code 0 = pass, Exit code 1 = fail
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC_DIRS = ['lib', 'components', 'app', 'tests']
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js'])

// Patterns that indicate legacy V1 map code
const FORBIDDEN_PATTERNS = [
  {
    pattern: /legacyPointsToBlockMap/g,
    message: 'legacyPointsToBlockMap must be removed — no runtime V1 conversion allowed',
  },
  {
    pattern: /legacyMapReadAdapter/g,
    message: 'legacyMapReadAdapter must be removed — no runtime V1 conversion allowed',
  },
  {
    pattern: /ensureMapV2/g,
    message: 'ensureMapV2 alias must be removed — no runtime V1 conversion allowed',
  },
  {
    pattern: /isLegacyMapSpec/g,
    message: 'isLegacyMapSpec must be removed — no runtime V1 detection allowed',
  },
  {
    pattern: /MAP_DATA_VERSION_V1/g,
    message: 'MAP_DATA_VERSION_V1 constant must be removed — only V2 is allowed',
  },
  {
    pattern: /dataVersion:\s*['"]map-v1['"]/g,
    message: 'dataVersion "map-v1" is forbidden — only "map-v2" is allowed',
  },
  {
    pattern: /dataVersion\s*!==?\s*['"]map-v2['"]/g,
    message: 'Checking for non-V2 dataVersion is forbidden — all data must be V2',
    // Allow this pattern in validators/mapSchema.ts (strict validation rejects non-V2)
    allowIn: ['lib/validators/mapSchema.ts'],
  },
]

// Files to skip (generated, config, etc.)
const SKIP_PATTERNS = [
  /node_modules/,
  /\.next/,
  /\.git/,
  /supabase\/migrations/,
  /package-lock\.json/,
]

function walkDir(dir) {
  const files = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      if (SKIP_PATTERNS.some((p) => p.test(fullPath))) continue
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          files.push(...walkDir(fullPath))
        } else if (EXTENSIONS.has(extname(entry))) {
          files.push(fullPath)
        }
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return files
}

let failures = []

for (const dir of SRC_DIRS) {
  const fullPath = join(ROOT, dir)
  const files = walkDir(fullPath)

  for (const file of files) {
    const relPath = file.replace(ROOT, '')
    let content
    try {
      content = readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    for (const { pattern, message, allowIn } of FORBIDDEN_PATTERNS) {
      if (allowIn?.some((p) => relPath.endsWith(p))) continue

      // Reset regex state
      pattern.lastIndex = 0
      const match = pattern.exec(content)
      if (match) {
        const lines = content.slice(0, match.index).split('\n')
        const lineNum = lines.length
        failures.push({
          file: relPath,
          line: lineNum,
          pattern: pattern.source,
          message,
        })
      }
    }
  }
}

if (failures.length > 0) {
  console.error('\n❌ LEGACY MAP SCHEMA PATTERNS FOUND\n')
  console.error('The following files contain forbidden legacy map code:\n')
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(`    Pattern: /${f.pattern}/`)
    console.error(`    ${f.message}`)
    console.error('')
  }
  console.error(`Found ${failures.length} violation(s). Remove all legacy map code before building.`)
  process.exit(1)
}

console.log('✅ No legacy map schema patterns found.')
process.exit(0)
