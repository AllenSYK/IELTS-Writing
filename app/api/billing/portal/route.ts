import { json } from '@/lib/http'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { findBillingCustomer, getBillingPortalConfigurationId } from '@/lib/billing/service'
import { billingErrorResponse, checkoutOrigin, getStripe } from '@/lib/billing/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertTrustedAdminMutationRequest(request)
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    const customer = await findBillingCustomer(createSupabaseServiceRoleClient(), user.id)
    if (!customer) return json({ success: false, message: '当前账号还没有订阅记录。' }, { status: 404 })
    const session = await getStripe().billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${checkoutOrigin(request)}/billing`,
      configuration: await getBillingPortalConfigurationId()
    })
    return json({ success: true, url: session.url })
  } catch (error) { return billingErrorResponse(error) }
}
