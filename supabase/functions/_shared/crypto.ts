import { SignJWT, importPKCS8, jwtVerify, importSPKI } from 'npm:jose@5.9.6'

const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function normalizeLicenseKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function hashLicenseKey(value: string) {
  return sha256Hex(`${normalizeLicenseKey(value)}:${Deno.env.get('LICENSE_KEY_PEPPER') || ''}`)
}

export function generateLicenseKey() {
  const groups = Array.from({ length: 4 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(4))
    return Array.from(bytes)
      .map((byte) => alphabet[byte % alphabet.length])
      .join('')
  })
  return ['QGYX', ...groups].join('-')
}

function normalizePem(value: string, label: 'PRIVATE KEY' | 'PUBLIC KEY') {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '').replaceAll('\\n', '\n')
  if (trimmed.includes('BEGIN ')) {
    return trimmed
  }
  const body = trimmed.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g)?.join('\n') || body
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

export async function signLicenseToken(payload: Record<string, unknown>) {
  const privatePem = Deno.env.get('LICENSE_TOKEN_PRIVATE_KEY_PEM')
  if (!privatePem) {
    throw new Error('missing_private_key')
  }
  const privateKey = await importPKCS8(normalizePem(privatePem, 'PRIVATE KEY'), 'ES256')
  const ttlSeconds = Number(Deno.env.get('LICENSE_TOKEN_TTL_SECONDS') || '21600')
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setIssuer('ielts-writing-license')
    .setAudience('ielts-writing-desktop')
    .sign(privateKey)
}

export async function verifyLicenseToken(token: string) {
  const publicPem = Deno.env.get('LICENSE_TOKEN_PUBLIC_KEY_PEM')
  if (!publicPem) {
    throw new Error('missing_public_key')
  }
  const publicKey = await importSPKI(normalizePem(publicPem, 'PUBLIC KEY'), 'ES256')
  const result = await jwtVerify(token, publicKey, {
    issuer: 'ielts-writing-license',
    audience: 'ielts-writing-desktop'
  })
  return result.payload as Record<string, string>
}
