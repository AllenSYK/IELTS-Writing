import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope } from './config'
import { BillingError, getStripe, objectId } from './stripe'

// A return from Checkout does not cancel the session. Before starting a trial,
// close only this customer's unsubmitted session and release its exact reservation.
export async function releaseCheckoutForTrial(service: SupabaseClient, customerId: string) {
  const scope = billingScope()
  if (!scope) throw new BillingError('试用服务暂未开放。')
  const { data: pending, error } = await service.from('stripe_billing_customers')
    .select('checkout_request_id, checkout_session_id')
    .eq('stripe_customer_id', customerId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
  if (error) throw error
  // No session ID can mean another request is still creating the checkout.
  if (!pending?.checkout_request_id || !pending.checkout_session_id) return false

  const stripe = getStripe()
  let session = await stripe.checkout.sessions.retrieve(pending.checkout_session_id)
  const checkSession = () => {
    if (objectId(session.customer) !== customerId || session.livemode !== scope.livemode) {
      throw new BillingError('付款记录暂时无法核实，请联系支持。', 409)
    }
    // Completed asynchronous payments can still be unpaid. They must stay protected.
    if (session.status === 'complete' || session.payment_status === 'paid') {
      throw new BillingError('付款已提交，正在核对结果，请刷新会员状态。', 409)
    }
  }
  checkSession()
  if (session.status === 'open') {
    if (session.payment_status !== 'unpaid') throw new BillingError('付款状态正在确认，请稍后刷新会员状态。', 409)
    try {
      session = await stripe.checkout.sessions.expire(session.id)
    } catch (expireError) {
      // The checkout may have completed or expired between the read and expiration.
      session = await stripe.checkout.sessions.retrieve(pending.checkout_session_id)
      checkSession()
      if (session.status !== 'expired') throw expireError
    }
  }
  checkSession()
  if (session.status !== 'expired') return false
  const { data: released, error: releaseError } = await service.from('stripe_billing_customers')
    .update({ checkout_expires_at: new Date(0).toISOString() })
    .eq('stripe_customer_id', customerId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
    .eq('checkout_request_id', pending.checkout_request_id).eq('checkout_session_id', pending.checkout_session_id)
    .select('stripe_customer_id').maybeSingle()
  if (releaseError) throw releaseError
  return Boolean(released)
}

export async function reserveCheckout(service: SupabaseClient, customerId: string, priceKey: string) {
  const stripe = getStripe()
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await service.rpc('begin_stripe_checkout', {
      p_customer_id: customerId, p_price_id: priceKey
    }).single<{ request_id: string; session_id: string | null }>()
    if (error) {
      if (error.message.includes('CHECKOUT_ACTIVE_MEMBERSHIP')) throw new BillingError('当前会员权益或订阅仍有效，无需重复开通。', 409)
      if (!error.message.includes('CHECKOUT_IN_PROGRESS')) throw error
      // Selecting another plan closes only this customer's unpaid session.
      // Compare-and-set prevents a concurrent request from unlocking a newer one.
      const scope = billingScope()!
      const { data: pending, error: readError } = await service.from('stripe_billing_customers')
        .select('checkout_request_id, checkout_session_id').eq('stripe_customer_id', customerId)
        .eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
      if (readError) throw readError
      if (!pending?.checkout_session_id || attempt === 1) throw new BillingError('支付页面正在创建，请稍后重试。', 409)
      const session = await stripe.checkout.sessions.retrieve(pending.checkout_session_id)
      if (session.status === 'complete') throw new BillingError('该笔支付已提交，请刷新会员状态。', 409)
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id)
      const { error: releaseError } = await service.from('stripe_billing_customers')
        .update({ checkout_expires_at: new Date(0).toISOString() })
        .eq('stripe_customer_id', customerId).eq('checkout_request_id', pending.checkout_request_id)
      if (releaseError) throw releaseError
      continue
    }
    if (data.session_id) {
      const existing = await stripe.checkout.sessions.retrieve(data.session_id)
      if (existing.status === 'open' && existing.url) return { requestId: data.request_id, url: existing.url }
      if (existing.status === 'complete') throw new BillingError('该笔支付已提交，请刷新会员状态。', 409)
      const { error: releaseError } = await service.from('stripe_billing_customers')
        .update({ checkout_expires_at: new Date(0).toISOString() })
        .eq('stripe_customer_id', customerId).eq('checkout_request_id', data.request_id)
      if (releaseError) throw releaseError
      continue
    }
    return { requestId: data.request_id, url: null }
  }
  throw new BillingError('支付页面状态已更新，请重试。', 409)
}
