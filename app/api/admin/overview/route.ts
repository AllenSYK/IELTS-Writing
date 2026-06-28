import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import {
  getEffectiveBindingStatus,
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '@/lib/web-license/admin-license-data'

export async function GET(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  
  try {
    const { service } = await requireAdminService()
    
    // 优化：只查询必要字段，添加 limit
    const [licensesResult, profilesResult, bindingsResult] = await Promise.all([
      service
        .from('license_codes')
        .select('id, code_prefix, plan, status, activation_count, max_activations, expires_at, created_at')
        .order('created_at', { ascending: false })
        .limit(1000), // 限制返回数量
      service
        .from('profiles')
        .select('id, email, phone, role, license_status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000), // 限制返回数量
      service
        .from('license_activations')
        .select('id, license_id, user_id, email, status, expires_at, revoked_reason, activated_at')
        .order('activated_at', { ascending: false })
        .limit(1000) // 限制返回数量
    ])

    for (const result of [licensesResult, profilesResult, bindingsResult]) {
      if (result.error) throw result.error
    }

    const licenses = licensesResult.data || []
    const profiles = profilesResult.data || []
    const bindings = bindingsResult.data || []
    const licenseMap = new Map(licenses.map((license) => [license.id, license]))
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
      const license = licenseMap.get(binding.license_id)
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
      recentLicenses: licenses.slice(0, 5).map((license) => {
        const activationCount = usageByLicense.get(license.id) || 0
        return {
          ...license,
          activation_count: activationCount,
          status: getEffectiveLicenseStatus({ ...license, activation_count: activationCount })
        }
      }),
      recentBindings: bindings.slice(0, 5).map((binding) => {
        const license = licenseMap.get(binding.license_id)
        return {
          ...binding,
          license_codes: license
            ? { id: license.id, code_prefix: license.code_prefix, plan: license.plan }
            : null,
          binding_status: getEffectiveBindingStatus(binding)
        }
      }),
      recentUsers: profiles.slice(0, 5),
      requestId
    })
  } catch (error) {
    return adminApiError(error, '无法加载管理总览')
  }
}
