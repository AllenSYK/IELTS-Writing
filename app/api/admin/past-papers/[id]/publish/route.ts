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

  const { data: question, error: fetchError } = await service
    .from('past_paper_questions')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchError || !question) {
    return json({ success: false, message: 'Question not found' }, { status: 404 })
  }

  if (question.status === 'published') {
    return json({ success: false, message: 'Already published' }, { status: 400 })
  }

  const { error } = await service
    .from('past_paper_questions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}
