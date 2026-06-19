import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationDirectory = path.join(root, 'supabase', 'migrations')
const migrationName = fs
  .readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_reconcile_admin_portal_schema.sql'))
  .sort()
  .at(-1)

assert.ok(migrationName, 'Missing reconcile_admin_portal_schema migration')

const migration = fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8')
const settingsRoute = fs.readFileSync(path.join(root, 'app', 'api', 'admin', 'settings', 'route.ts'), 'utf8')

const requiredColumns = {
  admin_settings: ['id', 'setting_key', 'setting_value', 'description', 'created_at', 'updated_at'],
  profiles: ['id', 'email', 'role', 'license_status', 'license_expires_at', 'created_at', 'updated_at'],
  license_codes: [
    'id',
    'code_hash',
    'code_value',
    'code_prefix',
    'plan',
    'duration_days',
    'max_activations',
    'activation_count',
    'status',
    'expires_at',
    'created_by',
    'created_at',
    'updated_at',
    'note'
  ],
  license_activations: [
    'id',
    'license_id',
    'user_id',
    'email',
    'activated_at',
    'expires_at',
    'status',
    'last_used_at',
    'revoked_at',
    'revoked_reason',
    'created_at'
  ],
  usage_records: ['id', 'user_id', 'license_id', 'success', 'created_at']
}

for (const [table, columns] of Object.entries(requiredColumns)) {
  assert.match(migration, new RegExp(`public\\.${table}\\b`), `Migration does not reconcile ${table}`)
  for (const column of columns) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `Migration is missing ${table}.${column}`)
  }
}

assert.match(migration, /foreign key \(license_id\)[\s\S]*references public\.license_codes\(id\)/i)
assert.match(migration, /not valid/i)
assert.match(migration, /create unique index if not exists admin_settings_id_reconcile_uidx/i)
assert.doesNotMatch(migration, /\badmin_settings\s*\([^)]*\bvalue\b/i)
assert.doesNotMatch(migration, /\bset\s+value\s*=/i)

assert.match(settingsRoute, /setting_value/)
assert.doesNotMatch(settingsRoute, /\.select\(['"`]value(?:,|['"`])/)
assert.doesNotMatch(settingsRoute, /\.update\(\{\s*value\s*:/)
assert.doesNotMatch(settingsRoute, /\.upsert\(\{[^}]*\bvalue\s*:/s)

const apiContracts = {
  'app/api/admin/licenses/route.ts': [
    'code_value',
    'code_prefix',
    'plan',
    'duration_days',
    'max_activations',
    'activation_count',
    'status',
    'expires_at',
    'note',
    'created_by',
    'created_at',
    'updated_at',
    'revoked_reason'
  ],
  'app/api/admin/licenses/[id]/route.ts': [
    'code_value',
    'code_prefix',
    'duration_days',
    'max_activations',
    'activation_count',
    'revoked_at',
    'revoked_reason'
  ],
  'app/api/admin/bindings/route.ts': [
    'license_id',
    'user_id',
    'email',
    'activated_at',
    'expires_at',
    'status',
    'last_used_at',
    'revoked_at',
    'revoked_reason',
    'code_value',
    'code_prefix',
    'duration_days'
  ],
  'app/api/admin/bindings/[id]/route.ts': [
    'license_id',
    'user_id',
    'email',
    'activated_at',
    'expires_at',
    'last_used_at',
    'revoked_at',
    'revoked_reason',
    'max_activations',
    'activation_count'
  ],
  'app/api/admin/overview/route.ts': [
    'license_id',
    'user_id',
    'activation_count',
    'max_activations',
    'revoked_reason',
    'license_status'
  ],
  'app/api/admin/users/list/route.ts': [
    'user_id',
    'email',
    'role',
    'license_status',
    'license_expires_at',
    'activated_at',
    'expires_at',
    'last_used_at',
    'revoked_reason',
    'code_value',
    'code_prefix',
    'success'
  ],
  'app/api/admin/users/[id]/route.ts': [
    'license_id',
    'email',
    'role',
    'license_status',
    'license_expires_at',
    'activated_at',
    'expires_at',
    'last_used_at',
    'revoked_at',
    'revoked_reason',
    'code_value',
    'code_prefix'
  ]
}

for (const [relativePath, fields] of Object.entries(apiContracts)) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  for (const field of fields) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `${relativePath} no longer references ${field}`)
    assert.match(migration, new RegExp(`\\b${field}\\b`), `Migration does not provide API field ${field}`)
  }
}

process.stdout.write(`Static migration check passed: ${migrationName}\n`)
