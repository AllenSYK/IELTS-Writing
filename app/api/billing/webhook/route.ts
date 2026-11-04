import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { BILLING_EVENTS } from '@/lib/billing/config'
import { billingErrorResponse, getStripe } from '@/lib/billing/stripe'
import { processBillingEvent } from '@/lib/billing/service'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) return json({ success: false }, { status: 503 })
  const signature = request.headers.get('stripe-signature')
  if (!signature) return json({ success: false }, { status: 400 })
  let event
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret)
  } catch {
    return json({ success: false }, { status: 400 })
  }
  if (!(BILLING_EVENTS as readonly string[]).includes(event.type)) return json({ received: true })
  try {
    await processBillingEvent(createSupabaseServiceRoleClient(), event)
    return json({ received: true })
  } catch (error) {
    // A failed transaction returns non-2xx so Stripe retries delivery.
    return billingErrorResponse(error)
  }
}
