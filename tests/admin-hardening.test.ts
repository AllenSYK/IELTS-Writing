import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assertTrustedAdminMutationRequest } from '../lib/admin/trusted-origin'

test('administrator mutations reject cross-site requests', () => {
  assert.doesNotThrow(() => assertTrustedAdminMutationRequest(new Request('https://admin.example.com/api/admin/users', {
    method: 'POST',
    headers: {
      origin: 'https://admin.example.com',
      'sec-fetch-site': 'same-origin'
    }
  })))

  assert.throws(
    () => assertTrustedAdminMutationRequest(new Request('https://admin.example.com/api/admin/users', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site'
      }
    })),
    (error) => error instanceof Response && error.status === 403
  )
})

test('administrator APIs keep activation secrets behind an audited POST reveal', async () => {
  const [listRoute, detailRoute, bindingListRoute, bindingDetailRoute, userListRoute, userDetailRoute, revealRoute] = await Promise.all([
    readFile(new URL('../app/api/admin/licenses/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/licenses/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/bindings/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/bindings/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/list/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/licenses/[id]/reveal/route.ts', import.meta.url), 'utf8')
  ])

  assert.match(listRoute, /Reflect\.deleteProperty\(redacted,\s*'code_value'\)/)
  for (const source of [detailRoute, bindingListRoute, bindingDetailRoute, userListRoute, userDetailRoute]) {
    assert.doesNotMatch(source, /\bcode_value\b/)
  }
  assert.match(revealRoute, /export async function POST/)
  assert.doesNotMatch(revealRoute, /export async function GET/)
  assert.match(revealRoute, /if \(!auditId\)/)
})

test('destructive admin operations are recoverable or explicitly irreversible', async () => {
  const [licenseRoute, pastPaperRoute, userRoute, hardeningMigration] = await Promise.all([
    readFile(new URL('../app/api/admin/licenses/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/past-papers/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260725153201_harden_admin_mutations.sql', import.meta.url), 'utf8')
  ])

  assert.match(licenseRoute, /HARD_DELETE_DISABLED/)
  assert.doesNotMatch(pastPaperRoute, /\.from\('past_paper_questions'\)\.delete\(\)/)
  assert.match(pastPaperRoute, /status:\s*'archived'/)
  assert.match(userRoute, /deleteUser\(id,\s*true\)/)
  assert.match(userRoute, /admin_prepare_user_deletion/)
  assert.match(hardeningMigration, /ACCOUNT_DELETED/)
})

test('administrator concurrency guards execute in the same database mutation', async () => {
  const [settingsRoute, pastPaperRoute, userRoute, hardeningMigration] = await Promise.all([
    readFile(new URL('../app/api/admin/settings/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/past-papers/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260725153201_harden_admin_mutations.sql', import.meta.url), 'utf8')
  ])

  assert.match(settingsRoute, /\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(settingsRoute, /\bsetting_value:\s*patch/)
  assert.match(pastPaperRoute, /updateQuery = updateQuery\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(userRoute, /admin_set_user_role/)
  assert.match(hardeningMigration, /pg_advisory_xact_lock/)
  assert.match(hardeningMigration, /LAST_ADMIN_PROTECTED/)
})
