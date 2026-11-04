import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope } from '@/lib/billing/config'
import type { AdminPayment, AdminSubscription, AdminTrial } from './membership'

export const SUBSCRIPTION_COLUMNS = 'stripe_subscription_id, user_id, status, paid_through, trial_offer, trial_start, trial_end, cancel_at_period_end, risk_hold, created_at, observed_at, billing_interval'
export const PAYMENT_COLUMNS = 'checkout_session_id, user_id, paid_at, expires_at, risk_hold, amount, currency'
export const TRIAL_COLUMNS = 'user_id, offer, reserved_at, stripe_subscription_id, checkout_session_id'

export async function loadAdminBilling(service: SupabaseClient, userIds: string[]) {
  const scope = billingScope()
  if (!scope || !userIds.length) return { subscriptions: [] as AdminSubscription[], payments: [] as AdminPayment[], trials: [] as AdminTrial[] }
  async function load<T>(table: string, columns: string, order: string): Promise<T[]> {
    const rows: T[] = []
    // Fetch every page: PostgREST caps row counts, including bulk account searches.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await service.from(table).select(columns)
        .eq('stripe_account_id', scope!.account).eq('livemode', scope!.livemode)
        .in('user_id', userIds).order(order).range(offset, offset + 499)
      if (error) throw error
      rows.push(...(data || []) as T[])
      if (!data || data.length < 500) return rows
    }
  }
  const [subscriptions, payments, trials] = await Promise.all([
    load<AdminSubscription>('stripe_billing_subscriptions', SUBSCRIPTION_COLUMNS, 'stripe_subscription_id'),
    load<AdminPayment>('stripe_billing_payments', PAYMENT_COLUMNS, 'checkout_session_id'),
    load<AdminTrial>('stripe_billing_trials', TRIAL_COLUMNS, 'user_id')
  ])
  return { subscriptions, payments, trials }
}

export async function loadAdminBillingCounts(service: SupabaseClient) {
  const scope = billingScope()
  const empty = { subscriptions: 0, payments: 0, trials: 0, attention: 0 }
  if (!scope) return { ...empty, configured: false, livemode: null }
  const count = (table: string) => service.from(table).select('user_id', { count: 'exact', head: true })
    .eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
  const results = await Promise.all([
    count('stripe_billing_subscriptions'), count('stripe_billing_payments'), count('stripe_billing_trials'),
    count('stripe_billing_subscriptions').or('status.in.(past_due,unpaid,incomplete),risk_hold.eq.true')
  ])
  for (const result of results) if (result.error) throw result.error
  return { subscriptions: results[0].count || 0, payments: results[1].count || 0, trials: results[2].count || 0,
    attention: results[3].count || 0, configured: true, livemode: scope.livemode }
}
