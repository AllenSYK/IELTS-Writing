import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationDirectory = path.join(root, 'supabase', 'migrations')
const migrationNames = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
const reconcileName = migrationNames.find((name) => name.endsWith('_reconcile_admin_portal_schema.sql'))
const hardeningName = migrationNames.find((name) => name.endsWith('_harden_admin_mutations.sql'))

assert.ok(reconcileName, 'Missing reconcile_admin_portal_schema migration')
assert.ok(hardeningName, 'Missing harden_admin_mutations migration')

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const reconcileMigration = read(path.join('supabase', 'migrations', reconcileName))
const hardeningMigration = read(path.join('supabase', 'migrations', hardeningName))
const settingsRoute = read('app/api/admin/settings/route.ts')

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
  assert.match(reconcileMigration, new RegExp(`public\\.${table}\\b`), `Migration does not reconcile ${table}`)
  for (const column of columns) {
    assert.match(reconcileMigration, new RegExp(`\\b${column}\\b`), `Migration is missing ${table}.${column}`)
  }
}

assert.match(reconcileMigration, /foreign key \(license_id\)[\s\S]*references public\.license_codes\(id\)/i)
assert.match(reconcileMigration, /not valid/i)
assert.match(reconcileMigration, /create unique index if not exists admin_settings_id_reconcile_uidx/i)

// The reconciled settings schema uses setting_value. Accidentally writing the
// legacy value column makes saves appear successful while reads stay stale.
assert.match(settingsRoute, /\.select\(['"`]setting_value,\s*updated_at['"`]\)/)
assert.match(settingsRoute, /\bsetting_value:\s*patch\b/)
assert.match(settingsRoute, /\.eq\(['"`]updated_at['"`],\s*expectedUpdatedAt\)/)
assert.doesNotMatch(settingsRoute, /\.select\(['"`]value(?:,|['"`])/)
assert.doesNotMatch(settingsRoute, /\.(?:update|upsert)\(\{[^}]*\bvalue\s*:/s)

const requiredAtomicFunctions = [
  'admin_refresh_profile_license',
  'admin_mutate_license',
  'admin_mutate_binding',
  'get_admin_usage_summary',
  'admin_set_user_role',
  'admin_set_user_access',
  'admin_prepare_user_deletion'
]

for (const functionName of requiredAtomicFunctions) {
  assert.match(
    hardeningMigration,
    new RegExp(`create or replace function public\\.${functionName}\\b`, 'i'),
    `Missing atomic admin function ${functionName}`
  )
  assert.match(
    hardeningMigration,
    new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated`, 'i'),
    `${functionName} is not restricted from client roles`
  )
  assert.match(
    hardeningMigration,
    new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`, 'i'),
    `${functionName} is not granted to service_role`
  )
}

assert.match(hardeningMigration, /security invoker/gi)
assert.match(hardeningMigration, /for update/gi)
for (const reason of ['LICENSE_DISABLED', 'ACCOUNT_DISABLED', 'LICENSE_REVOKED', 'ACCOUNT_DELETED', 'EMAIL_UNBOUND']) {
  assert.match(hardeningMigration, new RegExp(`\\b${reason}\\b`), `Missing distinct suspension/revocation reason ${reason}`)
}

// User and binding list/detail endpoints must never fetch the recoverable
// activation secret. The dedicated reveal endpoint is the only read path.
for (const relativePath of [
  'app/api/admin/users/list/route.ts',
  'app/api/admin/users/[id]/route.ts',
  'app/api/admin/bindings/route.ts',
  'app/api/admin/bindings/[id]/route.ts',
  'app/api/admin/licenses/[id]/route.ts'
]) {
  assert.doesNotMatch(read(relativePath), /\bcode_value\b/, `${relativePath} fetches raw activation secrets`)
}

const revealRoute = read('app/api/admin/licenses/[id]/reveal/route.ts')
assert.match(revealRoute, /export async function POST\(/)
assert.doesNotMatch(revealRoute, /export async function GET\(/)
assert.match(revealRoute, /logAdminAudit\(/)

const licenseDetailRoute = read('app/api/admin/licenses/[id]/route.ts')
assert.match(licenseDetailRoute, /admin_mutate_license/)
assert.match(licenseDetailRoute, /HARD_DELETE_DISABLED/)

const bindingDetailRoute = read('app/api/admin/bindings/[id]/route.ts')
assert.match(bindingDetailRoute, /admin_mutate_binding/)

const userDetailRoute = read('app/api/admin/users/[id]/route.ts')
assert.match(userDetailRoute, /CANNOT_CHANGE_SELF/)
assert.match(userDetailRoute, /LAST_ADMIN_PROTECTED/)
assert.match(userDetailRoute, /admin_set_user_role/)
assert.match(userDetailRoute, /deleteUser\(id,\s*true\)/)

process.stdout.write(`Static admin migration check passed: ${reconcileName}, ${hardeningName}\n`)
