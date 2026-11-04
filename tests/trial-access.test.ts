import assert from 'node:assert/strict'
import test from 'node:test'
import { hasTrialSubscriptionAccess } from '@/lib/billing/config'
import { membershipDestination } from '@/lib/billing/navigation'

const NOW = Date.parse('2026-11-03T12:00:00Z')
const START = new Date(NOW).toISOString()

test('trial rights enforce the chosen offer, exact expiry, verified start and risk holds', () => {
  for (const [offer, days] of [['no_card', 1], ['card', 3]] as const) {
    const row = { status: 'trialing', risk_hold: false, trial_offer: offer, trial_start: START, trial_end: new Date(NOW + days * 86400000).toISOString() }
    assert.equal(hasTrialSubscriptionAccess(row, NOW), true)
    assert.equal(hasTrialSubscriptionAccess(row, Date.parse(row.trial_end)), false)
    assert.equal(hasTrialSubscriptionAccess({ ...row, risk_hold: true }, NOW), false)
    assert.equal(hasTrialSubscriptionAccess({ ...row, trial_offer: null }, NOW), false)
    assert.equal(hasTrialSubscriptionAccess({ ...row, trial_start: new Date(NOW + 1000).toISOString() }, NOW), false)
    assert.equal(hasTrialSubscriptionAccess({ ...row, trial_end: new Date(NOW + days * 86400000 + 1000).toISOString() }, NOW), false)
    for (const status of ['canceled', 'unpaid', 'paused', 'incomplete']) assert.equal(hasTrialSubscriptionAccess({ ...row, status }, NOW), false)
  }
})

test('membership prompts accept only local protected learning destinations', () => {
  assert.deepEqual(membershipDestination('/study-plan/errors?source=practice'), { href: '/study-plan/errors?source=practice', label: '错题本' })
  assert.equal(membershipDestination('/practice')?.label, '写作练习')
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/billing', '/support', '/admin', '/pricing', '/practice-other']) assert.equal(membershipDestination(path), null)
})
