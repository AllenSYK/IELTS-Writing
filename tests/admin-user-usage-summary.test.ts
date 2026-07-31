import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeUsageRecords } from '@/lib/admin/user-usage-summary'

test('admin user usage fallback aggregates counts and latest activity by user', () => {
  const summary = summarizeUsageRecords([
    { user_id: 'user-a', created_at: '2026-07-01T08:00:00.000Z' },
    { user_id: 'user-b', created_at: '2026-07-02T08:00:00.000Z' },
    { user_id: 'user-a', created_at: '2026-07-03T08:00:00.000Z' }
  ])

  assert.deepEqual(summary, [
    { user_id: 'user-a', evaluation_count: 2, last_used_at: '2026-07-03T08:00:00.000Z' },
    { user_id: 'user-b', evaluation_count: 1, last_used_at: '2026-07-02T08:00:00.000Z' }
  ])
})
