import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service
    .from('past_paper_questions')
    .select('source_year')
    .eq('status', 'published')
    .not('source_year', 'is', null)

  if (error) return json({ success: false, message: error.message }, { status: 500 })

  const years = [...new Set((data ?? []).map((r) => r.source_year).filter(Boolean))] as number[]
  years.sort((a, b) => b - a)

  return json({ success: true, years })
}
