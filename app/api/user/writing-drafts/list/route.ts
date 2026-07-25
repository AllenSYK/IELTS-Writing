import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { managedDraftHasContent } from '@/lib/writing-drafts'

export type DraftListItem = {
  id: string
  taskType: string
  createdAt: string
  updatedAt: string
}

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_drafts')
    .select('id, task_type, draft_data, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    return json({ success: false, message: '草稿列表读取失败' }, { status: 500 })
  }

  const drafts: DraftListItem[] = (data ?? [])
    .filter((row) => managedDraftHasContent(row.draft_data, row.task_type as 'task1' | 'task2' | 'mock'))
    .map((row) => ({
      id: row.id as string,
      taskType: row.task_type as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }))

  return json({ success: true, drafts })
}
