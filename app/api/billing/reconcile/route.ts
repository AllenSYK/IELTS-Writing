import { json } from '@/lib/http'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { findBillingCustomer, reconcileCustomer } from '@/lib/billing/service'
import { billingErrorResponse } from '@/lib/billing/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertTrustedAdminMutationRequest(request)
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    const limit = await checkRateLimit(`billing-reconcile:${user.id}`, { maxRequests: 6, windowSeconds: 60 })
    if (!limit.allowed) return rateLimitResponse(limit)
    const service = createSupabaseServiceRoleClient()
    const customer = await findBillingCustomer(service, user.id)
    if (customer) await reconcileCustomer(service, customer)
    return json({ success: true })
  } catch (error) { return billingErrorResponse(error) }
}
