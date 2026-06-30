import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20)
})

export async function GET(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const url = new URL(request.url)
  const params = Object.fromEntries(url.searchParams.entries())
  let query
  try {
    query = QuerySchema.parse(params)
  } catch {
    query = { page: 1, limit: 20 }
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id
  const offset = (query.page - 1) * query.limit

  const { data, error, count } = await service
    .from('study_plan_adjustment_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + query.limit - 1)

  if (error) {
    return json({ success: false, message: error.message }, { status: 500 })
  }

  const transactions = (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    reason: row.reason,
    balanceAfter: row.balance_after,
    createdAt: row.created_at
  }))

  return json({
    success: true,
    transactions,
    total: count ?? 0,
    page: query.page,
    limit: query.limit
  })
}
