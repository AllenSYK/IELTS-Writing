import { z } from 'zod'
import { json } from '@/lib/http'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service'
import { isActiveWebLicenseSnapshot, loadWebLicenseAccessSnapshot } from '@/lib/web-license/access'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { billingErrorResponse, checkoutOrigin } from '@/lib/billing/stripe'
import { startTrial } from '@/lib/billing/trials'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertTrustedAdminMutationRequest(request)
    const user = await getCurrentSupabaseUser()
    if (!user) return json({ success: false, message: '请先登录。' }, { status: 401 })
    const input = z.union([
      z.object({ offer: z.literal('no_card') }).strict(),
      z.object({ offer: z.literal('card'), autoRenewConsent: z.literal(true) }).strict()
    ]).safeParse(await request.json().catch(() => null))
    if (!input.success) return json({ success: false, message: '请选择试用方式，绑卡试用需先同意自动续费。' }, { status: 400 })
    const limit = await checkRateLimit(`billing-trial:${user.id}`, { maxRequests: 5, windowSeconds: 60 })
    if (!limit.allowed) return rateLimitResponse(limit)
    const service = createSupabaseServiceRoleClient()
    const snapshot = await loadWebLicenseAccessSnapshot(service, user.id)
    if (!snapshot.profile || snapshot.profile.role === 'admin' || snapshot.profile.license_status === 'suspended' || isActiveWebLicenseSnapshot(snapshot)) {
      return json({ success: false, message: '当前账号已有会员权益或使用受限，无法重复领取试用。' }, { status: 409 })
    }
    const result = await startTrial(service, user, input.data.offer, checkoutOrigin(request))
    if ('active' in result && !isActiveWebLicenseSnapshot(await loadWebLicenseAccessSnapshot(service, user.id))) {
      return json({ success: false, message: '试用已提交，权益正在同步，请刷新会员状态。' }, { status: 503 })
    }
    return json({ success: true, ...result })
  } catch (error) { return billingErrorResponse(error) }
}
