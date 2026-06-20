import { z } from 'zod'
import { json } from '@/lib/http'
import { normalizeMainlandPhone } from '@/lib/phone-auth'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { CurrentAgreementVersions, recordUserAgreements } from '@/lib/legal-agreements'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { checkActiveWebLicenseForUser, getWebProfile } from '@/lib/web-license/auth'

const VerifyPhoneCodeSchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().regex(/^\d{6}$/),
  mode: z.enum(['login', 'register']),
  agreementsAccepted: z.literal(true),
  agreementVersions: z.object({
    terms: z.literal(CurrentAgreementVersions.terms),
    privacy: z.literal(CurrentAgreementVersions.privacy)
  })
})

export async function POST(request: Request) {
  try {
    const body = VerifyPhoneCodeSchema.parse(await request.json())
    const phone = normalizeMainlandPhone(body.phone)
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: body.code,
      type: 'sms'
    })

    if (error || !data.user || !data.session) {
      return json({ success: false, message: toChineseAuthError(error?.message || '验证码错误') }, { status: 401 })
    }

    const service = createSupabaseServiceRoleClient()
    const { error: profileError } = await service
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: data.user.email || null,
        phone
      }, { onConflict: 'id' })
    if (profileError) throw profileError

    await recordUserAgreements(service, data.user.id, body.mode)
    const profile = await getWebProfile(data.user.id)
    if (profile?.role === 'admin') {
      return json({ success: true, redirectTo: '/admin/licenses' })
    }

    const license = await checkActiveWebLicenseForUser(data.user)
    return json({
      success: true,
      redirectTo: license.ok ? '/dashboard' : '/activate'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入有效的 6 位短信验证码' }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('中国大陆手机号')) {
      return json({ success: false, message: error.message }, { status: 400 })
    }
    console.error('[phone-otp-verify]', { error: error instanceof Error ? error.name : 'unknown' })
    return json({ success: false, message: '手机号验证失败，请稍后重试' }, { status: 500 })
  }
}
