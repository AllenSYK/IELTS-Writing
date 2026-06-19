import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { UNBOUND_BINDING_REASON } from '@/lib/web-license/admin-license-data'
import type { User } from '@supabase/supabase-js'

function toNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(100, Math.max(1, toNumber(url.searchParams.get('pageSize'), 50)))
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
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: pageSize })
      if (error) throw error
      listedUsers = data.users
      totalUsers = data.total || data.users.length
    }

    const userIds = listedUsers.map((user) => user.id)
    const [{ data: profiles, error: profilesError }, { data: activations, error: activationsError }, { data: usage, error: usageError }] = await Promise.all([
      service.from('profiles').select('id, email, role, license_status, license_expires_at, created_at').in('id', userIds),
      service
        .from('license_activations')
        .select('id, user_id, email, activated_at, expires_at, status, last_used_at, revoked_reason, license_codes(id, code_value, code_prefix, plan, status)')
        .in('user_id', userIds)
        .order('expires_at', { ascending: false }),
      service.from('usage_records').select('user_id, created_at').in('user_id', userIds)
    ])

    if (profilesError) throw profilesError
    if (activationsError) throw activationsError
    if (usageError) throw usageError

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
    const activationMap = new Map<string, (typeof activations)[number]>()
    for (const activation of activations || []) {
      if (activation.revoked_reason === UNBOUND_BINDING_REASON) continue
      if (!activationMap.has(activation.user_id)) activationMap.set(activation.user_id, activation)
    }
    const usageMap = new Map<string, { count: number; lastUsedAt: string | null }>()
    for (const item of usage || []) {
      const current = usageMap.get(item.user_id) || { count: 0, lastUsedAt: null }
      current.count += 1
      if (!current.lastUsedAt || new Date(item.created_at).getTime() > new Date(current.lastUsedAt).getTime()) {
        current.lastUsedAt = item.created_at
      }
      usageMap.set(item.user_id, current)
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
          licenseCode: license?.code_value || null,
          licensePrefix: license?.code_prefix || null,
          lastUsedAt: usageInfo.lastUsedAt,
          evaluationCount: usageInfo.count
        }
      })
      .filter((user) => !search || user.email?.toLowerCase().includes(search) || user.id.includes(search))
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

    return json({ success: true, users, total: userId ? users.length : totalUsers })
  } catch (error) {
    return adminApiError(error, '无法加载用户列表')
  }
}
