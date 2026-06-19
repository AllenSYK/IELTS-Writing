import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { sendRegisterCodeEmail } from '@/lib/email/send-register-code'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import {
  REGISTER_CODE_RESEND_SECONDS,
  REGISTER_CODE_TTL_SECONDS,
  addSeconds,
  generateRegisterCode,
  getClientIp,
  hashIpAddress,
  hashRegisterCode,
  isValidEmail,
  maskEmail,
  normalizeEmail
} from '@/lib/auth/email-verification'

const SendRegisterCodeSchema = z.object({
  email: z.string().min(3).max(254),
  previousEmail: z.string().min(3).max(254).optional().nullable(),
  invalidateOnly: z.boolean().optional().default(false)
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
    const body = SendRegisterCodeSchema.parse(await request.json())
    const email = normalizeEmail(body.email)
    const previousEmail = body.previousEmail ? normalizeEmail(body.previousEmail) : null

    if (!isValidEmail(email)) {
      return json({ success: false, message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    const service = createSupabaseServiceRoleClient()
    const now = new Date()

    await service
      .from('email_verification_codes')
      .delete()
      .eq('purpose', 'register')
      .lt('expires_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())

    if (body.invalidateOnly) {
      await service
        .from('email_verification_codes')
        .update({ consumed_at: now.toISOString() })
        .eq('email', email)
        .eq('purpose', 'register')
        .is('consumed_at', null)

      return json({ success: true })
    }

    if (await isEmailRegistered(email)) {
      return json({ success: false, code: 'EMAIL_REGISTERED', message: '该邮箱已经注册' }, { status: 409 })
    }

    if (previousEmail && previousEmail !== email) {
      await service
        .from('email_verification_codes')
        .update({ consumed_at: now.toISOString() })
        .eq('email', previousEmail)
        .eq('purpose', 'register')
        .is('consumed_at', null)
    }

    const { data: recentCode, error: recentError } = await service
      .from('email_verification_codes')
      .select('id, created_at')
      .eq('email', email)
      .eq('purpose', 'register')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentError) throw recentError

    if (recentCode?.created_at) {
      const elapsedSeconds = Math.floor((now.getTime() - new Date(recentCode.created_at).getTime()) / 1000)
      if (elapsedSeconds < REGISTER_CODE_RESEND_SECONDS) {
        return json(
          {
            success: false,
            code: 'RESEND_TOO_SOON',
            message: `请 ${REGISTER_CODE_RESEND_SECONDS - elapsedSeconds} 秒后再重新发送`,
            retryAfter: REGISTER_CODE_RESEND_SECONDS - elapsedSeconds
          },
          { status: 429 }
        )
      }
    }

    await service
      .from('email_verification_codes')
      .update({ consumed_at: now.toISOString() })
      .eq('email', email)
      .eq('purpose', 'register')
      .is('consumed_at', null)

    const code = generateRegisterCode()
    const expiresAt = addSeconds(now, REGISTER_CODE_TTL_SECONDS)
    const { data: inserted, error: insertError } = await service
      .from('email_verification_codes')
      .insert({
        email,
        purpose: 'register',
        code_hash: hashRegisterCode(email, code),
        expires_at: expiresAt.toISOString(),
        created_ip_hash: hashIpAddress(getClientIp(request))
      })
      .select('id')
      .single()

    if (insertError) throw insertError

    try {
      await sendRegisterCodeEmail(email, code)
    } catch (error) {
      await service
        .from('email_verification_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', inserted.id)

      return json(
        { success: false, code: 'EMAIL_SEND_FAILED', message: toChineseAuthError(error instanceof Error ? error.message : null) },
        { status: 502 }
      )
    }

    return json({
      success: true,
      maskedEmail: maskEmail(email),
      serverTime: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      cooldownSeconds: REGISTER_CODE_RESEND_SECONDS
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    console.error('[send-register-code]', error instanceof Error ? error.message : error)
    return json({ success: false, message: toChineseAuthError(error instanceof Error ? error.message : null) }, { status: 500 })
  }
}
