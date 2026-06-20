import { z } from 'zod'
import { json } from '@/lib/http'
import { normalizeMainlandPhone, maskPhone } from '@/lib/phone-auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { CurrentAgreementVersions } from '@/lib/legal-agreements'
import { toChineseAuthError } from '@/lib/auth/error-messages'

const SendPhoneCodeSchema = z.object({
  phone: z.string().min(6).max(32),
  mode: z.enum(['login', 'register']),
  agreementsAccepted: z.literal(true),
  agreementVersions: z.object({
    terms: z.literal(CurrentAgreementVersions.terms),
    privacy: z.literal(CurrentAgreementVersions.privacy)
  })
})

export async function POST(request: Request) {
  try {
    const body = SendPhoneCodeSchema.parse(await request.json())
    const phone = normalizeMainlandPhone(body.phone)
    const service = createSupabaseServiceRoleClient()
    const { data: existingProfile, error: profileError } = await service
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (profileError) throw profileError
    if (body.mode === 'login' && !existingProfile) {
      return json({ success: false, message: '该手机号尚未注册，请先注册' }, { status: 404 })
    }
    if (body.mode === 'register' && existingProfile) {
      return json({ success: false, message: '该手机号已经注册，请直接登录' }, { status: 409 })
    }
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        shouldCreateUser: body.mode === 'register'
      }
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (body.mode === 'login' && (message.includes('signup') || message.includes('not found'))) {
        return json({ success: false, message: '该手机号尚未注册，请先注册' }, { status: 404 })
      }
      return json({ success: false, message: toChineseAuthError(error.message) }, { status: 400 })
    }

    return json({
      success: true,
      maskedPhone: maskPhone(phone),
      cooldownSeconds: 60
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请填写有效手机号并同意服务协议' }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('中国大陆手机号')) {
      return json({ success: false, message: error.message }, { status: 400 })
    }
    console.error('[phone-otp-send]', { error: error instanceof Error ? error.name : 'unknown' })
    return json({ success: false, message: '验证码发送失败，请稍后重试' }, { status: 500 })
  }
}
