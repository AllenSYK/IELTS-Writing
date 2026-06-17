import { createHash, randomBytes } from 'node:crypto'

const WEB_LICENSE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeWebLicenseCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashWebLicenseCode(value: string) {
  return createHash('sha256').update(normalizeWebLicenseCode(value)).digest('hex')
}

export function formatWebLicenseCode(raw: string) {
  const normalized = normalizeWebLicenseCode(raw)
  if (normalized.startsWith('IELTS') && normalized.length === 17) {
    return ['IELTS', normalized.slice(5, 9), normalized.slice(9, 13), normalized.slice(13, 17)].filter(Boolean).join('-')
  }
  return normalized
}

function randomGroup(length: number) {
  const bytes = randomBytes(length * 2)
  let output = ''
  for (const byte of bytes) {
    output += WEB_LICENSE_ALPHABET[byte % WEB_LICENSE_ALPHABET.length]
    if (output.length === length) return output
  }
  return output.padEnd(length, 'A')
}

export function generateWebLicenseCode() {
  return ['IELTS', randomGroup(4), randomGroup(4), randomGroup(4)].join('-')
}

export function getWebLicenseCodePrefix(value: string) {
  const normalized = normalizeWebLicenseCode(value)
  if (normalized.length <= 9) return normalized
  return `${normalized.slice(0, 5)}-${normalized.slice(5, 9)}`
}
