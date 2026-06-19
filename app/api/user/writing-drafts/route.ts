import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'

const DraftSchema = z.object({
  id: z.string().min(1).max(180),
  taskType: z.enum(['task1', 'task2', 'mock']),
  draft: z.record(z.unknown())
})

export async function GET(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return json({ success: false, message: '缺少草稿标识' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_drafts')
    .select('draft_data')
    .eq('user_id', user.id)
    .eq('id', id)
    .maybeSingle()

  if (error) return json({ success: false, message: '草稿读取失败' }, { status: 500 })
  return json({ success: true, draft: data?.draft_data ?? null })
}

export async function PUT(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })

  const parsed = DraftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ success: false, message: '草稿格式不正确' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('writing_drafts')
    .upsert({
      id: parsed.data.id,
      user_id: user.id,
      task_type: parsed.data.taskType,
      draft_data: parsed.data.draft,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,id' })

  if (error) return json({ success: false, message: '草稿保存失败' }, { status: 500 })
  return json({ success: true })
}

export async function DELETE(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return json({ success: false, message: '缺少草稿标识' }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('writing_drafts')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id)

  if (error) return json({ success: false, message: '草稿删除失败' }, { status: 500 })
  return json({ success: true })
}
