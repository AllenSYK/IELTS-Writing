import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import {
  REGISTER_CODE_MAX_ATTEMPTS,
  REGISTER_TOKEN_TTL_SECONDS,
  addSeconds,
  generateRegistrationToken,
  hashRegisterCode,
  hashRegistrationToken,
  isSameHash,
  isValidEmail,
  normalizeEmail
} from '@/lib/auth/email-verification'
import { EMAIL_OTP_LENGTH } from '@/lib/auth/otp-constants'

const VerifyRegisterCodeSchema = z.object({
  email: z.string().min(3).max(254),
  code: z.string().regex(new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`))
})

export async function POST(request: Request) {
  try {
    const body = VerifyRegisterCodeSchema.parse(await request.json())
    const email = normalizeEmail(body.email)

    if (!isValidEmail(email)) {
      return json({ success: false, message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const service = createSupabaseServiceRoleClient()
    const now = new Date()
    const { data: record, error } = await service
      .from('email_verification_codes')
      .select('id, code_hash, expires_at, attempts, consumed_at')
      .eq('email', email)
      .eq('purpose', 'register')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!record) {
      return json({ success: false, code: 'CODE_NOT_FOUND', message: '验证码已失效，请重新发送' }, { status: 400 })
    }

    if (new Date(record.expires_at).getTime() <= now.getTime()) {
      await service.from('email_verification_codes').update({ consumed_at: now.toISOString() }).eq('id', record.id)
      return json({ success: false, code: 'CODE_EXPIRED', message: '验证码已过期，请重新发送' }, { status: 400 })
    }

    if (record.attempts >= REGISTER_CODE_MAX_ATTEMPTS) {
      await service.from('email_verification_codes').update({ consumed_at: now.toISOString() }).eq('id', record.id)
      return json({ success: false, code: 'TOO_MANY_ATTEMPTS', message: '验证码尝试次数过多，请重新发送' }, { status: 429 })
    }

    const expectedHash = hashRegisterCode(email, body.code)
    if (!isSameHash(record.code_hash, expectedHash)) {
      const nextAttempts = Number(record.attempts || 0) + 1
      await service
        .from('email_verification_codes')
        .update({
          attempts: nextAttempts,
          consumed_at: nextAttempts >= REGISTER_CODE_MAX_ATTEMPTS ? now.toISOString() : null
        })
        .eq('id', record.id)

      return json(
        {
          success: false,
          code: nextAttempts >= REGISTER_CODE_MAX_ATTEMPTS ? 'TOO_MANY_ATTEMPTS' : 'INVALID_CODE',
          message: nextAttempts >= REGISTER_CODE_MAX_ATTEMPTS ? '验证码尝试次数过多，请重新发送' : '验证码错误',
          attemptsLeft: Math.max(0, REGISTER_CODE_MAX_ATTEMPTS - nextAttempts)
        },
        { status: nextAttempts >= REGISTER_CODE_MAX_ATTEMPTS ? 429 : 400 }
      )
    }

    const registrationToken = generateRegistrationToken()
    const tokenExpiresAt = addSeconds(now, REGISTER_TOKEN_TTL_SECONDS)
    const { error: updateError } = await service
      .from('email_verification_codes')
      .update({
        verified_at: now.toISOString(),
        registration_token_hash: hashRegistrationToken(email, registrationToken),
        registration_token_expires_at: tokenExpiresAt.toISOString()
      })
      .eq('id', record.id)
      .is('consumed_at', null)

    if (updateError) throw updateError

    return json({
      success: true,
      registrationToken,
      registrationTokenExpiresAt: tokenExpiresAt.toISOString()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入 6 位邮箱验证码' }, { status: 400 })
    }

    console.error('[verify-register-code]', error instanceof Error ? error.message : error)
    return json({ success: false, message: '验证码验证失败，请稍后重试' }, { status: 500 })
  }
}
