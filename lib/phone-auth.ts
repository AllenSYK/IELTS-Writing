import type { User } from '@supabase/supabase-js'

export const MainlandChinaCountryCode = '+86'

export function normalizeMainlandPhone(value: string) {
  const compact = value.trim().replace(/[\s\-()]/g, '')
  const national = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('0086')
      ? compact.slice(4)
      : compact.startsWith('86') && compact.length === 13
        ? compact.slice(2)
        : compact

  if (!/^1[3-9]\d{9}$/.test(national)) {
    throw new Error('请输入有效的中国大陆手机号')
  }
  return `${MainlandChinaCountryCode}${national}`
}

export function maskPhone(value?: string | null) {
  if (!value) return ''
  try {
    const normalized = normalizeMainlandPhone(value)
    return `${normalized.slice(0, 6)}****${normalized.slice(-4)}`
  } catch {
    return value.length > 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
  }
}

export function shortUserId(userId: string) {
  return `用户 ${userId.slice(0, 8)}`
}

export function accountDisplayName(
  user: Pick<User, 'id' | 'email' | 'phone'> | { id: string; email?: string | null; phone?: string | null }
) {
  return user.email || maskPhone(user.phone) || shortUserId(user.id)
}
