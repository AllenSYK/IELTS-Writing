import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

function toNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, toNumber(url.searchParams.get('pageSize'), 50)))
    const search = url.searchParams.get('search')?.trim() || ''
    const status = url.searchParams.get('status')?.trim() || 'all'
    const offset = (page - 1) * pageSize

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
        updated_at,
        license_activations (
          id,
          user_id,
          email,
          activated_at,
          expires_at,
          status,
          last_used_at,
          revoked_at,
          revoked_reason
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.or(`code_prefix.ilike.%${search}%,code_value.ilike.%${search}%,plan.ilike.%${search}%,note.ilike.%${search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error

    const filtered = search.includes('@')
      ? (data || []).filter((item) =>
          (item.license_activations || []).some((activation) => activation.email.toLowerCase().includes(search.toLowerCase()))
        )
      : data || []

    return json({ success: true, licenses: filtered, total: search.includes('@') ? filtered.length : count || 0 })
  } catch (error) {
    return adminApiError(error, '无法加载激活码')
  }
}
