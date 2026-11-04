import { hasPaidSubscriptionAccess, hasTrialSubscriptionAccess } from '@/lib/billing/config'
import { isActiveWebLicenseSnapshot, type WebLicenseAccessSnapshot } from '@/lib/web-license/access'

export type AdminSubscription = {
  stripe_subscription_id: string
  user_id: string
  status: string
  paid_through: string | null
  trial_offer: string | null
  trial_start: string | null
  trial_end: string | null
  cancel_at_period_end: boolean
  risk_hold: boolean
  created_at: string
  observed_at: string
  billing_interval: string
}

export type AdminPayment = {
  checkout_session_id: string
  user_id: string
  paid_at: string
  expires_at: string
  risk_hold: boolean
  amount: number
  currency: string
}

export type AdminTrial = {
  user_id: string
  offer: string
  reserved_at: string
  stripe_subscription_id: string | null
  checkout_session_id: string | null
}

export type AdminMembership = {
  status: 'active' | 'inactive' | 'expired' | 'suspended' | 'admin'
  source: 'subscription' | 'prepaid' | 'trial' | 'existing' | 'none'
  expiresAt: string | null
  plan: string | null
  autoRenew: boolean
  trialOffer: string | null
  trialState: 'unused' | 'reserved' | 'used'
}

export const MEMBERSHIP_SOURCE_LABELS = {
  subscription: '自动续费订阅', prepaid: '单次付款会员', trial: '免费试用', existing: '历史授权', none: '未开通'
} as const

// Keep the same precedence and entitlement checks as the user-facing access loader.
export function resolveAdminMembership(
  snapshot: WebLicenseAccessSnapshot,
  subscriptions: AdminSubscription[],
  payments: AdminPayment[],
  trial: AdminTrial | undefined,
  now = Date.now()
): AdminMembership {
  const result: AdminMembership = {
    status: 'inactive', source: 'none', expiresAt: null, plan: null, autoRenew: false,
    trialOffer: trial?.offer || null,
    trialState: trial ? trial.stripe_subscription_id ? 'used' : 'reserved' : 'unused'
  }
  if (snapshot.profile?.role === 'admin') return { ...result, status: 'admin' }
  if (snapshot.profile?.license_status === 'suspended') return { ...result, status: 'suspended' }
  if (!snapshot.profile) return result
  if (isActiveWebLicenseSnapshot(snapshot, now) && !snapshot.activation?.source?.startsWith('stripe')) {
    const dates = [snapshot.profile.license_expires_at, snapshot.activation?.expires_at, snapshot.license?.expires_at]
      .filter((date): date is string => Boolean(date)).map(Date.parse)
    return { ...result, status: 'active', source: 'existing', plan: snapshot.license!.plan,
      expiresAt: new Date(Math.min(...dates)).toISOString() }
  }
  const candidates = subscriptions.filter((row) => !row.risk_hold && ['active', 'past_due', 'trialing'].includes(row.status)
    && (Date.parse(row.paid_through || '') > now || Date.parse(row.trial_end || '') > now)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10)
  const subscription = candidates.find((row) => hasPaidSubscriptionAccess(row, now))
    || candidates.find((row) => hasTrialSubscriptionAccess(row, now))
  if (subscription) {
    const isTrial = hasTrialSubscriptionAccess(subscription, now)
    return { ...result, status: 'active', source: isTrial ? 'trial' : 'subscription', plan: 'standard',
      expiresAt: isTrial ? subscription.trial_end : subscription.paid_through,
      trialOffer: isTrial ? subscription.trial_offer : result.trialOffer,
      autoRenew: !subscription.cancel_at_period_end && !(isTrial && subscription.trial_offer === 'no_card') }
  }
  const payment = payments.filter((row) => !row.risk_hold && Date.parse(row.expires_at) > now)
    .sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at))[0]
  if (payment) return { ...result, status: 'active', source: 'prepaid', expiresAt: payment.expires_at, plan: 'standard' }
  const dates = [snapshot.profile.license_expires_at, ...subscriptions.flatMap((row) => [row.paid_through, row.trial_end]), ...payments.map((row) => row.expires_at)]
    .filter((date): date is string => Boolean(date) && Date.parse(date!) <= now).sort((a, b) => Date.parse(b) - Date.parse(a))
  return dates.length || snapshot.profile.license_status === 'expired'
    ? { ...result, status: 'expired', expiresAt: dates[0] || null } : result
}
