import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import {
  getEffectiveBindingStatus,
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '@/lib/web-license/admin-license-data'

export async function GET() {
  try {
    const { service } = await requireAdminService()
    const [
      licensesResult,
      profilesResult,
      bindingsResult,
      recentLicensesResult,
      recentBindingsResult,
      recentUsersResult
    ] = await Promise.all([
      service.from('license_codes').select('id, status, activation_count, max_activations, expires_at'),
      service.from('profiles').select('id, email, role, license_status, created_at'),
      service.from('license_activations').select('id, license_id, user_id, status, expires_at, revoked_reason, license_codes(status, expires_at)'),
      service
        .from('license_codes')
        .select('id, code_prefix, plan, status, activation_count, max_activations, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      service
        .from('license_activations')
        .select('id, user_id, email, status, expires_at, revoked_reason, activated_at, license_codes(id, code_prefix, plan)')
        .order('activated_at', { ascending: false })
        .limit(5),
      service
        .from('profiles')
        .select('id, email, role, license_status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
    ])

    for (const result of [
      licensesResult,
      profilesResult,
      bindingsResult,
      recentLicensesResult,
      recentBindingsResult,
      recentUsersResult
    ]) {
      if (result.error) throw result.error
    }

    const licenses = licensesResult.data || []
    const profiles = profilesResult.data || []
    const bindings = bindingsResult.data || []
    const currentlyBoundUserIds = new Set(
      bindings
        .filter((binding) => binding.revoked_reason !== UNBOUND_BINDING_REASON)
        .map((binding) => binding.user_id)
    )

    const usageByLicense = new Map<string, number>()
    for (const binding of bindings) {
      if (binding.revoked_reason === UNBOUND_BINDING_REASON) continue
      usageByLicense.set(binding.license_id, (usageByLicense.get(binding.license_id) || 0) + 1)
    }
    const licenseStatuses = licenses.map((license) => getEffectiveLicenseStatus({
      ...license,
      activation_count: usageByLicense.get(license.id) || 0
    }))
    const bindingStatuses = bindings.map((binding) => {
      const license = Array.isArray(binding.license_codes) ? binding.license_codes[0] : binding.license_codes
      return getEffectiveBindingStatus({
        ...binding,
        license_status: license?.status,
        license_expires_at: license?.expires_at
      })
    })

    return json({
      success: true,
      stats: {
        totalLicenses: licenses.length,
        availableLicenses: licenseStatuses.filter((status) => ['unused', 'partial'].includes(status)).length,
        exhaustedLicenses: licenseStatuses.filter((status) => status === 'exhausted').length,
        totalBindings: bindings.length,
        activeBindings: bindingStatuses.filter((status) => ['active', 'expiring'].includes(status)).length,
        unboundUsers: profiles.filter((profile) => profile.role !== 'admin' && !currentlyBoundUserIds.has(profile.id)).length
      },
      recentLicenses: (recentLicensesResult.data || []).map((license) => {
        const activationCount = usageByLicense.get(license.id) || 0
        return {
          ...license,
          activation_count: activationCount,
          status: getEffectiveLicenseStatus({ ...license, activation_count: activationCount })
        }
      }),
      recentBindings: (recentBindingsResult.data || []).map((binding) => ({
        ...binding,
        binding_status: getEffectiveBindingStatus(binding)
      })),
      recentUsers: recentUsersResult.data || []
    })
  } catch (error) {
    return adminApiError(error, '无法加载管理总览')
  }
}
