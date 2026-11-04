import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAdminMembership, type AdminSubscription, type AdminPayment, type AdminTrial } from '@/lib/admin/membership'
import type { WebLicenseAccessSnapshot } from '@/lib/web-license/access'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const iso = (days: number) => new Date(NOW + days * 86400000).toISOString()
const snapshot: WebLicenseAccessSnapshot = {
  profile: { id: 'user', email: 'user@example.test', phone: null, role: 'user', license_status: 'inactive', license_expires_at: null, display_name: null, manual_average_score: null },
  activation: null, license: null
}
const subscription: AdminSubscription = {
  stripe_subscription_id: 'sub_1', user_id: 'user', status: 'active', paid_through: iso(20),
  trial_offer: null, trial_start: null, trial_end: null, cancel_at_period_end: false, risk_hold: false,
  created_at: iso(-2), observed_at: iso(0), billing_interval: 'month'
}
const payment: AdminPayment = { checkout_session_id: 'cs_1', user_id: 'user', paid_at: iso(-1), expires_at: iso(29), amount: 1999, currency: 'cny', risk_hold: false }
const trial: AdminTrial = { user_id: 'user', offer: 'card', reserved_at: iso(0), stripe_subscription_id: null, checkout_session_id: 'cs_trial' }

test('admin shows paid membership when the legacy profile is inactive; canceled renewal keeps paid rights', () => {
  const result = resolveAdminMembership(snapshot, [{ ...subscription, cancel_at_period_end: true }], [], undefined, NOW)
  assert.equal(result.status, 'active')
  assert.equal(result.source, 'subscription')
  assert.equal(result.expiresAt, iso(20))
  assert.equal(result.autoRenew, false)
})

test('both trial offers share verified entitlement rules and distinguish reservation from consumption', () => {
  assert.equal(resolveAdminMembership(snapshot, [], [], trial, NOW).status, 'inactive')
  assert.equal(resolveAdminMembership(snapshot, [], [], trial, NOW).trialState, 'reserved')
  for (const [offer, days] of [['no_card', 1], ['card', 3]] as const) {
    const sub = { ...subscription, status: 'trialing', paid_through: null, trial_offer: offer, trial_start: iso(0), trial_end: iso(days) }
    const result = resolveAdminMembership(snapshot, [sub], [], { ...trial, offer, stripe_subscription_id: sub.stripe_subscription_id }, NOW)
    assert.equal(result.status, 'active')
    assert.equal(result.source, 'trial')
    assert.equal(result.autoRenew, offer === 'card')
    assert.equal(result.trialState, 'used')
    for (const invalid of [{ ...sub, risk_hold: true }, { ...sub, status: 'canceled' }, { ...sub, trial_end: iso(days + 1) }]) {
      assert.notEqual(resolveAdminMembership(snapshot, [invalid], [], trial, NOW).status, 'active')
    }
    assert.equal(resolveAdminMembership(snapshot, [sub], [], { ...trial, stripe_subscription_id: sub.stripe_subscription_id }, Date.parse(sub.trial_end)).trialState, 'used')
  }
})

test('prepaid rights expire exactly and risk holds do not grant access', () => {
  assert.equal(resolveAdminMembership(snapshot, [], [payment], undefined, NOW).source, 'prepaid')
  assert.equal(resolveAdminMembership(snapshot, [], [payment], undefined, Date.parse(payment.expires_at)).status, 'expired')
  assert.notEqual(resolveAdminMembership(snapshot, [], [{ ...payment, risk_hold: true }], undefined, NOW).status, 'active')
})

test('account suspension blocks billing rights and historical valid membership keeps precedence', () => {
  const suspended = { ...snapshot, profile: { ...snapshot.profile!, license_status: 'suspended' } }
  assert.equal(resolveAdminMembership(suspended, [subscription], [payment], trial, NOW).status, 'suspended')
  const legacy = { profile: { ...snapshot.profile!, license_status: 'active', license_expires_at: iso(3) },
    activation: { id: 'a', license_id: 'l', user_id: 'user', email: 'user@example.test', activated_at: iso(-1), expires_at: iso(4), status: 'active', last_used_at: null },
    license: { id: 'l', plan: 'premium', status: 'active', expires_at: iso(2) } }
  const result = resolveAdminMembership(legacy, [subscription], [payment], trial, NOW)
  assert.equal(result.source, 'existing')
  assert.equal(result.expiresAt, iso(2))
})

test('a synthetic Stripe access snapshot preserves its actual source in the admin detail', () => {
  const synthetic: WebLicenseAccessSnapshot = {
    profile: { ...snapshot.profile!, license_status: 'active', license_expires_at: iso(20) },
    activation: { source: 'stripe', id: 'sub_1', license_id: 'sub_1', user_id: 'user', email: 'user@example.test', activated_at: iso(-2), expires_at: iso(20), status: 'active', last_used_at: null },
    license: { id: 'sub_1', plan: 'standard', status: 'active', expires_at: iso(20) }
  }
  assert.equal(resolveAdminMembership(synthetic, [subscription], [], undefined, NOW).source, 'subscription')
})
