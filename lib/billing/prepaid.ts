import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope, PAYPAL_PREPAID_PLAN, PREPAID_PLAN, prepaidBillingEnabled } from './config'
import { BillingError, getStripe, objectId } from './stripe'
import { ensureBillingCustomer } from './service'
import { reserveCheckout } from './checkout'

export async function startPrepaidCheckout(service: SupabaseClient, user: { id: string; email?: string | null }, origin: string, currency: 'cny' | 'gbp' = 'cny') {
  if (!prepaidBillingEnabled(currency)) throw new BillingError('单次付款暂未开放，请稍后重试。')
  const plan = currency === 'gbp' ? PAYPAL_PREPAID_PLAN : PREPAID_PLAN
  const stripe = getStripe()
  const customer = await ensureBillingCustomer(service, user)
  for await (const subscription of stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: 'all', limit: 100 })) {
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      throw new BillingError('当前账号已有订阅，请先在“管理订阅”中处理。', 409)
    }
  }
  const reservation = await reserveCheckout(service, customer.stripe_customer_id, plan.key)
  if (reservation.url) return reservation.url
  const label = `ielts-prepaid-${reservation.requestId.replaceAll('-', '').slice(0, 8).split('').map((char) => String.fromCharCode(97 + parseInt(char, 16))).join('')}`
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', customer: customer.stripe_customer_id, client_reference_id: user.id,
    line_items: [{ price_data: {
      currency: plan.currency, unit_amount: plan.amount,
      product_data: { name: '30天写作会员', description: '付款确认后开通30天会员，不自动续费。' }
    }, quantity: 1 }],
    metadata: { application: 'ielts-writing', plan: plan.key, user_id: user.id },
    payment_intent_data: { metadata: { application: 'ielts-writing', plan: plan.key, user_id: user.id } },
    payment_method_options: { wechat_pay: { client: 'web' } },
    adaptive_pricing: { enabled: false }, integration_identifier: label,
    success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing?checkout=canceled`,
    custom_text: { submit: { message: `本次仅支付${currency === 'gbp' ? '英镑2.49' : '人民币19.99元'}。确认到账后开通30天会员，到期不自动扣款。` } }
  }, { idempotencyKey: `ielts-prepaid:${reservation.requestId}` })
  const { error: saveError } = await service.from('stripe_billing_customers').update({
    checkout_session_id: session.id, checkout_expires_at: new Date(session.expires_at * 1000).toISOString()
  }).eq('stripe_customer_id', customer.stripe_customer_id).eq('checkout_request_id', reservation.requestId)
  if (saveError) throw saveError
  if (!session.url) throw new BillingError('支付页面创建失败，请重试。')
  return session.url
}

// Always retrieve the canonical session and line items. Redirects and event payloads
// alone cannot grant access, and the first database receipt fixes the expiry.
export async function syncPrepaidSession(service: SupabaseClient, sessionId: string, event?: { id: string; type: string }, riskHold = false) {
  const stripe = getStripe()
  const scope = billingScope()!
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const plan = [PREPAID_PLAN, PAYPAL_PREPAID_PLAN].find((item) => item.key === session.metadata?.plan)
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid'
    || session.livemode !== scope.livemode || session.metadata?.application !== 'ielts-writing'
    || !plan) return
  const customerId = objectId(session.customer)
  const paymentIntentId = objectId(session.payment_intent)
  if (!customerId || !paymentIntentId) return
  const { data: customer, error } = await service.from('stripe_billing_customers').select('user_id')
    .eq('stripe_customer_id', customerId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
  if (error) throw error
  if (!customer || session.client_reference_id !== customer.user_id || session.metadata.user_id !== customer.user_id) return
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 })
  const line = items.data[0]
  if (items.has_more || items.data.length !== 1 || line.quantity !== 1 || line.price?.type !== 'one_time'
    || line.price.unit_amount !== plan.amount || line.price.currency !== plan.currency
    || session.currency !== plan.currency || session.amount_total !== plan.amount
    || session.amount_subtotal !== plan.amount || session.total_details?.amount_discount || session.total_details?.amount_tax) {
    throw new BillingError('单次付款金额或商品不匹配，请联系支持。', 400)
  }
  const { error: syncError } = await service.rpc('sync_stripe_payment', { p_snapshot: {
    checkout_session_id: session.id, payment_intent_id: paymentIntentId, stripe_customer_id: customerId,
    stripe_account_id: scope.account, livemode: scope.livemode, user_id: customer.user_id,
    amount: plan.amount, currency: plan.currency,
    risk_hold: riskHold, event_id: event?.id || null, event_type: event?.type || 'reconcile'
  } })
  if (syncError) throw syncError
}

export async function holdPrepaidPayment(service: SupabaseClient, paymentIntent: string, event: { id: string; type: string }) {
  // This also catches a refund that arrives before checkout.session.completed.
  for await (const session of getStripe().checkout.sessions.list({ payment_intent: paymentIntent, limit: 100 })) {
    if (session.mode === 'payment' && session.metadata?.application === 'ielts-writing'
      && [PREPAID_PLAN, PAYPAL_PREPAID_PLAN].some((plan) => plan.key === session.metadata?.plan)) {
      await syncPrepaidSession(service, session.id, { ...event, id: `${event.id}:${session.id}` }, true)
    }
  }
}
