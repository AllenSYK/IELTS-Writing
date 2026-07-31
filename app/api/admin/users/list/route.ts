import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { UNBOUND_BINDING_REASON } from '@/lib/web-license/admin-license-data'
import { toQueryParamNumber } from '@/lib/admin/number-utils'
import { summarizeUsageRecords, type UserUsageSummary } from '@/lib/admin/user-usage-summary'
import type { User } from '@supabase/supabase-js'

type AdminService = Awaited<ReturnType<typeof requireAdminService>>['service']

async function loadUsageSummary(service: AdminService, userIds: string[]): Promise<UserUsageSummary[]> {
  if (userIds.length === 0) return []

  const rpcResult = await service.rpc('get_admin_usage_summary', { p_user_ids: userIds })
  if (!rpcResult.error) return rpcResult.data || []

  // Older deployments may not have the optional aggregation RPC yet. Usage
  // statistics must never prevent the core user directory from loading.
  console.warn('[admin-users-usage-rpc-fallback]', {
    code: rpcResult.error.code,
    message: rpcResult.error.message
  })

  const fallbackResult = await service
    .from('usage_records')
    .select('user_id, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(10_000)

  if (fallbackResult.error) {
    console.warn('[admin-users-usage-unavailable]', {
      code: fallbackResult.error.code,
      message: fallbackResult.error.message
    })
    return []
  }

  return summarizeUsageRecords(fallbackResult.data || [])
}

export async function GET(request: Request) {
  try {
    const { service, user: currentAdmin } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toQueryParamNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(100, Math.max(1, toQueryParamNumber(url.searchParams.get('pageSize'), 50)))
    const search = url.searchParams.get('search')?.trim().toLowerCase() || ''
    const filter = url.searchParams.get('filter')?.trim().toLowerCase() || 'all'
    const userId = url.searchParams.get('userId')?.trim() || ''

    let listedUsers: User[] = []
    let totalUsers = 0
    if (userId) {
      const { data, error } = await service.auth.admin.getUserById(userId)
      if (error) throw error
      listedUsers = data.user ? [data.user] : []
      totalUsers = listedUsers.length
    } else {
      const needsCrossPageFiltering = Boolean(search) || filter !== 'all'
      const { data, error } = await service.auth.admin.listUsers({
        page: needsCrossPageFiltering ? 1 : page,
        perPage: needsCrossPageFiltering ? 1000 : pageSize
      })
      if (error) throw error
      listedUsers = data.users.filter((listedUser) => !listedUser.deleted_at)
      totalUsers = data.total || data.users.length
    }

    const userIds = listedUsers.map((user) => user.id)
    const [{ data: profiles, error: profilesError }, { data: activations, error: activationsError }, usage] = await Promise.all([
      userIds.length
        ? service.from('profiles').select('id, email, phone, role, license_status, license_expires_at, created_at').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? service
            .from('license_activations')
            .select('id, user_id, email, activated_at, expires_at, status, last_used_at, revoked_reason, license_codes(id, code_prefix, plan, status)')
            .in('user_id', userIds)
            .order('expires_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      loadUsageSummary(service, userIds)
    ])

    if (profilesError) throw profilesError
    if (activationsError) throw activationsError

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
    const activationMap = new Map<string, (typeof activations)[number]>()
    for (const activation of activations || []) {
      if ([UNBOUND_BINDING_REASON, 'ACCOUNT_DELETED'].includes(activation.revoked_reason || '')) continue
      const license = Array.isArray(activation.license_codes)
        ? activation.license_codes[0]
        : activation.license_codes
      const isCurrentlyActive =
        activation.status === 'active'
        && new Date(activation.expires_at).getTime() > Date.now()
        && Boolean(license)
        && !['disabled', 'expired', 'revoked'].includes(license?.status || '')
      if (isCurrentlyActive && !activationMap.has(activation.user_id)) {
        activationMap.set(activation.user_id, activation)
      }
    }
    const usageMap = new Map<string, { count: number; lastUsedAt: string | null }>()
    for (const item of usage) {
      usageMap.set(item.user_id, {
        count: Number(item.evaluation_count || 0),
        lastUsedAt: item.last_used_at || null
      })
    }

    const users = listedUsers
      .map((user) => {
        const profile = profileMap.get(user.id)
        const activation = activationMap.get(user.id)
        const license = Array.isArray(activation?.license_codes)
          ? activation?.license_codes[0]
          : activation?.license_codes
        const usageInfo = usageMap.get(user.id) || { count: 0, lastUsedAt: null }
        return {
          id: user.id,
          email: user.email,
          phone: user.phone || profile?.phone || null,
          accountLabel: user.email || user.phone || profile?.phone || `用户 ${user.id.slice(0, 8)}`,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          emailConfirmedAt: user.email_confirmed_at,
          bannedUntil: user.banned_until,
          role: profile?.role || 'user',
          licenseStatus: profile?.license_status || 'inactive',
          licenseExpiresAt: profile?.license_expires_at || null,
          plan: license?.plan || null,
          activation,
          isBound: Boolean(activation),
          licenseId: license?.id || null,
          licensePrefix: license?.code_prefix || null,
          lastUsedAt: usageInfo.lastUsedAt,
          evaluationCount: usageInfo.count
        }
      })
      .filter((user) => !search || user.accountLabel.toLowerCase().includes(search) || user.id.includes(search))
      .filter((user) => {
        const banned = Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now())
        if (filter === 'admin') return user.role === 'admin'
        if (filter === 'active') return user.licenseStatus === 'active' && !banned
        if (filter === 'inactive') return user.licenseStatus === 'inactive' && !banned
        if (filter === 'expired') return user.licenseStatus === 'expired' && !banned
        if (filter === 'disabled') return banned || user.licenseStatus === 'suspended'
        if (filter === 'unbound') return !user.isBound
        return true
      })

    const filteredRequest = Boolean(search) || filter !== 'all'
    const offset = (page - 1) * pageSize
    const pagedUsers = filteredRequest && !userId
      ? users.slice(offset, offset + pageSize)
      : users
    return json({
      success: true,
      users: pagedUsers,
      total: userId || filteredRequest ? users.length : totalUsers,
      currentAdminId: currentAdmin.id,
      truncated: filteredRequest && listedUsers.length >= 1000
    })
  } catch (error) {
    return adminApiError(error, '无法加载用户列表')
  }
}
