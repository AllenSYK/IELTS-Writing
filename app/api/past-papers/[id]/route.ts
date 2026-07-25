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
    .select('id, status, task_type, title, question_text, summary, source_type, source_name, source_year, frequency_level, difficulty, task1_visual_types, task1_visual_data, task2_question_type, exam_date, exam_session, topics, keywords, show_source_image, created_at')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.error('[past-paper-detail]', {
      questionId: id,
      code: error.code,
      message: error.message
    })
    return json({ success: false, message: '题库读取失败，请稍后重试。' }, { status: 500 })
  }

  if (!data) {
    return json({ success: false, message: '这道题目不存在或尚未发布。' }, { status: 404 })
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
