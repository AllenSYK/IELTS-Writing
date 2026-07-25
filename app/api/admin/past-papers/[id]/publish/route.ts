import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { pastPaperPracticeReadiness } from '@/lib/past-paper-readiness'

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
    .select('id, status, task_type, question_text, task1_visual_types, task1_visual_data')
    .eq('id', id)
    .single()

  if (fetchError || !question) {
    return json({ success: false, message: 'Question not found' }, { status: 404 })
  }

  if (question.status === 'published') {
    return json({ success: false, message: 'Already published' }, { status: 400 })
  }

  const readiness = pastPaperPracticeReadiness({
    taskType: question.task_type,
    questionText: question.question_text,
    task1VisualTypes: question.task1_visual_types,
    task1VisualData: question.task1_visual_data as Record<string, unknown> | null
  })
  if (!readiness.ready) {
    return json({ success: false, code: readiness.code, message: readiness.message }, { status: 409 })
  }

  const { error } = await service
    .from('past_paper_questions')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}
