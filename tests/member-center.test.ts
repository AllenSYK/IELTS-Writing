import assert from 'node:assert/strict'
import test from 'node:test'
import { membershipSummary } from '@/lib/billing/membership'
import { resolveAuthRedirect } from '@/lib/auth/route-access'
import { POST as retiredActivation } from '@/app/api/license/activate/route'
import type { WebLicenseAccessSnapshot } from '@/lib/web-license/access'

const NOW = Date.parse('2026-11-03T12:00:00Z')
const EXPIRY = '2026-12-03T12:00:00Z'

function activeSnapshot(source: 'license' | 'stripe' = 'license'): WebLicenseAccessSnapshot {
  return {
    profile: { id: 'member', email: 'member@example.test', phone: null, role: 'user', license_status: 'active', license_expires_at: EXPIRY, display_name: null, manual_average_score: null },
    activation: { id: 'entitlement', license_id: 'plan', user_id: 'member', email: 'member@example.test', activated_at: '2026-11-03T12:00:00Z', expires_at: EXPIRY, status: 'active', last_used_at: null, source },
    license: { id: 'plan', plan: 'standard', status: 'active', expires_at: null }
  }
}

test('member center preserves existing paid entitlements after activation is retired', () => {
  assert.deepEqual(membershipSummary(activeSnapshot(), NOW), { active: true, expiresAt: '2026-12-03T12:00:00.000Z', remainingDays: 30, plan: 'standard', suspended: false, source: 'existing' })
  assert.equal(membershipSummary(activeSnapshot('stripe'), NOW).source, 'subscription')
})

test('membership duration respects the earliest entitlement limit', () => {
  const snapshot = activeSnapshot()
  snapshot.license!.expires_at = '2026-11-08T12:00:00Z'
  const summary = membershipSummary(snapshot, NOW)
  assert.equal(summary.remainingDays, 5)
  assert.equal(summary.expiresAt, '2026-11-08T12:00:00.000Z')
})

test('inactive, expired, suspended and revoked memberships do not grant access', () => {
  assert.equal(membershipSummary({ profile: null, activation: null, license: null }, NOW).active, false)
  assert.equal(membershipSummary(activeSnapshot(), Date.parse(EXPIRY)).active, false)
  const suspended = activeSnapshot()
  suspended.profile!.license_status = 'suspended'
  assert.equal(membershipSummary(suspended, NOW).active, false)
  assert.equal(membershipSummary(suspended, NOW).suspended, true)
  const revoked = activeSnapshot()
  revoked.license!.status = 'revoked'
  assert.equal(membershipSummary(revoked, NOW).active, false)
})

test('all signed-in users can reach member center and old account URLs converge there', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/billing', isAuthenticated: true, role: 'user', licenseActive: false }), null)
  for (const pathname of ['/dashboard', '/settings', '/activate']) {
    assert.equal(resolveAuthRedirect({ pathname, isAuthenticated: true, role: 'user', licenseActive: false }), '/billing')
    assert.equal(resolveAuthRedirect({ pathname, isAuthenticated: true, role: 'user', licenseActive: true }), '/billing')
  }
})

test('membership routing preserves authentication and paid feature gates', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/billing', isAuthenticated: false }), '/login?next=%2Fbilling')
  assert.equal(resolveAuthRedirect({ pathname: '/write/task2', search: '?topic=test', isAuthenticated: true, role: 'user', licenseActive: false }), '/billing?next=%2Fwrite%2Ftask2%3Ftopic%3Dtest')
  assert.equal(resolveAuthRedirect({ pathname: '/practice', isAuthenticated: true, role: 'user', licenseActive: true }), null)
})

test('retired activation endpoint cannot issue or modify an entitlement', async () => {
  const response = await retiredActivation()
  assert.equal(response.status, 410)
  const body = await response.json()
  assert.equal(body.code, 'ACTIVATION_RETIRED')
  assert.equal(body.redirectTo, '/billing')
  assert.equal(body.success, false)
})
