import { createHash, randomBytes } from 'node:crypto'

const LICENSE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const PREFIX = 'QGYX'

export type LicenseDuration = '1' | '7' | '30' | '90' | '180' | '365' | 'permanent' | 'custom'

export function generateLicenseKey() {
  const groups = Array.from({ length: 4 }, () => randomGroup(4))
  return [PREFIX, ...groups].join('-')
}

function randomGroup(length: number) {
  const bytes = randomBytes(length * 2)
  let output = ''
  for (const byte of bytes) {
    output += LICENSE_ALPHABET[byte % LICENSE_ALPHABET.length]
    if (output.length === length) {
      return output
    }
  }
  return output.padEnd(length, '2')
}

export function normalizeLicenseKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function hashLicenseKey(value: string, pepper = process.env.LICENSE_KEY_PEPPER || '') {
  return createHash('sha256').update(`${normalizeLicenseKey(value)}:${pepper}`).digest('hex')
}

export function maskLicenseKey(value: string) {
  const normalized = normalizeLicenseKey(value)
  return `${normalized.slice(0, 4)}-****-****-****-${normalized.slice(-4)}`
}

export function getKeyPrefix(value: string) {
  const normalized = normalizeLicenseKey(value)
  return normalized.slice(0, 4)
}

export function getKeyLastFour(value: string) {
  return normalizeLicenseKey(value).slice(-4)
}

export function durationToDays(duration: LicenseDuration, customDays?: number | null) {
  if (duration === 'permanent') {
    return null
  }
  if (duration === 'custom') {
    return customDays ?? null
  }
  return Number(duration)
}
