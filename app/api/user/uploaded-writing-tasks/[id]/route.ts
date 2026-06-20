import { json } from '@/lib/http'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'

const UploadBucket = 'writing-task-uploads'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })
  const { id } = await context.params
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_task_uploads')
    .select('confirmed_question, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return json({ success: false, message: '自定义题目读取失败' }, { status: 500 })
  if (!data || data.status !== 'confirmed' || !data.confirmed_question) {
    return json({ success: false, message: '该题目尚未确认或不存在' }, { status: 404 })
  }
  return json({ success: true, question: data.confirmed_question })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })
  const { id } = await context.params
  const service = createSupabaseServiceRoleClient()
  const { data } = await service
    .from('writing_task_uploads')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data) return json({ success: true })
  if (data.storage_path) await service.storage.from(UploadBucket).remove([data.storage_path])
  const { error } = await service
    .from('writing_task_uploads')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return json({ success: false, message: '上传题目删除失败' }, { status: 500 })
  return json({ success: true })
}
