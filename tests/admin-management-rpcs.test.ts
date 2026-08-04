import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const migrationSuffix = '_repair_admin_management_rpcs.sql'

async function loadRepairMigration() {
  const migrationDirectory = new URL('../supabase/migrations/', import.meta.url)
  const names = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(migrationSuffix))
    .sort()
  assert.equal(names.length, 1, 'expected one standalone administrator RPC repair migration')
  return readFile(new URL(names[0], migrationDirectory), 'utf8')
}

const rpcSignatures: Record<string, string> = {
  admin_mutate_license: 'uuid, text, text, integer, integer, timestamptz, boolean, text, boolean',
  admin_mutate_binding: 'uuid, text, integer, text',
  admin_set_user_role: 'uuid, uuid, text',
  admin_set_user_access: 'uuid, text',
  admin_prepare_user_deletion: 'uuid',
  get_web_license_access_state: 'uuid'
}

test('administrator RPC repair is self-contained, idempotent, and service-only', async () => {
  const migration = await loadRepairMigration()

  for (const [name, signature] of Object.entries(rpcSignatures)) {
    const definition = migration.match(
      new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\n\\$\\$;`, 'i')
    )?.[0]
    assert.ok(definition, `missing create or replace definition for ${name}`)
    assert.match(definition, /security definer/i, `${name} must be SECURITY DEFINER`)
    assert.match(definition, /set search_path = public/i, `${name} must pin search_path to public`)
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\(${signature}\\) from public, anon, authenticated;`, 'i'),
      `${name} must revoke client execution`
    )
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\(${signature}\\) to service_role;`, 'i'),
      `${name} must grant only service_role execution`
    )
  }

  assert.doesNotMatch(migration, /\bdelete\s+from\b/i)
  assert.match(migration, /update auth\.users[\s\S]*?banned_until/)
  assert.match(migration, /admin_prepare_user_deletion[\s\S]*?ACCOUNT_DELETED/)
  assert.match(migration, /get_web_license_access_state[\s\S]*?returns table/)

  for (const code of [
    'LICENSE_NOT_FOUND',
    'BINDING_NOT_FOUND',
    'LICENSE_UNAVAILABLE',
    'LICENSE_EXHAUSTED',
    'USER_ALREADY_ACTIVE',
    'ACCOUNT_DISABLED',
    'ACCOUNT_DELETED',
    'CANNOT_CHANGE_SELF',
    'LAST_ADMIN_PROTECTED'
  ]) {
    assert.match(migration, new RegExp(`\\b${code}\\b`), `missing compatible business error ${code}`)
  }
})

test('user management routes delegate Auth/public consistency to atomic RPCs', async () => {
  const route = await readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8')

  assert.match(route, /rpc\('admin_set_user_access'/)
  assert.match(route, /rpc\('admin_prepare_user_deletion'/)
  assert.match(route, /deleteUser\(id,\s*true\)/)
  assert.doesNotMatch(route, /updateUserById\([\s\S]{0,180}?ban_duration/)
})

test('transactional SQL verification covers every requested administrator operation', async () => {
  const verification = await readFile(
    new URL('../supabase/tests/admin_management_rpcs.sql', import.meta.url),
    'utf8'
  )

  for (const marker of [
    "admin_set_user_access(v_user_id, 'disable')",
    "admin_set_user_access(v_user_id, 'enable')",
    "admin_set_user_role(v_actor_id, v_role_user_id, 'admin')",
    "admin_set_user_role(v_actor_id, v_role_user_id, 'user')",
    "p_status => 'disabled'",
    "p_status => 'revoked'",
    "admin_mutate_binding(v_binding_id, 'extend'",
    "admin_mutate_binding(v_binding_id, 'revoke'",
    "admin_mutate_binding(v_binding_id, 'rebind'",
    "admin_mutate_binding(v_binding_id, 'unbind'",
    'admin_prepare_user_deletion(v_delete_user_id)',
    'get_web_license_access_state(v_user_id)',
    'from public.usage_records where id = v_usage_id'
  ]) {
    assert.ok(verification.includes(marker), `SQL verification is missing: ${marker}`)
  }

  assert.match(verification, /^begin;/)
  assert.match(verification, /rollback;\s*$/)
})
