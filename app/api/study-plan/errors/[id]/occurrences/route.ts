import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: pattern, error: patternError } = await service
    .from('writing_error_patterns')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (patternError || !pattern) {
    return json({ success: false, message: 'Error pattern not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)))
  const offset = (page - 1) * limit

  const { data, error, count } = await service
    .from('writing_error_occurrences')
    .select('*', { count: 'exact' })
    .eq('error_pattern_id', id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return json({ success: false, message: error.message }, { status: 500 })
  }

  const occurrences = (data ?? []).map((row) => ({
    id: row.id,
    errorPatternId: row.error_pattern_id,
    userId: row.user_id,
    writingRecordId: row.writing_record_id,
    sentenceExcerpt: row.sentence_excerpt,
    correction: row.correction,
    explanation: row.explanation,
    createdAt: row.created_at
  }))

  return json({
    success: true,
    occurrences,
    total: count ?? 0,
    page,
    limit
  })
}
