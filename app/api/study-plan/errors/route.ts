import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const QuerySchema = z.object({
  category: z.string().optional(),
  status: z.enum(['active', 'improving', 'mastered', 'archived']).optional(),
  sort: z.enum(['count', 'recent', 'mastery']).optional().default('recent'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
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
    return json({ success: false, message: 'Invalid query' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id
  const offset = (query.page - 1) * query.limit

  let dbQuery = service
    .from('writing_error_patterns')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (query.category) {
    dbQuery = dbQuery.eq('category', query.category)
  }
  if (query.status) {
    dbQuery = dbQuery.eq('status', query.status)
  }

  if (query.sort === 'count') {
    dbQuery = dbQuery.order('occurrence_count', { ascending: false })
  } else if (query.sort === 'mastery') {
    dbQuery = dbQuery.order('mastery_level', { ascending: true })
  } else {
    dbQuery = dbQuery.order('last_seen_at', { ascending: false })
  }

  dbQuery = dbQuery.range(offset, offset + query.limit - 1)

  const { data, error, count } = await dbQuery

  if (error) {
    return json({ success: false, message: error.message }, { status: 500 })
  }

  const patterns = (data ?? []).map(rowToPattern)

  const { data: statsData } = await service
    .from('writing_error_patterns')
    .select('status')
    .eq('user_id', userId)

  const stats = {
    total: statsData?.length ?? 0,
    active: statsData?.filter((r) => r.status === 'active').length ?? 0,
    improving: statsData?.filter((r) => r.status === 'improving').length ?? 0,
    mastered: statsData?.filter((r) => r.status === 'mastered').length ?? 0
  }

  return json({
    success: true,
    patterns,
    total: count ?? 0,
    page: query.page,
    limit: query.limit,
    stats
  })
}

function rowToPattern(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    subcategory: row.subcategory,
    normalizedKey: row.normalized_key,
    title: row.title,
    description: row.description,
    exampleWrong: row.example_wrong,
    exampleCorrect: row.example_correct,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    status: row.status,
    masteryLevel: row.mastery_level,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
