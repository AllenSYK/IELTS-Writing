import fs from 'node:fs'
import dotenv from 'dotenv'
import Stripe from 'stripe'

const sourceFile = process.argv.find((arg) => arg.startsWith('--env-file='))?.slice('--env-file='.length) || '.env.local'
const outputFile = process.argv.find((arg) => arg.startsWith('--output-env-file='))?.slice('--output-env-file='.length) || '.env.local'
const source = dotenv.parse(fs.readFileSync(sourceFile, 'utf8'))
const key = source.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
if (!/^(sk|rk)_(test|live)_/.test(key || '')) throw new Error('A server-side Stripe API key is required')
if (/^(sk|rk)_live_/.test(key) && outputFile === '.env.local') {
  throw new Error('Live setup requires a separate --output-env-file to preserve local sandbox settings')
}
const stripe = new Stripe(key, { apiVersion: '2026-09-30.endive', timeout: 20000, maxNetworkRetries: 2 })
const account = await stripe.accounts.retrieve()
const expectedAccount = process.argv.find((arg) => arg.startsWith('--account='))?.slice('--account='.length) || source.STRIPE_ACCOUNT_ID
if (expectedAccount && account.id !== expectedAccount) throw new Error('Stripe API key belongs to a different account')
let local = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : ''
const previous = dotenv.parse(local)
const switchingAccount = previous.STRIPE_ACCOUNT_ID !== account.id
  || /^(sk|rk)_live_/.test(previous.STRIPE_SECRET_KEY || '') !== /^(sk|rk)_live_/.test(key)
const monthly = await stripe.prices.list({ lookup_keys: ['ielts-writing-cny-monthly-1999'], limit: 1 })
let price = monthly.data[0]
if (!price) {
  const product = await stripe.products.create({ name: '空与梦雅思写作 · 标准会员', metadata: { application: 'ielts-writing' } }, { idempotencyKey: 'ielts-writing-standard-product-v1' })
  price = await stripe.prices.create({
    product: product.id, currency: 'cny', unit_amount: 1999,
    recurring: { interval: 'month' }, lookup_key: 'ielts-writing-cny-monthly-1999',
    tax_behavior: 'inclusive'
  }, { idempotencyKey: 'ielts-writing-cny-monthly-1999-v1' })
}
if (!price.active || price.currency !== 'cny' || price.unit_amount !== 1999
  || price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1
  || price.livemode !== /^(sk|rk)_live_/.test(key)) throw new Error('Existing monthly price does not match the required plan')
const portals = await stripe.billingPortal.configurations.list({ limit: 100 })
let portal = portals.data.find((item) => item.active && item.metadata?.application === 'ielts-writing'
  && item.features.subscription_cancel.enabled && item.features.subscription_cancel.mode === 'at_period_end'
  && item.features.invoice_history.enabled && item.features.payment_method_update.enabled
  && !item.features.subscription_update.enabled)
if (!portal) {
  portal = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: '管理空与梦雅思写作会员',
      privacy_policy_url: 'https://www.ieltswriting.online/privacy',
      terms_of_service_url: 'https://www.ieltswriting.online/terms'
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
      subscription_update: { enabled: false }
    },
    metadata: { application: 'ielts-writing' }
  }, { idempotencyKey: 'ielts-writing-billing-portal-v1' })
}
const settings = {
  STRIPE_SECRET_KEY: key,
  ...(source.STRIPE_PUBLISHABLE_KEY ? { STRIPE_PUBLISHABLE_KEY: source.STRIPE_PUBLISHABLE_KEY } : {}),
  ...(source.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY } : {}),
  STRIPE_ACCOUNT_ID: account.id,
  STRIPE_PRICE_MONTHLY: price.id,
  STRIPE_PORTAL_CONFIGURATION_ID: portal.id
}
const webhookUrl = process.argv.find((arg) => arg.startsWith('--webhook-url='))?.slice('--webhook-url='.length)
if (webhookUrl) {
  if (!webhookUrl.startsWith('https://')) throw new Error('Webhook URL must use HTTPS')
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const existing = endpoints.data.find((item) => item.url === webhookUrl)
  const { BILLING_EVENTS } = await import('../lib/billing/config.ts')
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, {
      enabled_events: [...BILLING_EVENTS], disabled: false
    })
    console.log('Webhook already exists. Keep the signing secret already stored for this endpoint.')
  } else {
    const webhook = await stripe.webhookEndpoints.create({
      url: webhookUrl, api_version: '2026-09-30.endive', enabled_events: [...BILLING_EVENTS],
      description: 'IELTS Writing subscription lifecycle and payment risk'
    })
    settings.STRIPE_WEBHOOK_SECRET = webhook.secret
  }
}
if (switchingAccount) {
  // These values belong to the previous account, and cannot be carried across.
  const stale = ['STRIPE_PRICE_YEARLY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_MCP_KEY',
    'STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
  for (const name of stale) local = local.replace(new RegExp(`^${name}=.*(?:\\r?\\n|$)`, 'gm'), '')
}
for (const [name, value] of Object.entries(settings)) {
  const line = `${name}=${JSON.stringify(value)}`
  const pattern = new RegExp(`^${name}=.*$`, 'gm')
  local = pattern.test(local) ? local.replace(pattern, () => line) : `${local.trimEnd()}\n${line}\n`
}
fs.writeFileSync(outputFile, local, { mode: 0o600 })
fs.chmodSync(outputFile, 0o600)
console.log(JSON.stringify({ account: account.id, price: price.id, amount: price.unit_amount, currency: price.currency,
  interval: price.recurring.interval, livemode: price.livemode, portal: portal.id,
  accountChanged: switchingAccount,
  webhookConfigured: Boolean(settings.STRIPE_WEBHOOK_SECRET || (!switchingAccount && previous.STRIPE_WEBHOOK_SECRET)) }))
