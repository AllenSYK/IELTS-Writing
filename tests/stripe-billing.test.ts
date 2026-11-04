import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { startPrepaidCheckout, syncPrepaidSession } from '@/lib/billing/prepaid'
import { billingScope, hasPaidSubscriptionAccess } from '@/lib/billing/config'
import { startTrial, type TrialReservation } from '@/lib/billing/trials'
import { getStripe, checkoutOrigin } from '@/lib/billing/stripe'
import { getBillingPrices, getBillingPortalConfigurationId, paidInvoiceEnd, startSubscriptionCheckout } from '@/lib/billing/service'
import { POST as webhook } from '@/app/api/billing/webhook/route'
import { loadWebLicenseAccessSnapshot, isActiveWebLicenseSnapshot } from '@/lib/web-license/access'
import { loadBillingInvoices } from '@/lib/billing/invoices'

const NOW = Math.floor(Date.now() / 1000)
const FUTURE = NOW + 30 * 86400
const USER = '16f8f715-ac2b-4a94-a1db-9750cfda3c81'
const SECRET = 'whsec_billing_test_only'
const PRICE = 'price_billing_test'

test('invoice history uses the authenticated customer mapping and returns only safe billing fields', async (t) => {
  const { service, queries } = await fixture(t)
  const stripe = getStripe()
  stripe.invoices.list = (async (params: Stripe.InvoiceListParams) => {
    assert.equal(params?.customer, 'cus_billing_test')
    assert.equal(params?.limit, 12)
    return { has_more: false, data: [
      { id: 'in_visible', customer: 'cus_billing_test', livemode: false, status: 'paid', created: NOW, number: 'IELTS-01', total: 1999, currency: 'cny', hosted_invoice_url: 'https://invoice.stripe.com/i/test', customer_email: 'private@example.test' },
      { id: 'in_draft', customer: 'cus_billing_test', livemode: false, status: 'draft' }
    ] }
  }) as unknown as typeof stripe.invoices.list
  const history = await loadBillingInvoices(service, USER)
  assert.equal(history.invoices.length, 1)
  assert.deepEqual(Object.keys(history.invoices[0]).sort(), ['created', 'currency', 'id', 'number', 'status', 'total', 'url'])
  assert.equal(history.invoices[0].total, 1999)
  assert.equal(history.invoices[0].url, 'https://invoice.stripe.com/i/test')
  assert.ok(queries.some((query) => query.includes(`user_id=eq.${USER}`) && query.includes('stripe_account_id=eq.acct_billing_fixture') && query.includes('livemode=eq.false')))
})

test('invoice history rejects foreign customers and environments, and never links to arbitrary hosts', async (t) => {
  const { service } = await fixture(t)
  const stripe = getStripe()
  const item = { id: 'in_test', customer: 'cus_billing_test', livemode: false, status: 'paid', created: NOW, number: null, total: 1999, currency: 'cny', hosted_invoice_url: 'https://attacker.example/invoice' }
  stripe.invoices.list = (async () => ({ data: [item], has_more: false })) as unknown as typeof stripe.invoices.list
  assert.equal((await loadBillingInvoices(service, USER)).invoices[0].url, null)
  stripe.invoices.list = (async () => ({ data: [{ ...item, customer: 'cus_someone_else' }], has_more: false })) as unknown as typeof stripe.invoices.list
  await assert.rejects(loadBillingInvoices(service, USER), /账单暂时无法读取/)
  stripe.invoices.list = (async () => ({ data: [{ ...item, livemode: true }], has_more: false })) as unknown as typeof stripe.invoices.list
  await assert.rejects(loadBillingInvoices(service, USER), /账单暂时无法读取/)
})

test('an unconfigured or unmapped account has no fabricated invoice history and makes no Stripe request', async (t) => {
  const f = await fixture(t)
  const stripe = getStripe()
  stripe.invoices.list = (async () => { throw new Error('Must not call Stripe without a mapped customer') }) as unknown as typeof stripe.invoices.list
  f.unrelatedCustomer()
  assert.deepEqual(await loadBillingInvoices(f.service, USER), { configured: true, invoices: [], hasMore: false })
  process.env.STRIPE_SECRET_KEY = ''
  assert.deepEqual(await loadBillingInvoices(f.service, USER), { configured: false, invoices: [], hasMore: false })
})

function invoice(status = 'paid') {
  return {
    id: 'in_billing_test', status,
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_billing_test' } },
    lines: { has_more: false, data: [{
      pricing: { price_details: { price: PRICE } }, period: { start: NOW, end: FUTURE },
      parent: { type: 'subscription_item_details', subscription_item_details: { subscription: 'sub_billing_test', proration: false } }
    }] }
  } as unknown as Stripe.Invoice
}

async function fixture(t: TestContext) {
  const original = { ...process.env }
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_billing_fixture', STRIPE_ACCOUNT_ID: 'acct_billing_fixture',
    STRIPE_PRICE_MONTHLY: PRICE, STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture', VERCEL_ENV: 'development' })
  delete process.env.STRIPE_PRICE_YEARLY
  delete process.env.STRIPE_PREPAID_ENABLED
  delete process.env.STRIPE_PAYPAL_ENABLED
  delete process.env.STRIPE_TRIAL_ENABLED
  const writes: Array<Record<string, unknown>> = []
  const paymentWrites: Array<Record<string, unknown>> = []
  let prepaidPayment: Record<string, unknown> | null = null
  let replacePending = false
  let failDatabase = false
  let riskHold = false
  let mappedCustomer = true
  let trialReservation: TrialReservation | null = null
  let trialError = ''
  let trialSubscription: Record<string, unknown> | null = null
  let accessSubscription: Record<string, unknown> | null = null
  let pendingSessionMissing = false
  let releaseRace = false
  let expirationRace = ''
  const checkoutReleases: Array<{ query: string; body: unknown }> = []
  const queries: string[] = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : null
    const url = new URL(req.url || '/', 'http://localhost')
    queries.push(url.pathname + url.search)
    res.setHeader('Content-Type', 'application/json')
    if (failDatabase) { res.statusCode = 503; res.end('{"message":"unavailable"}'); return }
    if (url.pathname.endsWith('/rpc/get_web_license_access_state')) {
      res.end(JSON.stringify([{ profile_id: USER, profile_email: 'member@example.test', profile_role: 'user',
        profile_license_status: 'inactive', profile_license_expires_at: null, profile_manual_average_score: null }])); return
    }
    if (url.pathname.endsWith('/stripe_billing_subscriptions') && req.method === 'GET') {
      res.end(JSON.stringify(riskHold ? [] : accessSubscription ? [accessSubscription] : [{ stripe_subscription_id: 'sub_billing_test', status: 'active',
        paid_through: new Date(FUTURE * 1000).toISOString(), risk_hold: false, created_at: new Date().toISOString(), last_used_at: null }])); return
    }
    if (url.pathname.endsWith('/stripe_billing_customers') && req.method === 'GET') {
      res.end(JSON.stringify(mappedCustomer ? [{ user_id: USER, stripe_customer_id: 'cus_billing_test', stripe_account_id: 'acct_billing_fixture', livemode: false,
        ...(replacePending ? { checkout_request_id: 'request_previous', checkout_session_id: pendingSessionMissing ? null : 'cs_previous' } : {}) }] : [])); return
    }
    if (url.pathname.endsWith('/stripe_billing_payments') && req.method === 'GET') {
      res.end(JSON.stringify(prepaidPayment ? [prepaidPayment] : [])); return
    }
    if (url.pathname.endsWith('/stripe_billing_trials') && req.method === 'GET') {
      res.end(JSON.stringify(trialReservation ? [trialReservation] : [])); return
    }
    if (url.pathname.endsWith('/rpc/begin_stripe_trial')) {
      const message = trialError || (trialReservation?.stripe_subscription_id ? 'TRIAL_USED' : trialReservation && trialReservation.offer !== body.p_offer ? 'TRIAL_OTHER_OFFER' : '')
      if (message) { res.statusCode = 409; res.end(JSON.stringify({ message })); return }
      trialReservation ||= { request_id: '615e4715-ac2b-4a94-a1db-9750cfda3c81', offer: body.p_offer,
        price_id: PRICE, reserved_at: new Date(NOW * 1000).toISOString(), stripe_subscription_id: null, checkout_session_id: null }
      res.end(JSON.stringify(trialReservation)); return
    }
    if (url.pathname.endsWith('/rpc/begin_stripe_checkout')) {
      if (replacePending) { res.statusCode = 409; res.end('{"message":"CHECKOUT_IN_PROGRESS"}'); return }
      res.end(JSON.stringify({ request_id: '615e4715-ac2b-4a94-a1db-9750cfda3c81', session_id: null })); return
    }
    if (url.pathname.endsWith('/rpc/sync_stripe_subscription')) { writes.push(body.p_snapshot); res.end('null'); return }
    if (url.pathname.endsWith('/rpc/sync_stripe_payment')) { paymentWrites.push(body.p_snapshot); res.end('null'); return }
    if (req.method === 'PATCH') {
      if (url.pathname.endsWith('/stripe_billing_customers') && Date.parse(body.checkout_expires_at) === 0) {
        checkoutReleases.push({ query: url.search, body })
        if (releaseRace) { res.end('[]'); return }
        if (trialError === 'TRIAL_CHECKOUT_PENDING') trialError = ''
      }
      replacePending = false
      res.end(url.searchParams.has('select') ? JSON.stringify([{ stripe_customer_id: 'cus_billing_test' }]) : 'null')
      return
    }
    res.statusCode = 404; res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const service = createClient(base, 'fixture-service-key', { auth: { persistSession: false, autoRefreshToken: false } })
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key' })
  const stripe = getStripe()
  let paidInvoice = invoice()
  let subscriptionStatus = 'active'
  let priceAmount = 1999
  let existingSubscription = false
  let immediateCancellation = false
  const checkoutCalls: Array<{ params: Stripe.Checkout.SessionCreateParams; options?: Stripe.RequestOptions }> = []
  const trialCalls: Array<{ params: Stripe.SubscriptionCreateParams; options?: Stripe.RequestOptions }> = []
  let prepaidSession = {
    id: 'cs_prepaid_test', mode: 'payment', status: 'complete', payment_status: 'paid', livemode: false,
    customer: 'cus_billing_test', payment_intent: 'pi_prepaid_test', client_reference_id: USER,
    metadata: { application: 'ielts-writing', plan: 'prepaid_30_days', user_id: USER },
    amount_total: 1999, amount_subtotal: 1999, currency: 'cny', total_details: { amount_discount: 0, amount_tax: 0 }
  }
  stripe.checkout.sessions.retrieve = (async () => prepaidSession) as unknown as typeof stripe.checkout.sessions.retrieve
  let linePrice = { type: 'one_time', unit_amount: 1999, currency: 'cny' }
  stripe.checkout.sessions.listLineItems = (async () => ({ has_more: false, data: [{ quantity: 1, price: linePrice }] })) as unknown as typeof stripe.checkout.sessions.listLineItems
  const expiredSessions: string[] = []
  stripe.checkout.sessions.expire = (async (id: string) => {
    expiredSessions.push(id)
    if (expirationRace) {
      if (expirationRace === 'complete') prepaidSession.status = 'complete'
      throw new Error('Checkout expiration raced or failed')
    }
    prepaidSession.status = 'expired'
    return { ...prepaidSession, id }
  }) as unknown as typeof stripe.checkout.sessions.expire
  let paymentSessions = false
  stripe.checkout.sessions.list = (() => ({
    async *[Symbol.asyncIterator]() { if (paymentSessions) yield prepaidSession }
  })) as unknown as typeof stripe.checkout.sessions.list
  stripe.billingPortal.configurations.retrieve = (async () => ({ id: 'bpc_fixture', active: true, livemode: false,
    features: { subscription_cancel: { enabled: true, mode: immediateCancellation ? 'immediately' : 'at_period_end' },
      invoice_history: { enabled: true }, payment_method_update: { enabled: true }, subscription_update: { enabled: false } }
  })) as unknown as typeof stripe.billingPortal.configurations.retrieve
  stripe.prices.retrieve = (async () => ({ id: PRICE, active: true, type: 'recurring', currency: 'cny', unit_amount: priceAmount,
    recurring: { interval: 'month', interval_count: 1 }, livemode: false })) as unknown as typeof stripe.prices.retrieve
  stripe.subscriptions.retrieve = (async () => ({ id: 'sub_billing_test', customer: 'cus_billing_test', livemode: false,
    status: subscriptionStatus, cancel_at_period_end: true, cancel_at: FUTURE, created: NOW,
    items: { data: [{ quantity: 1, current_period_end: FUTURE, price: { id: PRICE, currency: 'cny', unit_amount: 1999, recurring: { interval: 'month' } } }] }, ...trialSubscription
  })) as unknown as typeof stripe.subscriptions.retrieve
  stripe.subscriptions.create = (async (params: Stripe.SubscriptionCreateParams, options?: Stripe.RequestOptions) => {
    trialCalls.push({ params, options })
    trialSubscription = { status: 'trialing', trial_start: NOW, trial_end: params.trial_end, cancel_at: params.cancel_at, metadata: params.metadata }
    return { id: 'sub_billing_test' }
  }) as unknown as typeof stripe.subscriptions.create
  stripe.invoices.list = (async () => ({ data: [paidInvoice] })) as unknown as typeof stripe.invoices.list
  stripe.invoices.retrieve = (async () => paidInvoice) as unknown as typeof stripe.invoices.retrieve
  stripe.invoicePayments.list = (() => ({
    async *[Symbol.asyncIterator]() { yield { invoice: 'in_billing_test' } }
  })) as unknown as typeof stripe.invoicePayments.list
  stripe.subscriptions.list = (() => ({
    async *[Symbol.asyncIterator]() { if (existingSubscription) yield { status: subscriptionStatus } }
  })) as unknown as typeof stripe.subscriptions.list
  stripe.checkout.sessions.create = (async (params, options) => {
    assert.ok(params)
    checkoutCalls.push({ params, options })
    return { id: 'cs_billing_test', url: 'https://checkout.stripe.com/c/pay/test', expires_at: FUTURE }
  }) as typeof stripe.checkout.sessions.create
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    for (const name of Object.keys(process.env)) if (!(name in original)) delete process.env[name]
    Object.assign(process.env, original)
  })
  function eventRequest(type: string, object: unknown, options: { signature?: boolean; livemode?: boolean; tamper?: boolean } = {}) {
    const payload = JSON.stringify({ id: 'evt_billing_test', object: 'event', type, livemode: options.livemode ?? false, data: { object } })
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    return new Request(`${base}/api/billing/webhook`, { method: 'POST',
      headers: options.signature === false ? {} : { 'stripe-signature': signature },
      body: options.tamper ? payload + ' ' : payload })
  }
  return { service, writes, paymentWrites, queries, checkoutCalls, trialCalls, eventRequest, expiredSessions, checkoutReleases,
    pendingSessionMissing: () => { pendingSessionMissing = true },
    releaseRace: () => { releaseRace = true },
    expirationRace: (value: string) => { expirationRace = value },
    trial: (value: TrialReservation | null) => { trialReservation = value },
    trialError: (value: string) => { trialError = value },
    trialSubscription: (value: Record<string, unknown>) => { trialSubscription = value },
    accessSubscription: (value: Record<string, unknown>) => { accessSubscription = value },
    linePrice: (value: typeof linePrice) => { linePrice = value },
    replacePending: () => { replacePending = true },
    prepaidSession: (value: Partial<typeof prepaidSession>) => { prepaidSession = { ...prepaidSession, ...value } },
    prepaidPayment: (value: Record<string, unknown>) => { prepaidPayment = value },
    paymentSessions: () => { paymentSessions = true },
    failDatabase: () => { failDatabase = true }, riskHold: () => { riskHold = true },
    unrelatedCustomer: () => { mappedCustomer = false },
    paidInvoice: (value: Stripe.Invoice) => { paidInvoice = value },
    status: (value: string) => { subscriptionStatus = value },
    amount: (value: number) => { priceAmount = value },
    existing: () => { existingSubscription = true }, immediateCancellation: () => { immediateCancellation = true } }
}

test('access is limited to a paid unexpired period, and rejects cancellation, failed payments, and risk holds', () => {
  const base = { status: 'active', paid_through: new Date(FUTURE * 1000).toISOString(), risk_hold: false }
  assert.equal(hasPaidSubscriptionAccess(base), true)
  assert.equal(hasPaidSubscriptionAccess({ ...base, status: 'past_due' }), true)
  for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing', 'paused']) {
    assert.equal(hasPaidSubscriptionAccess({ ...base, status }), false)
  }
  assert.equal(hasPaidSubscriptionAccess({ ...base, paid_through: new Date(0).toISOString() }), false)
  assert.equal(hasPaidSubscriptionAccess({ ...base, paid_through: null }), false)
  assert.equal(hasPaidSubscriptionAccess({ ...base, risk_hold: true }), false)
})

test('one-time checkout charges RMB 19.99 for 30 days, enables WeChat web flow, and requires no auto-renew consent or saved card', async (t) => {
  const f = await fixture(t)
  await assert.rejects(() => startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online'), /暂未开放/)
  process.env.STRIPE_PREPAID_ENABLED = 'true'
  await startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online')
  await startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online')
  const params = f.checkoutCalls[0].params
  assert.equal(params.mode, 'payment')
  assert.equal(params.line_items?.[0].price_data?.unit_amount, 1999)
  assert.equal(params.line_items?.[0].price_data?.currency, 'cny')
  assert.equal(params.line_items?.[0].quantity, 1)
  assert.deepEqual(params.payment_method_options, { wechat_pay: { client: 'web' } })
  assert.equal('payment_method_types' in params, false)
  assert.equal('subscription_data' in params, false)
  assert.equal('setup_future_usage' in (params.payment_intent_data || {}), false)
  assert.equal('automatic_tax' in params, false)
  assert.equal(params.metadata?.user_id, USER)
  assert.equal(f.checkoutCalls[0].options?.idempotencyKey, f.checkoutCalls[1].options?.idempotencyKey)
  f.existing()
  await assert.rejects(() => startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online'), /已有订阅/)
})

test('prepaid fulfillment verifies canonical payment, amount, currency, app, owner, and environment', async (t) => {
  const f = await fixture(t)
  await syncPrepaidSession(f.service, 'cs_prepaid_test')
  assert.equal(f.paymentWrites.length, 1)
  assert.equal(f.paymentWrites[0].user_id, USER)
  assert.equal(f.paymentWrites[0].payment_intent_id, 'pi_prepaid_test')
  assert.equal(f.paymentWrites[0].amount, 1999)
  assert.equal('expires_at' in f.paymentWrites[0], false)
  f.prepaidSession({ payment_status: 'unpaid' })
  await syncPrepaidSession(f.service, 'cs_prepaid_test')
  f.prepaidSession({ payment_status: 'paid', livemode: true })
  await syncPrepaidSession(f.service, 'cs_prepaid_test')
  f.prepaidSession({ livemode: false, client_reference_id: 'another-user' })
  await syncPrepaidSession(f.service, 'cs_prepaid_test')
  f.prepaidSession({ client_reference_id: USER, amount_total: 1 })
  await assert.rejects(() => syncPrepaidSession(f.service, 'cs_prepaid_test'), /不匹配/)
  assert.equal(f.paymentWrites.length, 1)
})

test('PayPal plan charges exactly GBP 2.49 once and verifies its own currency and fulfillment', async (t) => {
  const f = await fixture(t)
  process.env.STRIPE_PAYPAL_ENABLED = 'true'
  await startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online', 'gbp')
  const params = f.checkoutCalls[0].params
  assert.equal(params.mode, 'payment')
  assert.equal(params.line_items?.[0].price_data?.unit_amount, 249)
  assert.equal(params.line_items?.[0].price_data?.currency, 'gbp')
  assert.equal('payment_method_types' in params, false)
  assert.deepEqual(params.payment_method_options, { wechat_pay: { client: 'web' } })
  assert.equal(params.metadata?.plan, 'prepaid_30_days_gbp')
  f.prepaidSession({ metadata: { application: 'ielts-writing', plan: 'prepaid_30_days_gbp', user_id: USER } })
  await assert.rejects(() => syncPrepaidSession(f.service, 'cs_prepaid_test'), /不匹配/)
  f.prepaidSession({ amount_total: 249, amount_subtotal: 249, currency: 'gbp' })
  f.linePrice({ type: 'one_time', unit_amount: 249, currency: 'gbp' })
  await syncPrepaidSession(f.service, 'cs_prepaid_test')
  assert.equal(f.paymentWrites[0].amount, 249)
  assert.equal(f.paymentWrites[0].currency, 'gbp')
})

test('switching plans expires only the mapped customer unpaid checkout before creating another', async (t) => {
  const f = await fixture(t)
  process.env.STRIPE_PREPAID_ENABLED = 'true'
  f.replacePending()
  f.prepaidSession({ id: 'cs_previous', status: 'open', payment_status: 'unpaid' })
  await startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online')
  assert.deepEqual(f.expiredSessions, ['cs_previous'])
  assert.equal(f.checkoutCalls.length, 1)
  f.replacePending()
  f.prepaidSession({ status: 'complete', payment_status: 'paid' })
  await assert.rejects(() => startPrepaidCheckout(f.service, { id: USER }, 'https://www.ieltswriting.online'), /已提交/)
  assert.equal(f.checkoutCalls.length, 1)
})

test('signed prepaid checkout and async success grant access, while refunds can hold a payment before its completion event arrives', async (t) => {
  const f = await fixture(t)
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    assert.equal((await webhook(f.eventRequest(type, { id: 'cs_prepaid_test', mode: 'payment', payment_status: 'paid' }))).status, 200)
  }
  assert.equal(f.paymentWrites.length, 2)
  f.paymentSessions()
  assert.equal((await webhook(f.eventRequest('charge.refunded', { payment_intent: 'pi_prepaid_test', refunded: true }))).status, 200)
  assert.equal(f.paymentWrites.at(-1)?.risk_hold, true)
  f.failDatabase()
  assert.equal((await webhook(f.eventRequest('checkout.session.async_payment_succeeded', { id: 'cs_prepaid_test', mode: 'payment', payment_status: 'paid' }))).status, 503)
})

test('prepaid membership authorizes the mapped user and appears in payment history without auto renewal', async (t) => {
  const f = await fixture(t)
  f.riskHold()
  f.prepaidPayment({ checkout_session_id: 'cs_prepaid_test', paid_at: new Date(NOW * 1000).toISOString(),
    expires_at: new Date(FUTURE * 1000).toISOString(), amount: 1999, currency: 'cny', risk_hold: false, last_used_at: null })
  const snapshot = await loadWebLicenseAccessSnapshot(f.service, USER)
  assert.equal(isActiveWebLicenseSnapshot(snapshot), true)
  assert.equal(snapshot.activation?.source, 'stripe_payment')
  getStripe().invoices.list = (async () => ({ data: [], has_more: false })) as unknown as ReturnType<typeof getStripe>['invoices']['list']
  const history = await loadBillingInvoices(f.service, USER)
  assert.equal(history.invoices.some((row) => row.number === '30天会员 · 单次付款' && row.total === 1999), true)
  const queries = f.queries.filter((item) => item.includes('/stripe_billing_payments'))
  assert.ok(queries.every((query) => query.includes(`user_id=eq.${USER}`) && query.includes('stripe_account_id=eq.acct_billing_fixture') && query.includes('livemode=eq.false')))
})

test('sandbox keys cannot enable subscriptions on production and payment redirects ignore client-controlled hosts', async (t) => {
  await fixture(t)
  assert.equal(billingScope()?.livemode, false)
  process.env.VERCEL_ENV = 'production'
  assert.equal(billingScope(), null)
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.ieltswriting.online'
  assert.equal(checkoutOrigin(new Request('https://attacker.test/api/billing/checkout', { headers: { 'x-forwarded-host': 'attacker.test' } })), 'https://www.ieltswriting.online')
})

test('paid invoice validation rejects unpaid invoices, unrelated subscriptions, and unrelated prices', () => {
  assert.equal(paidInvoiceEnd(invoice(), 'sub_billing_test', PRICE), new Date(FUTURE * 1000).toISOString())
  assert.equal(paidInvoiceEnd(invoice('open'), 'sub_billing_test', PRICE), null)
  assert.equal(paidInvoiceEnd(invoice(), 'sub_other', PRICE), null)
  assert.equal(paidInvoiceEnd(invoice(), 'sub_billing_test', 'price_other'), null)
})

test('checkout charges only the server-configured RMB 19.99 recurring price and reuses its persistent idempotency key', async (t) => {
  const f = await fixture(t)
  await startSubscriptionCheckout(f.service, { id: USER }, 'month', 'https://www.ieltswriting.online')
  await startSubscriptionCheckout(f.service, { id: USER }, 'month', 'https://www.ieltswriting.online')
  assert.equal(f.checkoutCalls.length, 2)
  assert.equal(f.checkoutCalls[0].options?.idempotencyKey, f.checkoutCalls[1].options?.idempotencyKey)
  const params = f.checkoutCalls[0].params
  assert.equal(params.mode, 'subscription')
  assert.deepEqual(params.line_items, [{ price: PRICE, quantity: 1 }])
  assert.equal(params.customer, 'cus_billing_test')
  assert.deepEqual(params.subscription_data?.billing_mode, { type: 'flexible' })
  assert.deepEqual(params.adaptive_pricing, { enabled: false })
  assert.equal('automatic_tax' in params, false)
  assert.equal('payment_method_types' in params, false)
  assert.match(params.integration_identifier!, /[a-z]{8}$/)
  f.amount(1990)
  await assert.rejects(() => getBillingPrices(), /价格配置/)
})

test('checkout refuses a second subscription and refuses payment when webhook verification is not configured', async (t) => {
  const f = await fixture(t)
  f.existing()
  await assert.rejects(() => startSubscriptionCheckout(f.service, { id: USER }, 'month', 'https://www.ieltswriting.online'), /已有订阅/)
  delete process.env.STRIPE_WEBHOOK_SECRET
  await assert.rejects(() => startSubscriptionCheckout(f.service, { id: USER }, 'month', 'https://www.ieltswriting.online'), /暂未开放/)
  assert.equal(f.checkoutCalls.length, 0)
})

test('checkout requires a portal with period-end cancellation and rejects unsafe or missing portal settings', async (t) => {
  const f = await fixture(t)
  assert.equal(await getBillingPortalConfigurationId(), 'bpc_fixture')
  f.immediateCancellation()
  await assert.rejects(() => startSubscriptionCheckout(f.service, { id: USER }, 'month', 'https://www.ieltswriting.online'), /订阅管理配置有误/)
  delete process.env.STRIPE_PORTAL_CONFIGURATION_ID
  await assert.rejects(() => getBillingPortalConfigurationId(), /订阅管理尚未配置/)
  assert.equal(f.checkoutCalls.length, 0)
})

test('webhook rejects missing signatures, tampering, and mismatched payment modes before any database write', async (t) => {
  const f = await fixture(t)
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice(), { signature: false }))).status, 400)
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice(), { tamper: true }))).status, 400)
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice(), { livemode: true }))).status, 400)
  assert.equal(f.writes.length, 0)
})

test('signed invoice payment fulfills the mapped account, and canceled-renewal still preserves the paid period', async (t) => {
  const f = await fixture(t)
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice()))).status, 200)
  assert.equal(f.writes[0].user_id, USER)
  assert.equal(f.writes[0].paid_through, new Date(FUTURE * 1000).toISOString())
  assert.equal(f.writes[0].cancel_at_period_end, true)
  assert.equal(f.writes[0].status, 'active')
  f.paidInvoice(invoice('open'))
  f.status('past_due')
  assert.equal((await webhook(f.eventRequest('invoice.payment_failed', invoice('open')))).status, 200)
  assert.equal(f.writes[1].paid_through, null)
})

test('unpaid async checkout never grants rights and failed persistence remains retryable', async (t) => {
  const f = await fixture(t)
  assert.equal((await webhook(f.eventRequest('checkout.session.completed', { subscription: 'sub_billing_test', payment_status: 'unpaid' }))).status, 200)
  assert.equal(f.writes.length, 0)
  f.failDatabase()
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice()))).status, 503)
})

test('full refunds, disputes, and fraud warnings follow the payment-to-invoice graph and suspend the matching subscription', async (t) => {
  const f = await fixture(t)
  for (const type of ['charge.refunded', 'charge.dispute.created', 'radar.early_fraud_warning.created']) {
    assert.equal((await webhook(f.eventRequest(type, { payment_intent: 'pi_test', refunded: true }))).status, 200)
    assert.equal(f.writes.at(-1)?.risk_hold, true)
  }
  assert.equal((await webhook(f.eventRequest('charge.refunded', { payment_intent: 'pi_test', refunded: false }))).status, 200)
  assert.equal(f.writes.at(-1)?.risk_hold, false)
  f.unrelatedCustomer()
  const count = f.writes.length
  assert.equal((await webhook(f.eventRequest('invoice.paid', invoice()))).status, 200)
  assert.equal(f.writes.length, count)
})

test('subscription rights feed existing writing authorization while keeping all queries scoped to the user and Stripe environment', async (t) => {
  const f = await fixture(t)
  const snapshot = await loadWebLicenseAccessSnapshot(f.service, USER)
  assert.equal(isActiveWebLicenseSnapshot(snapshot), true)
  assert.equal(snapshot.activation?.source, 'stripe')
  assert.equal(snapshot.activation?.user_id, USER)
  const query = f.queries.find((item) => item.includes('/stripe_billing_subscriptions'))!
  assert.ok(query.includes(`user_id=eq.${USER}`))
  assert.ok(query.includes('stripe_account_id=eq.acct_billing_fixture'))
  assert.ok(query.includes('livemode=eq.false'))
  f.riskHold()
  assert.equal(isActiveWebLicenseSnapshot(await loadWebLicenseAccessSnapshot(f.service, USER)), false)
})

test('one-day no-card trial sets an unconditional cancellation and reuses its durable idempotency key', async (t) => {
  const f = await fixture(t)
  await startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online')
  await startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online')
  const params = f.trialCalls[0].params
  assert.equal(params.trial_end, NOW + 86400)
  assert.equal(params.cancel_at, params.trial_end)
  assert.deepEqual(params.trial_settings, { end_behavior: { missing_payment_method: 'cancel' } })
  assert.equal('default_payment_method' in params, false)
  assert.equal(f.trialCalls[0].options?.idempotencyKey, f.trialCalls[1].options?.idempotencyKey)
  assert.equal(f.writes[0].trial_end, new Date((NOW + 86400) * 1000).toISOString())
  assert.ok(f.writes[0].trial_request_id)
  assert.equal(f.checkoutCalls.length, 0)
})

test('three-day card trial collects a payment method and records consent without granting rights before confirmation', async (t) => {
  const f = await fixture(t)
  const result = await startTrial(f.service, { id: USER }, 'card', 'https://www.ieltswriting.online')
  assert.ok('url' in result)
  const params = f.checkoutCalls[0].params
  assert.equal(params.mode, 'subscription')
  assert.equal(params.payment_method_collection, 'always')
  assert.equal(params.subscription_data?.trial_period_days, 3)
  assert.deepEqual(params.line_items, [{ price: PRICE, quantity: 1 }])
  assert.match(params.custom_text?.submit ? params.custom_text.submit.message : '', /19.99.*自动续费/)
  assert.equal('payment_method_types' in params, false)
  assert.equal(f.writes.length, 0)
  assert.equal(f.trialCalls.length, 0)
  await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /另一种试用/)
})

test('trial claims reject duplicate use, other active subscriptions and disabled trial configuration', async (t) => {
  const f = await fixture(t)
  f.trialError('TRIAL_USED')
  await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /一次试用/)
  f.existing()
  await assert.rejects(startTrial(f.service, { id: USER }, 'card', 'https://www.ieltswriting.online'), /已有订阅/)
  process.env.STRIPE_TRIAL_ENABLED = 'false'
  await assert.rejects(startTrial(f.service, { id: USER }, 'card', 'https://www.ieltswriting.online'), /暂未开放/)
  assert.equal(f.trialCalls.length, 0)
  assert.equal(f.checkoutCalls.length, 0)
})

test('verified trial projection authorizes writing and revokes access exactly at expiry', async (t) => {
  const f = await fixture(t)
  f.accessSubscription({ stripe_subscription_id: 'sub_trial', status: 'trialing', paid_through: null,
    trial_start: new Date(NOW * 1000).toISOString(), trial_end: new Date((NOW + 86400) * 1000).toISOString(),
    trial_offer: 'no_card', risk_hold: false, last_used_at: null })
  const snapshot = await loadWebLicenseAccessSnapshot(f.service, USER)
  assert.equal(isActiveWebLicenseSnapshot(snapshot), true)
  assert.equal(snapshot.activation?.source, 'stripe_trial')
  assert.equal(isActiveWebLicenseSnapshot(snapshot, (NOW + 86400) * 1000), false)
  f.accessSubscription({ stripe_subscription_id: 'sub_trial', status: 'trialing', paid_through: null,
    trial_start: new Date(NOW * 1000).toISOString(), trial_end: new Date((NOW + 86400) * 1000).toISOString(),
    trial_offer: null, risk_hold: false })
  assert.equal(isActiveWebLicenseSnapshot(await loadWebLicenseAccessSnapshot(f.service, USER)), false)
})

test('switching an unpaid monthly checkout to either trial expires the old session and releases only its reservation', async (t) => {
  for (const offer of ['no_card', 'card'] as const) await t.test(offer, async (t) => {
    const f = await fixture(t)
    f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
    f.prepaidSession({ id: 'cs_previous', status: 'open', payment_status: 'unpaid' })
    const result = await startTrial(f.service, { id: USER }, offer, 'https://www.ieltswriting.online')
    assert.deepEqual(f.expiredSessions, ['cs_previous'])
    assert.equal(f.checkoutReleases.length, 1)
    const query = new URLSearchParams(f.checkoutReleases[0].query)
    assert.equal(query.get('checkout_request_id'), 'eq.request_previous')
    assert.equal(query.get('checkout_session_id'), 'eq.cs_previous')
    assert.equal(query.get('stripe_customer_id'), 'eq.cus_billing_test')
    assert.equal(query.get('stripe_account_id'), 'eq.acct_billing_fixture')
    assert.equal(query.get('livemode'), 'eq.false')
    assert.equal(offer === 'no_card' ? 'active' in result : 'url' in result, true)
  })
})

test('an already expired checkout releases its reservation without trying to expire it again', async (t) => {
  const f = await fixture(t)
  f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
  f.prepaidSession({ id: 'cs_previous', status: 'expired', payment_status: 'unpaid' })
  assert.equal('active' in await startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), true)
  assert.equal(f.expiredSessions.length, 0)
  assert.equal(f.checkoutReleases.length, 1)
})

test('completed checkouts remain protected whether paid or still processing an asynchronous payment', async (t) => {
  for (const payment_status of ['paid', 'unpaid']) await t.test(payment_status, async (t) => {
    const f = await fixture(t)
    f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
    f.prepaidSession({ id: 'cs_previous', status: 'complete', payment_status })
    await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /付款已提交/)
    assert.equal(f.expiredSessions.length, 0)
    assert.equal(f.checkoutReleases.length, 0)
    assert.equal(f.trialCalls.length, 0)
    assert.equal(f.checkoutCalls.length, 0)
  })
})

test('foreign customer and environment checkouts are never expired or unlocked', async (t) => {
  for (const mismatch of [{ customer: 'cus_foreign' }, { livemode: true }]) await t.test(JSON.stringify(mismatch), async (t) => {
    const f = await fixture(t)
    f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
    f.prepaidSession({ id: 'cs_previous', status: 'open', payment_status: 'unpaid', ...mismatch })
    await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /无法核实/)
    assert.equal(f.expiredSessions.length, 0)
    assert.equal(f.checkoutReleases.length, 0)
    assert.equal(f.trialCalls.length, 0)
  })
})

test('checkout completing during expiration is rechecked and never unlocks a trial', async (t) => {
  const f = await fixture(t)
  f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
  f.prepaidSession({ id: 'cs_previous', status: 'open', payment_status: 'unpaid' })
  f.expirationRace('complete')
  await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /付款已提交/)
  assert.equal(f.checkoutReleases.length, 0)
  assert.equal(f.trialCalls.length, 0)
})

test('failed expiration and a concurrent newer reservation cannot be overwritten by checkout recovery', async (t) => {
  for (const failure of ['provider', 'new_reservation']) await t.test(failure, async (t) => {
    const f = await fixture(t)
    f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING')
    f.prepaidSession({ id: 'cs_previous', status: 'open', payment_status: 'unpaid' })
    if (failure === 'provider') f.expirationRace('error')
    else f.releaseRace()
    await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), failure === 'provider' ? /expiration/ : /状态正在更新/)
    assert.equal(f.trialCalls.length, 0)
    assert.equal(f.checkoutCalls.length, 0)
  })
})

test('a checkout still being created is not cleared and does not consume a trial opportunity', async (t) => {
  const f = await fixture(t)
  f.replacePending(); f.trialError('TRIAL_CHECKOUT_PENDING'); f.pendingSessionMissing()
  await assert.rejects(startTrial(f.service, { id: USER }, 'no_card', 'https://www.ieltswriting.online'), /仍在准备/)
  assert.equal(f.expiredSessions.length, 0)
  assert.equal(f.checkoutReleases.length, 0)
  assert.equal(f.trialCalls.length, 0)
})
