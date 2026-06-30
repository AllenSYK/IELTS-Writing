import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { count: totalRecords } = await service
    .from('writing_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { count: extractedRecords } = await service
    .from('writing_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('error_extracted_at', 'is', null)

  const { count: errorPatterns } = await service
    .from('writing_error_patterns')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { count: errorOccurrences } = await service
    .from('writing_error_occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const total = totalRecords ?? 0
  const extracted = extractedRecords ?? 0
  const remaining = Math.max(0, total - extracted)

  return json({
    success: true,
    totalRecords: total,
    extractedRecords: extracted,
    remainingRecords: remaining,
    errorPatterns: errorPatterns ?? 0,
    errorOccurrences: errorOccurrences ?? 0,
    isComplete: remaining === 0
  })
}
