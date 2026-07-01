import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data, error } = await service
    .from('past_paper_questions')
    .select('id, status, task_type, title, question_text, summary, source_type, source_name, source_year, frequency_level, difficulty, task1_visual_types, task1_visual_data, task2_question_type, task2_topic, exam_date, exam_session, tags, topics, keywords, show_source_image, created_at')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error || !data) {
    return json({ success: false, message: 'Not found' }, { status: 404 })
  }

  return json({
    success: true,
    question: {
      id: data.id,
      status: data.status,
      taskType: data.task_type,
      title: data.title,
      questionText: data.question_text,
      summary: data.summary,
      sourceType: data.source_type,
      sourceName: data.source_name,
      sourceYear: data.source_year,
      frequencyLevel: data.frequency_level,
      difficulty: data.difficulty,
      task1VisualTypes: data.task1_visual_types,
      task1VisualData: data.task1_visual_data,
      task2QuestionType: data.task2_question_type,
      topics: data.topics ?? [],
      keywords: data.keywords ?? [],
      showSourceImage: data.show_source_image,
      createdAt: data.created_at
    }
  })
}
