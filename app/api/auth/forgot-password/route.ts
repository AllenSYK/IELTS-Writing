import { z } from 'zod'
import { json } from '@/lib/http'
import { normalizeEmail } from '@/lib/auth/email-verification'
import { toChineseAuthError } from '@/lib/auth/error-messages'
import { sendPasswordResetEmail } from '@/lib/email/send-register-code'
import { getSiteUrl } from '@/lib/email/brand'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

const ForgotPasswordSchema = z.object({
  email: z.string().email()
})

function isUserMissingMessage(message: string) {
  const value = message.toLowerCase()
  return value.includes('user not found') || value.includes('not found')
}

export async function POST(request: Request) {
  try {
    const body = ForgotPasswordSchema.parse(await request.json())
    const email = normalizeEmail(body.email)
    const service = createSupabaseServiceRoleClient()
    const resetRedirectTo = `${getSiteUrl()}/reset-password`
    const { data, error } = await service.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: resetRedirectTo
      }
    })

    if (error) {
      if (isUserMissingMessage(error.message)) {
        return json({ success: true, message: '如果该邮箱已注册，密码重置邮件会发送到此邮箱。' })
      }
      return json({ success: false, message: toChineseAuthError(error.message) }, { status: 400 })
    }

    const linkData = data as {
      properties?: { action_link?: string }
      action_link?: string
    }
    const resetUrl = linkData.properties?.action_link || linkData.action_link

    if (!resetUrl) {
      return json({ success: false, message: '暂时无法生成重置链接，请稍后重试' }, { status: 500 })
    }

    try {
      await sendPasswordResetEmail(email, resetUrl)
    } catch (emailError) {
      return json(
        { success: false, code: 'EMAIL_SEND_FAILED', message: toChineseAuthError(emailError instanceof Error ? emailError.message : null) },
        { status: 502 }
      )
    }

    return json({ success: true, message: '如果该邮箱已注册，密码重置邮件会发送到此邮箱。' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, message: '请输入有效的邮箱地址' }, { status: 400 })
    }

    console.error('[forgot-password]', error instanceof Error ? error.message : error)
    return json({ success: false, message: toChineseAuthError(error instanceof Error ? error.message : null) }, { status: 500 })
  }
}
