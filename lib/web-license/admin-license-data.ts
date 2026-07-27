import type { SupabaseClient } from '@supabase/supabase-js'

export const UNBOUND_BINDING_REASON = 'EMAIL_UNBOUND'
export const BINDING_EXPIRING_DAYS = 14

type LicenseStatusInput = {
  status: string
  activation_count: number
  max_activations: number
  expires_at?: string | null
}

type BindingStatusInput = {
  status: string
  expires_at: string
  revoked_reason?: string | null
  license_status?: string | null
  license_expires_at?: string | null
}

export function getEffectiveLicenseStatus(license: LicenseStatusInput, now = Date.now()) {
  if (license.status === 'revoked' || license.status === 'disabled') return license.status
  if (license.expires_at && new Date(license.expires_at).getTime() <= now) return 'expired'
  if (license.status === 'expired') return 'expired'
  if (license.activation_count >= license.max_activations) return 'exhausted'
  if (license.activation_count > 0) return 'partial'
  return 'unused'
}

export function getEffectiveBindingStatus(binding: BindingStatusInput, now = Date.now()) {
  if (binding.revoked_reason === UNBOUND_BINDING_REASON) return 'unbound'
  if (
    binding.status === 'revoked'
    || binding.status === 'suspended'
    || binding.license_status === 'revoked'
    || binding.license_status === 'disabled'
  ) return 'revoked'

  const expiresAt = new Date(binding.expires_at).getTime()
  if (
    binding.status === 'expired'
    || binding.license_status === 'expired'
    || (binding.license_expires_at && new Date(binding.license_expires_at).getTime() <= now)
    || expiresAt <= now
  ) return 'expired'

  const expiringAt = now + BINDING_EXPIRING_DAYS * 24 * 60 * 60 * 1000
  if (expiresAt <= expiringAt) return 'expiring'
  return 'active'
}

export async function syncLicenseActivationCount(service: SupabaseClient, licenseId: string) {
  const [{ data: license, error: licenseError }, { data: bindings, error: bindingsError }] = await Promise.all([
    service
      .from('license_codes')
      .select('id, activation_count, max_activations, status, expires_at')
      .eq('id', licenseId)
      .single(),
    service
      .from('license_activations')
      .select('id, revoked_reason')
      .eq('license_id', licenseId)
  ])

  if (licenseError) throw licenseError
  if (bindingsError) throw bindingsError

  const activationCount = (bindings || []).filter(
    (binding) => ![UNBOUND_BINDING_REASON, 'ACCOUNT_DELETED'].includes(binding.revoked_reason || '')
  ).length
  let status = license.status

  if (!['disabled', 'revoked'].includes(status)) {
    if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
      status = 'expired'
    } else if (activationCount === 0) {
      status = 'unused'
    } else if (activationCount >= license.max_activations) {
      status = 'exhausted'
    } else {
      status = 'active'
    }
  }

  if (activationCount !== license.activation_count || status !== license.status) {
    const { error } = await service
      .from('license_codes')
      .update({ activation_count: activationCount, status })
      .eq('id', licenseId)
    if (error) throw error
  }

  return { activationCount, status }
}
