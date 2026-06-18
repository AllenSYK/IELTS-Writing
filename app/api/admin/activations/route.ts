import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, numberParam(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, numberParam(url.searchParams.get('pageSize'), 50)))
    const search = url.searchParams.get('search')?.trim().toLowerCase() || ''
    const status = url.searchParams.get('status') || 'all'
    const offset = (page - 1) * pageSize
    const now = new Date()
    const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    let query = service
      .from('license_activations')
      .select(`
        id, license_id, user_id, email, activated_at, expires_at, status, last_used_at, revoked_at, revoked_reason,
        license_codes (id, code_value, code_prefix, plan, status)
      `, { count: 'exact' })
      .order('activated_at', { ascending: false })

    if (status === 'expiring') {
      query = query.eq('status', 'active').gt('expires_at', now.toISOString()).lte('expires_at', soon.toISOString())
    } else if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (search.includes('@')) {
      query = query.ilike('email', `%${search}%`)
    }

    const { data, error, count } = await query.range(offset, offset + pageSize - 1)
    if (error) throw error
    const activations = search && !search.includes('@')
      ? (data || []).filter((item) => {
          const license = Array.isArray(item.license_codes) ? item.license_codes[0] : item.license_codes
          return license?.code_prefix?.toLowerCase().includes(search) || license?.code_value?.toLowerCase().includes(search)
        })
      : data || []

    return json({ success: true, activations, total: search && !search.includes('@') ? activations.length : count || 0 })
  } catch (error) {
    return adminApiError(error, '无法加载激活记录')
  }
}
