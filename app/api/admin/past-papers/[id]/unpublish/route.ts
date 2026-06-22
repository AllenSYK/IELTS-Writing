import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWebAdmin()
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { error } = await service
    .from('past_paper_questions')
    .update({ status: 'unpublished' })
    .eq('id', id)

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}
