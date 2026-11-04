import { isActiveWebLicenseSnapshot, type WebLicenseAccessSnapshot } from '@/lib/web-license/access'

export type MembershipSummary = {
  active: boolean
  expiresAt: string | null
  remainingDays: number
  plan: string | null
  suspended: boolean
  source: 'subscription' | 'prepaid' | 'existing' | 'trial' | 'none'
}

export function membershipSummary(snapshot: WebLicenseAccessSnapshot, now = Date.now()): MembershipSummary {
  const active = isActiveWebLicenseSnapshot(snapshot, now)
  const expiryDates = [snapshot.profile?.license_expires_at, snapshot.activation?.expires_at, snapshot.license?.expires_at]
    .filter((value): value is string => Boolean(value))
    .map(Date.parse)
    .filter(Number.isFinite)
  const expiresAt = expiryDates.length ? new Date(Math.min(...expiryDates)).toISOString() : null
  return {
    active,
    expiresAt,
    remainingDays: active && expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 86400000)) : 0,
    plan: active ? snapshot.license?.plan || 'standard' : null,
    suspended: snapshot.profile?.license_status === 'suspended',
    source: active ? snapshot.activation?.source === 'stripe_trial' ? 'trial' : snapshot.activation?.source === 'stripe' ? 'subscription' : snapshot.activation?.source === 'stripe_payment' ? 'prepaid' : 'existing' : 'none'
  }
}
