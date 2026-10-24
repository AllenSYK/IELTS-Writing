import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveBindingStatus, loadExpiringReminderDays } from '@/lib/web-license/admin-license-data'
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
    // 导出按完整筛选条件读取（不再受当前已加载页限制），单次上限 10000 条。
    const exportAll = url.searchParams.get('export') === '1'
    const effectivePage = exportAll ? 1 : page
    const effectivePageSize = exportAll ? 10000 : pageSize

    const reminderDays = await loadExpiringReminderDays(service)

    // 优先走数据库分页（RPC 尚未部署时回退到旧路径）。
    const rpcResult = await service.rpc('admin_list_bindings', {
      p_search: search,
      p_status: status,
      p_license_id: licenseId || null,
      p_email: email,
      p_user_id: userId || null,
      p_expiring_days: reminderDays,
      p_page: effectivePage,
      p_page_size: effectivePageSize
    })

    if (!rpcResult.error && rpcResult.data) {
      const payload = rpcResult.data as { items?: Array<Record<string, unknown>>; total?: number }
      const rows = payload.items ?? []

      const rowUserIds = Array.from(new Set(rows.map((row) => String(row.user_id)).filter(Boolean)))
      const roleMap = new Map<string, string>()
      if (rowUserIds.length > 0) {
        const { data: profiles } = await service.from('profiles').select('id, role').in('id', rowUserIds)
        for (const profile of profiles ?? []) roleMap.set(String(profile.id), String(profile.role || 'user'))
      }

      let licenseLabel = ''
      if (licenseId) {
        const { data: licenseRow } = await service
          .from('license_codes')
          .select('code_prefix')
          .eq('id', licenseId)
          .maybeSingle()
        licenseLabel = licenseRow?.code_prefix ? `${licenseRow.code_prefix}-••••-••••` : licenseId
      }
      let userLabel = ''
      if (userId) {
        const { data: profile } = await service.from('profiles').select('email').eq('id', userId).maybeSingle()
        userLabel = profile?.email || userId
      }

      const bindings = rows.map((row) => ({
        id: row.id,
        license_id: row.license_id,
        user_id: row.user_id,
        email: row.email,
        activated_at: row.activated_at,
        expires_at: row.expires_at,
        status: row.status,
        last_used_at: row.last_used_at,
        revoked_at: row.revoked_at,
        revoked_reason: row.revoked_reason,
        binding_status: row.binding_status,
        user_role: roleMap.get(String(row.user_id)) || 'user',
        license_codes: row.license_row_id
          ? {
              id: row.license_row_id,
              code_prefix: row.license_code_prefix,
              plan: row.license_plan,
              status: row.license_status,
              expires_at: row.license_expires_at,
              duration_days: row.license_duration_days
            }
          : null
      }))

      return json({
        success: true,
        bindings,
        total: Number(payload.total ?? bindings.length),
        page: effectivePage,
        pageSize: effectivePageSize,
        filterLabels: {
          license: licenseLabel,
          email,
          user: userLabel
        }
      })
    }

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
        }, Date.now(), reminderDays),
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
    const offset = exportAll ? 0 : (page - 1) * pageSize
    const slice = exportAll ? filtered.slice(0, 10000) : filtered.slice(offset, offset + pageSize)

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
      bindings: slice,
      total: filtered.length,
      page: effectivePage,
      pageSize: effectivePageSize,
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
