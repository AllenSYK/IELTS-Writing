import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { normalizeEmail } from './email-utils'
import { EMAIL_OTP_LENGTH } from './otp-constants'

export { isValidEmail, maskEmail, normalizeEmail } from './email-utils'

export const REGISTER_CODE_TTL_SECONDS = 10 * 60
export const REGISTER_TOKEN_TTL_SECONDS = 10 * 60
export const REGISTER_CODE_RESEND_SECONDS = 60
export const REGISTER_CODE_MAX_ATTEMPTS = 5

function getHashSecret() {
  const secret =
    process.env.EMAIL_VERIFICATION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!secret) {
    throw new Error('EMAIL_VERIFICATION_SECRET is missing.')
  }

  return secret
}

export function generateRegisterCode() {
  const lowerBound = 10 ** (EMAIL_OTP_LENGTH - 1)
  return randomInt(lowerBound, lowerBound * 10).toString()
}

export function generateRegistrationToken() {
  return randomBytes(36).toString('base64url')
}

export function hashRegisterCode(email: string, code: string) {
  return createHmac('sha256', getHashSecret())
    .update(`register-code:${normalizeEmail(email)}:${code}`)
    .digest('hex')
}

export function hashRegistrationToken(email: string, token: string) {
  return createHmac('sha256', getHashSecret())
    .update(`registration-token:${normalizeEmail(email)}:${token}`)
    .digest('hex')
}

export function hashIpAddress(ip: string | null) {
  if (!ip) return null
  return createHash('sha256')
    .update(`ip:${ip}:${getHashSecret()}`)
    .digest('hex')
}

export function hashEmailAddress(email: string) {
  return createHmac('sha256', getHashSecret())
    .update(`email:${normalizeEmail(email)}`)
    .digest('hex')
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || null
}

export function isSameHash(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, 'hex')
    const rightBuffer = Buffer.from(right, 'hex')
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  } catch {
    return false
  }
}

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}
