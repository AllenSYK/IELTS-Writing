import { z } from 'zod'
import { json } from '@/lib/http'
import {
  getClientIp,
  hashEmailAddress,
  hashIpAddress,
  maskEmail,
  normalizeEmail
} from '@/lib/auth/email-verification'

const UNIFORM_SUCCESS_MESSAGE = '如果该邮箱已注册，六位验证码将发送到该邮箱。'
const SEND_FAILURE_MESSAGE = '暂时无法发送验证码，请稍后重试。'

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320)
})

type RecoveryAuthError = {
  code?: string
  message?: string
  status?: number
}

type PasswordRecoveryRateLimitResult = {
  allowed: boolean
  retryAfter: number
  reason: string
}

type PasswordRecoveryRequestStatus = 'accepted' | 'completed' | 'failed'

export type ForgotPasswordDependencies = {
  createRequestId: () => string
  checkRateLimit: (input: {
    emailHash: string
    ipHash: string | null
    requestId: string
  }) => Promise<PasswordRecoveryRateLimitResult>
  updateRequestStatus: (requestId: string, status: PasswordRecoveryRequestStatus) => Promise<boolean>
  sendRecoveryOtp: (email: string) => Promise<{ error: RecoveryAuthError | null }>
}

function isEnumerationSensitiveError(error: RecoveryAuthError) {
  const code = error.code?.toLowerCase() || ''
  const message = error.message?.toLowerCase() || ''
  return (
    code === 'user_not_found' ||
    code === 'email_not_confirmed' ||
    message.includes('user not found') ||
    message.includes('email not found') ||
    message.includes('not registered') ||
    message.includes('email not confirmed')
  )
}

function isRateLimitError(error: RecoveryAuthError) {
  const code = error.code?.toLowerCase() || ''
  const message = error.message?.toLowerCase() || ''
  return (
    error.status === 429 ||
    code.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  )
}

function logRecoveryFailure(input: {
  requestId: string
  emailHash?: string
  maskedEmail?: string
  category: string
  status: number
  errorCode?: string
  rateLimitReason?: string
}) {
  console.error('[forgot-password]', {
    requestId: input.requestId,
    emailHash: input.emailHash?.slice(0, 16),
    maskedEmail: input.maskedEmail,
    category: input.category,
    status: input.status,
    errorCode: input.errorCode,
    rateLimitReason: input.rateLimitReason
  })
}

export function createForgotPasswordPost(dependencies: ForgotPasswordDependencies) {
  return async function forgotPasswordPost(request: Request) {
    const requestId = dependencies.createRequestId()
    let emailHash: string | undefined
    let maskedEmail: string | undefined

    try {
      const body = ForgotPasswordSchema.parse(await request.json())
      const email = normalizeEmail(body.email)
      emailHash = hashEmailAddress(email)
      maskedEmail = maskEmail(email)
      const ipHash = hashIpAddress(getClientIp(request))

      const limit = await dependencies.checkRateLimit({ emailHash, ipHash, requestId })
      if (!limit.allowed) {
        logRecoveryFailure({
          requestId,
          emailHash,
          maskedEmail,
          category: 'rate_limited',
          status: 429,
          rateLimitReason: limit.reason
        })
        return json(
          { success: false, message: '操作过于频繁，请稍后再试。' },
          {
            status: 429,
            headers: { 'Retry-After': String(limit.retryAfter) }
          }
        )
      }

      const { error } = await dependencies.sendRecoveryOtp(email)

      if (error) {
        if (isEnumerationSensitiveError(error)) {
          await dependencies.updateRequestStatus(requestId, 'completed')
          return json({ success: true, message: UNIFORM_SUCCESS_MESSAGE })
        }

        await dependencies.updateRequestStatus(requestId, 'failed')
        if (isRateLimitError(error)) {
          logRecoveryFailure({
            requestId,
            emailHash,
            maskedEmail,
            category: 'supabase_rate_limited',
            status: 429,
            errorCode: error.code
          })
          return json({ success: false, message: '操作过于频繁，请稍后再试。' }, { status: 429 })
        }

        logRecoveryFailure({
          requestId,
          emailHash,
          maskedEmail,
          category: 'auth_or_email_delivery_unavailable',
          status: error.status || 503,
          errorCode: error.code
        })
        return json({ success: false, message: SEND_FAILURE_MESSAGE }, { status: 503 })
      }

      await dependencies.updateRequestStatus(requestId, 'completed')
      return json({ success: true, message: UNIFORM_SUCCESS_MESSAGE })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json({ success: false, message: '请输入有效的邮箱地址。' }, { status: 400 })
      }

      logRecoveryFailure({
        requestId,
        emailHash,
        maskedEmail,
        category: 'server_unavailable',
        status: 503
      })
      return json({ success: false, message: SEND_FAILURE_MESSAGE }, { status: 503 })
    }
  }
}
