import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email/send-register-code'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { hashRegistrationToken, isValidEmail, normalizeEmail } from '@/lib/auth/email-verification'

const RegisterSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(8).max(128),
  registrationToken: z.string().min(32).max(256)
})

async function isEmailRegistered(email: string) {
  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function POST(request: Request) {
  try {
    const body = RegisterSchema.parse(await request.json())
    const email = normalizeEmail(body.email)

    if (!isValidEmail(email)) {
      return json({ success: false, message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const service = createSupabaseServiceRoleClient()
    if (await isEmailRegistered(email)) {
      return json({ success: false, code: 'EMAIL_REGISTERED', message: '该邮箱已经注册' }, { status: 409 })
    }

    const tokenHash = hashRegistrationToken(email, body.registrationToken)
    const now = new Date()
    const { data: verification, error: verificationError } = await service
      .from('email_verification_codes')
      .select('id')
      .eq('email', email)
      .eq('purpose', 'register')
      .eq('registration_token_hash', tokenHash)
      .is('consumed_at', null)
      .not('verified_at', 'is', null)
      .gt('registration_token_expires_at', now.toISOString())
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (verificationError) throw verificationError

    if (!verification) {
      return json({ success: false, code: 'REGISTRATION_TOKEN_INVALID', message: '邮箱验证码尚未验证或已过期，请重新发送' }, { status: 403 })
    }

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        source: 'web_registration'
      }
    })

    if (createError || !created.user) {
      return json(
        { success: false, code: 'REGISTER_FAILED', message: toChineseAuthError(createError?.message || '注册失败，请稍后重试') },
        { status: createError?.message?.toLowerCase().includes('already') ? 409 : 400 }
      )
    }

    const { error: profileError } = await service
      .from('profiles')
      .upsert({
        id: created.user.id,
        email,
        role: 'user',
        license_status: 'inactive',
        license_expires_at: null
      })

    if (profileError) throw profileError

    await service
      .from('email_verification_codes')
      .update({ consumed_at: now.toISOString() })
      .eq('id', verification.id)

    sendWelcomeEmail(email).catch((error) => {
      console.error('[welcome-email]', error instanceof Error ? error.message : 'send failed')
    })

    return json({ success: true, message: '账号已创建，现在可以登录。' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请确认邮箱、密码和验证码状态后重试' }, { status: 400 })
    }

    console.error('[register]', error instanceof Error ? error.message : error)
    return json({ success: false, message: toChineseAuthError(error instanceof Error ? error.message : null) }, { status: 500 })
  }
}
