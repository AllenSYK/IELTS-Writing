import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  UploadedTask2QuestionTypeSchema,
  UploadedWritingTaskResultSchema,
  buildConfirmedUploadedQuestion
} from '@/lib/uploaded-writing-task'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'

const ConfirmSchema = z.object({
  questionText: z.string().trim().min(10).max(12_000),
  detectedQuestionType: UploadedTask2QuestionTypeSchema.optional()
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })
  const { id } = await context.params
  const body = ConfirmSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return json({ success: false, message: '请检查题目文字和题型' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_task_uploads')
    .select('parse_result, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return json({ success: false, message: '识别结果读取失败' }, { status: 500 })
  const parsed = UploadedWritingTaskResultSchema.safeParse(data?.parse_result)
  if (!data || !parsed.success || !['parsed', 'confirmed'].includes(data.status)) {
    return json({ success: false, message: '识别结果不存在，请重新上传' }, { status: 404 })
  }

  const question = buildConfirmedUploadedQuestion({
    uploadId: id,
    result: parsed.data,
    questionText: body.data.questionText,
    detectedQuestionType: body.data.detectedQuestionType
  })
  const { error: updateError } = await supabase
    .from('writing_task_uploads')
    .update({
      status: 'confirmed',
      confirmed_question: question,
      confirmed_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (updateError) return json({ success: false, message: '题目确认失败' }, { status: 500 })
  return json({ success: true, question })
}
