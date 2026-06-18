import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

export async function GET() {
  try {
    const { service } = await requireAdminService()
    const now = new Date()
    const nowIso = now.toISOString()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const [
      licensesResult,
      profilesResult,
      todayUsersResult,
      recentLicensesResult,
      recentActivationsResult,
      recentUsersResult,
      expiringResult
    ] = await Promise.all([
      service.from('license_codes').select('id, status, activation_count, max_activations, expires_at'),
      service.from('profiles').select('id, role, license_status'),
      service.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      service
        .from('license_codes')
        .select('id, code_value, code_prefix, plan, status, activation_count, max_activations, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      service
        .from('license_activations')
        .select('id, email, status, activated_at, expires_at, license_codes(code_prefix, plan)')
        .order('activated_at', { ascending: false })
        .limit(5),
      service.from('profiles').select('id, email, role, license_status, created_at').order('created_at', { ascending: false }).limit(5),
      service
        .from('license_codes')
        .select('id, code_prefix, plan, status, expires_at')
        .not('expires_at', 'is', null)
        .gt('expires_at', nowIso)
        .lte('expires_at', soon)
        .order('expires_at', { ascending: true })
        .limit(5)
    ])

    for (const result of [
      licensesResult,
      profilesResult,
      todayUsersResult,
      recentLicensesResult,
      recentActivationsResult,
      recentUsersResult,
      expiringResult
    ]) {
      if (result.error) throw result.error
    }

    const licenses = licensesResult.data || []
    const profiles = profilesResult.data || []
    const effectiveStatus = (item: (typeof licenses)[number]) => {
      if (item.status === 'revoked' || item.status === 'disabled') return item.status
      if (item.expires_at && new Date(item.expires_at).getTime() <= now.getTime()) return 'expired'
      if (item.activation_count >= item.max_activations) return 'exhausted'
      if (item.activation_count > 0) return 'active'
      return 'unused'
    }

    return json({
      success: true,
      stats: {
        totalLicenses: licenses.length,
        activatedLicenses: licenses.filter((item) => ['active', 'exhausted'].includes(effectiveStatus(item))).length,
        unusedLicenses: licenses.filter((item) => effectiveStatus(item) === 'unused').length,
        expiredLicenses: licenses.filter((item) => effectiveStatus(item) === 'expired').length,
        totalUsers: profiles.length,
        activeUsers: profiles.filter((item) => item.license_status === 'active').length,
        inactiveUsers: profiles.filter((item) => item.license_status === 'inactive').length,
        todayUsers: todayUsersResult.count || 0
      },
      recentLicenses: recentLicensesResult.data || [],
      recentActivations: recentActivationsResult.data || [],
      recentUsers: recentUsersResult.data || [],
      expiringLicenses: expiringResult.data || []
    })
  } catch (error) {
    return adminApiError(error, '无法加载管理总览')
  }
}
