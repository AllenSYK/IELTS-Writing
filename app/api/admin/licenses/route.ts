import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveLicenseStatus } from '@/lib/web-license/admin-license-data'
import { toQueryParamNumber } from '@/lib/admin/number-utils'

function sanitizeSearchInput(value: string): string {
  return value
    .replace(/[,()]/g, ' ')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toQueryParamNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, toQueryParamNumber(url.searchParams.get('pageSize'), 50)))
    const search = sanitizeSearchInput(url.searchParams.get('search') || '')
    const status = url.searchParams.get('status')?.trim() || 'all'
    const plan = url.searchParams.get('plan')?.trim() || 'all'
    const licenseId = url.searchParams.get('licenseId')?.trim() || ''
    // 导出按完整筛选条件读取（不再受当前已加载页限制），单次上限 10000 条。
    const exportAll = url.searchParams.get('export') === '1'
    const effectivePage = exportAll ? 1 : page
    const effectivePageSize = exportAll ? 10000 : pageSize

    // 优先走数据库分页（RPC 尚未部署时回退到旧路径）。
    const rpcResult = await service.rpc('admin_list_licenses', {
      p_search: search,
      p_status: status,
      p_plan: plan,
      p_license_id: licenseId || null,
      p_page: effectivePage,
      p_page_size: effectivePageSize
    })
    if (!rpcResult.error && rpcResult.data) {
      const payload = rpcResult.data as { items?: Array<Record<string, unknown>>; total?: number }
      const items = (payload.items ?? []).map((row) => ({
        ...row,
        activation_count: Number(row.activation_count ?? 0),
        remaining_count: Math.max(0, Number(row.max_activations ?? 0) - Number(row.activation_count ?? 0)),
        status: row.effective_status ?? row.status
      }))
      return json({
        success: true,
        licenses: items,
        total: Number(payload.total ?? items.length),
        page: effectivePage,
        pageSize: effectivePageSize
      })
    }

    let query = service
      .from('license_codes')
      .select(`
        id,
        code_value,
        code_prefix,
        plan,
        duration_days,
        max_activations,
        activation_count,
        status,
        expires_at,
        note,
        created_by,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (licenseId) query = query.eq('id', licenseId)
    if (plan !== 'all') query = query.eq('plan', plan)
    if (search) {
      query = query.or(`code_prefix.ilike.%${search}%,code_value.ilike.%${search}%,plan.ilike.%${search}%,note.ilike.%${search}%`)
    }

    const licensesResult = await query
    if (licensesResult.error) throw licensesResult.error

    const normalized = (licensesResult.data || []).map((license) => {
      const activationCount = license.activation_count || 0
      const effectiveStatus = getEffectiveLicenseStatus({
        ...license,
        activation_count: activationCount
      })
      // 完整码只允许通过有审计的 reveal 端点读取。列表响应连末四位也不返回，
      // 避免 code_prefix 与末四位组合后显著缩小暴力枚举空间。
      const redacted = { ...license }
      Reflect.deleteProperty(redacted, 'code_value')
      return {
        ...redacted,
        activation_count: activationCount,
        remaining_count: Math.max(0, license.max_activations - activationCount),
        status: effectiveStatus
      }
    })

    const filtered = status === 'all'
      ? normalized
      : normalized.filter((license) => license.status === status)
    const offset = (exportAll ? 0 : (page - 1) * pageSize)
    const slice = exportAll ? filtered.slice(0, 10000) : filtered.slice(offset, offset + pageSize)

    return json({
      success: true,
      licenses: slice,
      total: filtered.length,
      page: effectivePage,
      pageSize: effectivePageSize
    })
  } catch (error) {
    return adminApiError(error, '无法加载激活码')
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminService(request)
    return json({ success: false, code: 'ACTIVATION_RETIRED', message: '激活码生成功能已停用；现有权益记录继续保留。' }, { status: 410 })
  } catch (error) { return adminApiError(error, '无法访问历史权益') }
}
