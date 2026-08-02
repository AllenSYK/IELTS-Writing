import { createApiObservation } from '@/lib/api-observability'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import {
  WritingRecordSelect,
  writingRecordFromRow
} from '@/lib/writing-record-persistence'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const observation = createApiObservation('/api/user/writing-records/[id]', request)
  const user = await observation.time('auth', () => getCurrentSupabaseUser())
  if (!user) return observation.respond({ success: false, message: '请先登录' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data, error } = await observation.time('database', () => supabase
      .from('writing_records')
      .select(WritingRecordSelect)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle())

  if (error) return observation.respond({ success: false, message: '写作记录读取失败' }, { status: 500 })
  if (!data) return observation.respond({ success: false, message: '记录不存在' }, { status: 404 })

  return observation.respond({ success: true, record: writingRecordFromRow(data as never) })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const observation = createApiObservation('/api/user/writing-records/[id]', request)
  const user = await observation.time('auth', () => getCurrentSupabaseUser())
  if (!user) return observation.respond({ success: false, message: '请先登录' }, { status: 401 })

  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { error } = await observation.time('database', () => supabase
      .from('writing_records')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id))

  if (error) return observation.respond({ success: false, message: '写作记录删除失败' }, { status: 500 })
  return observation.respond({ success: true })
}
