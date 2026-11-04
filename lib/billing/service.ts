import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope, configuredPriceIds, TRIAL_OFFERS, type TrialOffer, type BillingInterval } from './config'
import { BillingError, getStripe, objectId } from './stripe'
import { holdPrepaidPayment, syncPrepaidSession } from './prepaid'
import { reserveCheckout } from './checkout'

type BillingUser = { id: string; email?: string | null }
export type BillingCustomer = {
  user_id: string
  stripe_customer_id: string
  stripe_account_id: string
  livemode: boolean
  checkout_session_id?: string | null
}

export async function findBillingCustomer(service: SupabaseClient, userId: string) {
  const scope = billingScope()
  if (!scope) return null
  const { data, error } = await service.from('stripe_billing_customers')
    .select('user_id, stripe_customer_id, stripe_account_id, livemode, checkout_session_id')
    .eq('user_id', userId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
  if (error) throw error
  return data as BillingCustomer | null
}

export async function ensureBillingCustomer(service: SupabaseClient, user: BillingUser) {
  const existing = await findBillingCustomer(service, user.id)
  if (existing) return existing
  const scope = billingScope()
  if (!scope) throw new BillingError('订阅支付暂未开放。')
  const customer = await getStripe().customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { user_id: user.id, application: 'ielts-writing' }
  }, { idempotencyKey: `ielts-customer:${scope.account}:${scope.livemode}:${user.id}` })
  const { error } = await service.from('stripe_billing_customers').upsert({
    user_id: user.id, stripe_customer_id: customer.id, stripe_account_id: scope.account, livemode: scope.livemode
  }, { onConflict: 'user_id,stripe_account_id,livemode', ignoreDuplicates: true })
  if (error) throw error
  const saved = await findBillingCustomer(service, user.id)
  if (!saved) throw new BillingError('无法建立支付账号，请重试。')
  return saved
}

export async function getBillingPrices() {
  const ids = configuredPriceIds()
  const stripe = getStripe()
  return Promise.all((['month', 'year'] as const).filter((interval) => ids[interval]).map(async (interval) => {
    const price = await stripe.prices.retrieve(ids[interval])
    if (!price.active || price.type !== 'recurring' || price.recurring?.interval !== interval
      || price.recurring.interval_count !== 1 || price.currency !== 'cny' || !price.unit_amount
      || (interval === 'month' && price.unit_amount !== 1999)
      || price.livemode !== billingScope()?.livemode) {
      throw new BillingError('套餐价格配置有误，请联系客服。')
    }
    return { id: price.id, interval, amount: price.unit_amount, currency: price.currency }
  }))
}

export async function getBillingPortalConfigurationId() {
  const id = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim()
  if (!id) throw new BillingError('订阅管理尚未配置，请稍后重试。')
  const portal = await getStripe().billingPortal.configurations.retrieve(id)
  if (!portal.active || portal.livemode !== billingScope()?.livemode
    || !portal.features.subscription_cancel.enabled || portal.features.subscription_cancel.mode !== 'at_period_end'
    || !portal.features.invoice_history.enabled || !portal.features.payment_method_update.enabled
    || portal.features.subscription_update.enabled) {
    throw new BillingError('订阅管理配置有误，请联系客服。')
  }
  return id
}

export async function startSubscriptionCheckout(service: SupabaseClient, user: BillingUser, interval: BillingInterval, origin: string) {
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) throw new BillingError('订阅支付暂未开放，请稍后重试。')
  await getBillingPortalConfigurationId()
  const prices = await getBillingPrices()
  const price = prices.find((item) => item.interval === interval)
  if (!price) throw new BillingError('该订阅套餐暂未开放。', 400)
  const customer = await ensureBillingCustomer(service, user)
  const stripe = getStripe()
  // Read Stripe as well as local state so a delayed webhook cannot cause a second subscription.
  for await (const subscription of stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: 'all', limit: 100 })) {
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      throw new BillingError('当前账号已有订阅或待完成的订阅，请进入“管理订阅”处理。', 409)
    }
  }
  const reservation = await reserveCheckout(service, customer.stripe_customer_id, price.id)
  if (reservation.url) return reservation.url
  // The label must stay fixed across retries with this idempotency key.
  const label = `ielts-writing-${reservation.requestId.replaceAll('-', '').slice(0, 8).split('').map((char) => String.fromCharCode(97 + parseInt(char, 16))).join('')}`
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.stripe_customer_id,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing?checkout=canceled`,
    integration_identifier: label,
    adaptive_pricing: { enabled: false },
    custom_text: { submit: { message: '确认订阅即同意按所选周期自动续费。可随时在网站“管理订阅”中取消续费，取消后本期已付款权益保留至到期。' } },
    subscription_data: { billing_mode: { type: 'flexible' }, metadata: { application: 'ielts-writing' } }
  }, { idempotencyKey: `ielts-checkout:${reservation.requestId}` })
  const { error: saveError } = await service.from('stripe_billing_customers').update({
    checkout_session_id: session.id, checkout_expires_at: new Date(session.expires_at * 1000).toISOString()
  }).eq('stripe_customer_id', customer.stripe_customer_id).eq('checkout_request_id', reservation.requestId)
  if (saveError) throw saveError
  if (!session.url) throw new BillingError('支付页面创建失败，请重试。')
  return session.url
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return invoice.parent?.type === 'subscription_details' ? objectId(invoice.parent.subscription_details?.subscription) : null
}

export function paidInvoiceEnd(invoice: Stripe.Invoice | null, subscriptionId: string, priceId: string) {
  if (!invoice || invoice.status !== 'paid' || invoiceSubscriptionId(invoice) !== subscriptionId) return null
  const ends = invoice.lines.data.filter((line) =>
    objectId(line.pricing?.price_details?.price) === priceId
    && line.parent?.type === 'subscription_item_details'
    && line.parent.subscription_item_details?.subscription === subscriptionId
    && !line.parent.subscription_item_details.proration
  ).map((line) => line.period.end)
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null
}

export async function syncSubscription(service: SupabaseClient, subscriptionId: string, event?: { id: string; type: string }, riskHold = false) {
  const stripe = getStripe()
  const scope = billingScope()!
  const observedAt = new Date().toISOString()
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = objectId(subscription.customer)
  const { data: customer, error } = await service.from('stripe_billing_customers')
    .select('user_id').eq('stripe_customer_id', customerId!).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
  if (error) throw error
  // Other products/accounts using this Stripe account do not belong to this app.
  if (!customer || subscription.livemode !== scope.livemode) return
  const item = subscription.items.data[0]
  const interval = item?.price.recurring?.interval
  const configured = configuredPriceIds()
  const configuredId = interval === 'month' ? configured.month : interval === 'year' ? configured.year : null
  const recognized = subscription.items.data.length === 1 && item.quantity === 1
    && configuredId !== null && item.price.id === configuredId
    && item.price.currency === 'cny' && (interval !== 'month' || item.price.unit_amount === 1999)
  const paid = await stripe.invoices.list({ subscription: subscription.id, status: 'paid', limit: 1 })
  const invoice = paid.data[0] || null
  if (invoice?.lines.has_more) {
    invoice.lines.data = await stripe.invoices.listLineItems(invoice.id, { limit: 100 }).autoPagingToArray({ limit: 1000 })
  }
  const paidThrough = recognized ? paidInvoiceEnd(invoice, subscription.id, item.price.id) : null
  const trialRequestId = subscription.metadata?.trial_request_id
  let trialStart: string | null = null
  let trialEnd: string | null = null
  if (recognized && trialRequestId && subscription.trial_start && subscription.trial_end) {
    const { data: claim, error: claimError } = await service.from('stripe_billing_trials')
      .select('offer, reserved_at, stripe_subscription_id').eq('request_id', trialRequestId)
      .eq('user_id', customer.user_id).eq('stripe_customer_id', customerId!)
      .eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
    if (claimError) throw claimError
    const offer = claim?.offer as TrialOffer | undefined
    if (claim && offer && offer in TRIAL_OFFERS && (!claim.stripe_subscription_id || claim.stripe_subscription_id === subscription.id)) {
      const maxEnd = subscription.trial_start + TRIAL_OFFERS[offer].days * 86400
      const safeNoCardEnd = Math.floor(Date.parse(claim.reserved_at) / 1000) + 86400
      const noCardSafe = offer !== 'no_card' || (subscription.cancel_at !== null && subscription.cancel_at <= safeNoCardEnd)
      if (subscription.trial_end <= maxEnd && noCardSafe) {
        trialStart = new Date(subscription.trial_start * 1000).toISOString()
        trialEnd = new Date(Math.min(subscription.trial_end, offer === 'no_card' ? safeNoCardEnd : maxEnd) * 1000).toISOString()
      }
    }
  }
  const { error: syncError } = await service.rpc('sync_stripe_subscription', {
    p_snapshot: {
      stripe_subscription_id: subscription.id, stripe_customer_id: customerId,
      stripe_account_id: scope.account, livemode: scope.livemode, user_id: customer.user_id,
      price_id: item?.price.id || '', billing_interval: interval === 'year' ? 'year' : 'month',
      status: subscription.status, paid_through: paidThrough,
      trial_request_id: trialStart && trialEnd ? trialRequestId : null,
      trial_start: trialStart, trial_end: trialEnd,
      current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at !== null,
      created_at: new Date(subscription.created * 1000).toISOString(),
      observed_at: observedAt, risk_hold: riskHold,
      event_id: event?.id || null, event_type: event?.type || 'reconcile'
    }
  })
  if (syncError) throw syncError
}

export async function reconcileCustomer(service: SupabaseClient, customer: BillingCustomer) {
  for await (const subscription of getStripe().subscriptions.list({ customer: customer.stripe_customer_id, status: 'all', limit: 100 })) {
    await syncSubscription(service, subscription.id)
  }
  if (customer.checkout_session_id) await syncPrepaidSession(service, customer.checkout_session_id)
}

export async function processBillingEvent(service: SupabaseClient, event: Stripe.Event) {
  const scope = billingScope()!
  if (event.livemode !== scope.livemode) throw new BillingError('Webhook 环境不匹配。', 400)
  const ref = { id: event.id, type: event.type }
  if (event.type.startsWith('customer.subscription.')) {
    await syncSubscription(service, (event.data.object as Stripe.Subscription).id, ref)
  } else if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session
    // Failed/unpaid async checkouts never grant access. Lifecycle events still record their state.
    if (session.payment_status === 'unpaid') return
    const subscriptionId = objectId(session.subscription)
    if (subscriptionId) await syncSubscription(service, subscriptionId, ref)
    else if (session.mode === 'payment') await syncPrepaidSession(service, session.id, ref)
  } else if (event.type.startsWith('invoice.')) {
    const id = invoiceSubscriptionId(event.data.object as Stripe.Invoice)
    if (id) await syncSubscription(service, id, ref)
  } else if (['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created'].includes(event.type)) {
    const risk = event.data.object as Stripe.Charge | Stripe.Dispute | Stripe.Radar.EarlyFraudWarning
    let paymentIntent = objectId(risk.payment_intent)
    if (!paymentIntent && 'charge' in risk) {
      const chargeId = objectId(risk.charge)
      if (chargeId) paymentIntent = objectId((await getStripe().charges.retrieve(chargeId)).payment_intent)
    }
    if (!paymentIntent) return
    const hold = event.type !== 'charge.refunded' || (risk as Stripe.Charge).refunded
    if (hold) await holdPrepaidPayment(service, paymentIntent, ref)
    const subscriptions = new Set<string>()
    for await (const payment of getStripe().invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntent }, status: 'paid', limit: 100 })) {
      const invoiceId = objectId(payment.invoice)
      if (!invoiceId) continue
      const invoice = await getStripe().invoices.retrieve(invoiceId)
      const id = invoiceSubscriptionId(invoice)
      if (id) subscriptions.add(id)
    }
    // A payment can cover multiple subscription invoices; each needs independent deduplication.
    for (const id of subscriptions) await syncSubscription(service, id, { ...ref, id: `${event.id}:${id}` }, hold)
  }
}
