import { json } from '@/lib/http'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { billingScope, hasPaidSubscriptionAccess, hasTrialSubscriptionAccess, trialBillingEnabled, PAYPAL_PREPAID_PLAN, PREPAID_PLAN, prepaidBillingEnabled } from '@/lib/billing/config'
import { findTrial } from '@/lib/billing/trials'
import { findBillingCustomer, getBillingPrices } from '@/lib/billing/service'
import { billingErrorResponse } from '@/lib/billing/stripe'
import { loadWebLicenseAccessSnapshot } from '@/lib/web-license/access'
import { membershipSummary } from '@/lib/billing/membership'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    const service = createSupabaseServiceRoleClient()
    const membership = membershipSummary(await loadWebLicenseAccessSnapshot(service, user.id))
    const scope = billingScope()
    if (!scope) return json({ success: true, available: false, trial: { available: false, used: false, selectedOffer: null }, prepaid: null, paypalPrepaid: null, plans: [], subscription: null, canManage: false, membership })
    const [prices, customer, trial] = await Promise.all([getBillingPrices(), findBillingCustomer(service, user.id), findTrial(service, user.id)])
    const { data, error } = await service.from('stripe_billing_subscriptions')
      .select('stripe_subscription_id, status, billing_interval, paid_through, current_period_end, cancel_at_period_end, risk_hold, trial_offer, trial_start, trial_end')
      .eq('user_id', user.id).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return json({
      success: true, available: prices.length > 0 && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
        && Boolean(process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim()), testMode: !scope.livemode,
      plans: prices.map(({ interval, amount, currency }) => ({ interval, amount, currency })),
      prepaid: prepaidBillingEnabled() ? { amount: PREPAID_PLAN.amount, currency: PREPAID_PLAN.currency, days: PREPAID_PLAN.days } : null,
      paypalPrepaid: prepaidBillingEnabled('gbp') ? { amount: PAYPAL_PREPAID_PLAN.amount, currency: PAYPAL_PREPAID_PLAN.currency, days: PAYPAL_PREPAID_PLAN.days } : null,
      trial: { available: trialBillingEnabled(), used: Boolean(trial?.stripe_subscription_id), selectedOffer: trial?.offer || null },
      canManage: Boolean(customer && data && data.trial_offer !== 'no_card'),
      membership,
      subscription: data ? { ...data, hasAccess: hasPaidSubscriptionAccess(data) || hasTrialSubscriptionAccess(data) } : null
    })
  } catch (error) { return billingErrorResponse(error) }
}
