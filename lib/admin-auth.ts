import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'ielts_admin_session'
const MAX_AGE_SECONDS = 60 * 60 * 8

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 24) {
    throw new Error('ADMIN_SESSION_SECRET must be configured with at least 24 characters.')
  }
  return secret
}

function sign(value: string) {
  return createHmac('sha256', getSecret()).update(value).digest('hex')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function createAdminSession() {
  const issuedAt = Date.now()
  const value = `${issuedAt}.${sign(String(issuedAt))}`
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function requireAdmin() {
  const cookieStore = await cookies()
  const session = cookieStore.get(COOKIE_NAME)?.value
  if (!session) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const [issuedAt, signature] = session.split('.')
  const issuedMs = Number(issuedAt)
  const expired = !Number.isFinite(issuedMs) || Date.now() - issuedMs > MAX_AGE_SECONDS * 1000
  if (expired || !signature || !safeEqual(signature, sign(issuedAt))) {
    throw new Response('Unauthorized', { status: 401 })
  }
}

export async function isAdminAuthenticated() {
  try {
    await requireAdmin()
    return true
  } catch {
    return false
  }
}
