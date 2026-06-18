import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSingleFlight } from '../lib/web-license/single-flight'

test('activation submission guard permits only one concurrent RPC operation', async () => {
  const runSingleFlight = createSingleFlight()
  let rpcCalls = 0
  let releaseRequest: (() => void) | undefined
  const requestPending = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })

  const first = runSingleFlight(async () => {
    rpcCalls += 1
    await requestPending
  })
  const duplicate = runSingleFlight(async () => {
    rpcCalls += 1
  })

  assert.equal(rpcCalls, 1)
  assert.equal(await duplicate, undefined)

  releaseRequest?.()
  await first

  await runSingleFlight(async () => {
    rpcCalls += 1
  })
  assert.equal(rpcCalls, 2)
})

test('license activation migration logs SQL errors and normalizes status constraints by catalog dependency', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260618122229_fix_license_activation.sql', import.meta.url),
    'utf8'
  )

  assert.match(migration, /raise log 'activate_license_code failed: sqlstate=%, error=%, user_id=%, email=%'/i)
  assert.match(migration, /from pg_constraint[\s\S]*v_status_attnum = any\(constraint_row\.conkey\)/i)
  assert.match(
    migration,
    /status in \(\s*'unused',\s*'active',\s*'exhausted',\s*'disabled',\s*'expired',\s*'revoked'\s*\)/i
  )
  assert.match(migration, /activation\.expires_at > v_now/i)
  assert.match(migration, /activation\.license_id = v_license\.id/i)
  assert.doesNotMatch(migration, /where expires_at > v_now/i)
  assert.doesNotMatch(migration, /where license_id = v_license\.id/i)
})
