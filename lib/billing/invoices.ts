import type { SupabaseClient } from '@supabase/supabase-js'
import { billingScope } from './config'
import { findBillingCustomer } from './service'
import { BillingError, getStripe, objectId } from './stripe'

export type BillingInvoice = {
  id: string
  number: string | null
  created: number
  total: number
  currency: string
  status: string
  url: string | null
}

function hostedInvoiceUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['invoice.stripe.com', 'invoices.stripe.com', 'pay.stripe.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}

export async function loadBillingInvoices(service: SupabaseClient, userId: string) {
  const scope = billingScope()
  if (!scope) return { configured: false, invoices: [] as BillingInvoice[], hasMore: false }
  const customer = await findBillingCustomer(service, userId)
  if (!customer) return { configured: true, invoices: [] as BillingInvoice[], hasMore: false }
  const result = await getStripe().invoices.list({ customer: customer.stripe_customer_id, limit: 12 })
  // Never return another customer's invoice, including a response from the wrong environment.
  if (result.data.some((invoice) => objectId(invoice.customer) !== customer.stripe_customer_id || invoice.livemode !== scope.livemode)) {
    throw new BillingError('账单暂时无法读取，请稍后重试。')
  }
  const invoices = result.data.filter((invoice) => invoice.status && invoice.status !== 'draft').map((invoice): BillingInvoice => ({
    id: invoice.id,
    number: invoice.number,
    created: invoice.created,
    total: invoice.total,
    currency: invoice.currency,
    status: invoice.status!,
    url: hostedInvoiceUrl(invoice.hosted_invoice_url)
  }))
  const { data: payments, error } = await service.from('stripe_billing_payments')
    .select('checkout_session_id, paid_at, amount, currency, risk_hold')
    .eq('user_id', userId).eq('stripe_customer_id', customer.stripe_customer_id)
    .eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
    .order('paid_at', { ascending: false }).limit(13)
  if (error) throw error
  for (const payment of payments || []) invoices.push({
    id: payment.checkout_session_id, number: '30天会员 · 单次付款', created: Date.parse(payment.paid_at) / 1000,
    total: payment.amount, currency: payment.currency, status: payment.risk_hold ? 'review' : 'paid', url: null
  })
  invoices.sort((a, b) => b.created - a.created)
  return { configured: true, invoices: invoices.slice(0, 12), hasMore: result.has_more || invoices.length > 12 }
}
