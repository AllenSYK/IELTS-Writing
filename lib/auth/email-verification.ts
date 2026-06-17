import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'

export const REGISTER_CODE_TTL_SECONDS = 10 * 60
export const REGISTER_TOKEN_TTL_SECONDS = 10 * 60
export const REGISTER_CODE_RESEND_SECONDS = 60
export const REGISTER_CODE_MAX_ATTEMPTS = 5

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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
  return randomInt(100000, 1000000).toString()
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

export function maskEmail(email: string) {
  const normalized = normalizeEmail(email)
  const [name, domain] = normalized.split('@')
  if (!name || !domain) return normalized
  const visible = name.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(3, Math.min(6, name.length - 1)))}@${domain}`
}

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000)
}
