import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveBindingStatus } from '@/lib/web-license/admin-license-data'
import { toQueryParamNumber } from '@/lib/admin/number-utils'

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toQueryParamNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, toQueryParamNumber(url.searchParams.get('pageSize'), 50)))
    const search = url.searchParams.get('search')?.trim().toLowerCase() || ''
    const status = url.searchParams.get('status')?.trim() || 'all'
    const licenseId = url.searchParams.get('licenseId')?.trim() || ''
    const email = url.searchParams.get('email')?.trim() || ''
    const userId = url.searchParams.get('userId')?.trim() || ''

    let query = service
      .from('license_activations')
      .select(`
        id,
        license_id,
        user_id,
        email,
        activated_at,
        expires_at,
        status,
        last_used_at,
        revoked_at,
        revoked_reason
      `)
      .order('activated_at', { ascending: false })
      .limit(1000)

    if (licenseId) query = query.eq('license_id', licenseId)
    if (userId) query = query.eq('user_id', userId)
    if (email) query = query.ilike('email', `%${email}%`)

    const { data, error } = await query
    if (error) throw error

    const userIds = new Set((data || []).map((binding) => binding.user_id))
    const licenseIds = new Set((data || []).map((binding) => binding.license_id))
    if (userId) userIds.add(userId)
    if (licenseId) licenseIds.add(licenseId)

    const [profilesResult, licensesResult] = await Promise.all([
      userIds.size
        ? service.from('profiles').select('id, email, role').in('id', [...userIds])
        : Promise.resolve({ data: [], error: null }),
      licenseIds.size
        ? service
            .from('license_codes')
            .select('id, code_prefix, plan, status, expires_at, duration_days')
            .in('id', [...licenseIds])
        : Promise.resolve({ data: [], error: null })
    ])

    if (profilesResult.error) throw profilesResult.error
    if (licensesResult.error) throw licensesResult.error

    const profileMap = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]))
    const licenseMap = new Map((licensesResult.data || []).map((license) => [license.id, license]))

    const normalized = (data || []).map((binding) => {
      const license = licenseMap.get(binding.license_id)
      return {
        ...binding,
        license_codes: license || null,
        binding_status: getEffectiveBindingStatus({
          ...binding,
          license_status: license?.status,
          license_expires_at: license?.expires_at
        }),
        user_role: profileMap.get(binding.user_id)?.role || 'user'
      }
    })

    const searched = search
      ? normalized.filter((binding) => {
          const license = binding.license_codes
          return binding.email.toLowerCase().includes(search)
            || binding.user_id.toLowerCase().includes(search)
            || license?.code_prefix?.toLowerCase().includes(search)
        })
      : normalized
    const filtered = status === 'all'
      ? searched
      : searched.filter((binding) => binding.binding_status === status)
    const offset = (page - 1) * pageSize

    let licenseLabel = ''
    if (licenseId) {
      const license = licenseMap.get(licenseId)
      licenseLabel = license?.code_prefix ? `${license.code_prefix}-••••-••••` : licenseId
    }

    let userLabel = ''
    if (userId) {
      userLabel = profileMap.get(userId)?.email || userId
    }

    return json({
      success: true,
      bindings: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      filterLabels: {
        license: licenseLabel,
        email,
        user: userLabel
      }
    })
  } catch (error) {
    return adminApiError(error, '无法加载邮箱绑定')
  }
}
