import { z } from 'zod'
import { json } from '@/lib/http'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import { getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { startSubscriptionCheckout } from '@/lib/billing/service'
import { billingErrorResponse, checkoutOrigin } from '@/lib/billing/stripe'
import { startPrepaidCheckout } from '@/lib/billing/prepaid'
import { isActiveWebLicenseSnapshot, loadWebLicenseAccessSnapshot } from '@/lib/web-license/access'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertTrustedAdminMutationRequest(request)
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    const profile = await getWebProfile(user.id)
    if (profile?.role === 'admin' || profile?.license_status === 'suspended') {
      return json({ success: false, message: '当前账号不能开通订阅。' }, { status: 403 })
    }
    const body = z.union([
      z.object({ interval: z.enum(['month', 'year']), autoRenewConsent: z.literal(true) }).strict(),
      z.object({ purchase: z.literal('prepaid'), currency: z.enum(['cny', 'gbp']).default('cny'), termsConsent: z.literal(true) }).strict()
    ])
      .safeParse(await request.json().catch(() => null))
    if (!body.success) return json({ success: false, message: '请选择付款方案并同意相应条款。' }, { status: 400 })
    const limit = await checkRateLimit(`billing-checkout:${user.id}`, { maxRequests: 10, windowSeconds: 60 })
    if (!limit.allowed) return rateLimitResponse(limit)
    const service = createSupabaseServiceRoleClient()
    if (isActiveWebLicenseSnapshot(await loadWebLicenseAccessSnapshot(service, user.id))) {
      return json({ success: false, message: '当前会员权益仍有效，无需重复开通。' }, { status: 409 })
    }
    const url = 'purchase' in body.data
      ? await startPrepaidCheckout(service, user, checkoutOrigin(request), body.data.currency)
      : await startSubscriptionCheckout(service, user, body.data.interval, checkoutOrigin(request))
    return json({ success: true, url })
  } catch (error) { return billingErrorResponse(error) }
}
