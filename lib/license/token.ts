import { createPublicKey } from 'node:crypto'
import { jwtVerify, importSPKI } from 'jose'

export type LicenseTokenPayload = {
  licenseId: string
  deviceId: string
  plan: string
  status: 'active'
  expiresAt: string | null
  autoUpdateEnabled: boolean
  channel?: string
}

function normalizePem(value: string, label: 'PRIVATE KEY' | 'PUBLIC KEY') {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n')
  if (trimmed.includes('BEGIN ')) {
    return trimmed
  }

  const body = trimmed.replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g)?.join('\n') || body
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

export async function verifyLicenseToken(token: string) {
  const publicKeyPem = process.env.LICENSE_TOKEN_PUBLIC_KEY_PEM
  if (!publicKeyPem) {
    throw new Error('LICENSE_TOKEN_PUBLIC_KEY_PEM is not configured.')
  }
  const publicKey = await importSPKI(normalizePem(publicKeyPem, 'PUBLIC KEY'), 'ES256')
  const result = await jwtVerify(token, publicKey, {
    issuer: 'ielts-writing-license',
    audience: 'ielts-writing-desktop'
  })
  return result.payload as unknown as LicenseTokenPayload & {
    exp: number
    iat: number
  }
}

export function isValidPublicKey(pem: string) {
  try {
    createPublicKey(normalizePem(pem, 'PUBLIC KEY'))
    return true
  } catch {
    return false
  }
}
