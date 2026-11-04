export type BillingInterval = 'month' | 'year'

export const TRIAL_OFFERS = { no_card: { days: 1, autoRenew: false }, card: { days: 3, autoRenew: true } } as const
export type TrialOffer = keyof typeof TRIAL_OFFERS

export function trialBillingEnabled() {
  return process.env.STRIPE_TRIAL_ENABLED !== 'false' && Boolean(billingScope())
    && Boolean(configuredPriceIds().month) && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
}

export const PREPAID_PLAN = { amount: 1999, currency: 'cny', days: 30, key: 'prepaid_30_days' } as const
export const PAYPAL_PREPAID_PLAN = { amount: 249, currency: 'gbp', days: 30, key: 'prepaid_30_days_gbp' } as const

export function prepaidBillingEnabled(currency: 'cny' | 'gbp' = 'cny') {
  return process.env[currency === 'gbp' ? 'STRIPE_PAYPAL_ENABLED' : 'STRIPE_PREPAID_ENABLED'] === 'true' && Boolean(billingScope())
    && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
}

export function billingScope() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() || ''
  const account = process.env.STRIPE_ACCOUNT_ID?.trim()
  if (!account || !/^(sk|rk)_(test|live)_/.test(key)) return null
  const livemode = /^(sk|rk)_live_/.test(key)
  // A sandbox must never grant access on the production site.
  if (process.env.VERCEL_ENV === 'production' && !livemode) return null
  return { account, livemode }
}

export function configuredPriceIds() {
  return {
    month: process.env.STRIPE_PRICE_MONTHLY?.trim() || '',
    year: process.env.STRIPE_PRICE_YEARLY?.trim() || ''
  }
}

export const BILLING_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.finalization_failed',
  'charge.refunded',
  'charge.dispute.created',
  'radar.early_fraud_warning.created'
] as const

export function hasPaidSubscriptionAccess(
  subscription: { status: string; paid_through: string | null; risk_hold: boolean },
  now = Date.now()
) {
  return ['active', 'past_due'].includes(subscription.status)
    && !subscription.risk_hold
    && Boolean(subscription.paid_through)
    && new Date(subscription.paid_through!).getTime() > now
}

export function hasTrialSubscriptionAccess(
  subscription: { status: string; risk_hold: boolean; trial_offer?: string | null; trial_start?: string | null; trial_end?: string | null },
  now = Date.now()
) {
  if (subscription.status !== 'trialing' || subscription.risk_hold) return false
  const offer = subscription.trial_offer
  if (offer !== 'no_card' && offer !== 'card') return false
  const start = Date.parse(subscription.trial_start || '')
  const end = Date.parse(subscription.trial_end || '')
  return start <= now && end > now && end <= start + TRIAL_OFFERS[offer].days * 86400000
}
