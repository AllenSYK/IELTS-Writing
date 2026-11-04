import Stripe from 'stripe'
import { billingScope } from './config'

export class BillingError extends Error {
  readonly status: number
  constructor(message: string, status = 503) {
    super(message)
    this.name = 'BillingError'
    this.status = status
  }
}

let client: Stripe | undefined
let clientKey: string | undefined

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key || !billingScope()) throw new BillingError('订阅支付暂未开放，请稍后重试。')
  if (!client || clientKey !== key) {
    client = new Stripe(key, {
      apiVersion: '2026-09-30.endive',
      timeout: 20_000,
      maxNetworkRetries: 2,
      appInfo: { name: 'IELTS Writing', version: '1.1.0' }
    })
    clientKey = key
  }
  return client
}

export function billingErrorResponse(error: unknown) {
  if (error instanceof Response) return error
  if (error instanceof BillingError) {
    return Response.json({ success: false, message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } })
  }
  // Stripe errors can include customer details and request parameters.
  console.error('[billing]', { type: error instanceof Error ? error.name : 'unknown' })
  return Response.json({ success: false, message: '支付服务暂时不可用，请稍后重试。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id || null
}

export function checkoutOrigin(request: Request) {
  // Never use forwarded-host or client input as a payment return destination.
  const url = new URL(request.url)
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin
  const configured = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configured) throw new BillingError('支付返回地址尚未配置。')
  const origin = new URL(configured)
  if (origin.protocol !== 'https:') throw new BillingError('支付返回地址需要使用 HTTPS。')
  return origin.origin
}
