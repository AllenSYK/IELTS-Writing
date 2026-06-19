import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import {
  WritingRecordSelect,
  writingRecordFromRow
} from '@/lib/writing-record-persistence'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select(WritingRecordSelect)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return json({ success: false, message: '写作记录读取失败' }, { status: 500 })
  if (!data) return json({ success: false, message: '记录不存在' }, { status: 404 })

  return json({ success: true, record: writingRecordFromRow(data as never) })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('writing_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return json({ success: false, message: '写作记录删除失败' }, { status: 500 })
  return json({ success: true })
}
