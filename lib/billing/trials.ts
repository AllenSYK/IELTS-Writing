import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope, trialBillingEnabled, TRIAL_OFFERS, type TrialOffer } from './config'
import { BillingError, getStripe } from './stripe'
import { ensureBillingCustomer, getBillingPortalConfigurationId, getBillingPrices, syncSubscription } from './service'
import { releaseCheckoutForTrial } from './checkout'

export type TrialReservation = {
  request_id: string
  offer: TrialOffer
  price_id: string
  reserved_at: string
  stripe_subscription_id: string | null
  checkout_session_id: string | null
}

export async function findTrial(service: SupabaseClient, userId: string) {
  const scope = billingScope()
  if (!scope) return null
  const { data, error } = await service.from('stripe_billing_trials')
    .select('request_id, offer, price_id, reserved_at, stripe_subscription_id, checkout_session_id')
    .eq('user_id', userId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).maybeSingle()
  if (error) throw error
  return data as TrialReservation | null
}

export async function startTrial(service: SupabaseClient, user: { id: string; email?: string | null }, offer: TrialOffer, origin: string) {
  if (!trialBillingEnabled()) throw new BillingError('免费试用暂未开放，请稍后重试。')
  if (offer === 'card') await getBillingPortalConfigurationId()
  const price = (await getBillingPrices()).find((item) => item.interval === 'month')
  if (!price) throw new BillingError('试用方案暂未配置。')
  const customer = await ensureBillingCustomer(service, user)
  const stripe = getStripe()
  const previous = await findTrial(service, user.id)
  let recovering: Stripe.Subscription | undefined
  for await (const subscription of stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: 'all', limit: 100 })) {
    if (previous && subscription.metadata?.trial_request_id === previous.request_id && subscription.status === 'trialing') recovering = subscription
    else if (subscription.trial_start || !['canceled', 'incomplete_expired'].includes(subscription.status)) {
      throw new BillingError('此账号已领取过试用或已有订阅，不能再次领取。', 409)
    }
  }
  // Recover a Stripe success followed by a failed database write, without issuing a second trial.
  if (recovering) {
    if (previous?.offer !== offer) throw new BillingError('此账号已领取过另一种试用，不能再次领取。', 409)
    await syncSubscription(service, recovering.id)
    return { active: true }
  }
  let reservation: TrialReservation | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await service.rpc('begin_stripe_trial', {
      p_customer_id: customer.stripe_customer_id, p_offer: offer, p_price_id: price.id
    }).single<TrialReservation>()
    if (!error) { reservation = data; break }
    if (error.message.includes('TRIAL_USED')) throw new BillingError('每个账号仅有一次试用机会，你已领取过试用。', 409)
    if (error.message.includes('TRIAL_OTHER_OFFER')) throw new BillingError('你已选择另一种试用，请继续完成原试用，或联系支持。', 409)
    if (error.message.includes('TRIAL_CHECKOUT_PENDING')) {
      if (attempt === 0 && await releaseCheckoutForTrial(service, customer.stripe_customer_id)) continue
      throw new BillingError('支付页面仍在准备或状态正在更新，请稍后重试。', 409)
    }
    if (error.message.includes('TRIAL_NOT_ELIGIBLE')) throw new BillingError('当前账号已有会员权益或使用受限，无法领取试用。', 409)
    throw error
  }
  if (!reservation) throw new BillingError('试用领取状态正在更新，请稍后重试。', 409)
  if (offer === 'no_card') {
    const end = Math.floor(Date.parse(reservation.reserved_at) / 1000) + TRIAL_OFFERS.no_card.days * 86400
    if (end <= Math.floor(Date.now() / 1000)) throw new BillingError('此账号的试用机会已过期。', 409)
    const subscription = await stripe.subscriptions.create({
      customer: customer.stripe_customer_id,
      items: [{ price: reservation.price_id, quantity: 1 }],
      billing_mode: { type: 'flexible' },
      trial_end: end,
      // Cancel even if this customer already has a saved card. This offer never auto-renews.
      cancel_at: end,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: { application: 'ielts-writing', trial_request_id: reservation.request_id }
    }, { idempotencyKey: `ielts-trial:${reservation.request_id}` })
    await syncSubscription(service, subscription.id)
    return { active: true }
  }
  if (reservation.checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(reservation.checkout_session_id)
    if (session.status === 'open' && session.url) return { url: session.url }
    if (session.status === 'complete') throw new BillingError('绑卡已提交，请刷新会员状态，等待试用权益同步。', 409)
    throw new BillingError('试用确认页面已过期，请联系支持处理。', 409)
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', customer: customer.stripe_customer_id, client_reference_id: user.id,
    line_items: [{ price: reservation.price_id, quantity: 1 }],
    payment_method_collection: 'always',
    success_url: `${origin}/billing?checkout=success`, cancel_url: `${origin}/billing?checkout=canceled`,
    integration_identifier: `ielts-trial-${reservation.request_id.replaceAll('-', '').slice(0, 8).split('').map((char) => String.fromCharCode(97 + parseInt(char, 16))).join('')}`,
    adaptive_pricing: { enabled: false },
    custom_text: { submit: { message: '绑定支付方式后免费试用3天，试用结束后按人民币19.99元/月自动续费。可在试用结束前通过网站“管理订阅”取消续费。每个账号只能领取一种试用。' } },
    subscription_data: {
      billing_mode: { type: 'flexible' }, trial_period_days: TRIAL_OFFERS.card.days,
      trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      metadata: { application: 'ielts-writing', trial_request_id: reservation.request_id }
    }
  }, { idempotencyKey: `ielts-trial-checkout:${reservation.request_id}` })
  const scope = billingScope()!
  const { error: saveError } = await service.from('stripe_billing_trials').update({ checkout_session_id: session.id })
    .eq('user_id', user.id).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode).eq('request_id', reservation.request_id)
  if (saveError) throw saveError
  const { error: customerError } = await service.from('stripe_billing_customers').update({ checkout_session_id: session.id, checkout_expires_at: new Date(session.expires_at * 1000).toISOString() })
    .eq('stripe_customer_id', customer.stripe_customer_id).eq('checkout_request_id', reservation.request_id)
  if (customerError) throw customerError
  if (!session.url) throw new BillingError('试用确认页面创建失败，请重试。')
  return { url: session.url }
}
