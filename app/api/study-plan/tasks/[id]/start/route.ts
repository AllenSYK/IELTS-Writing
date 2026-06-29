import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data, error } = await service
    .from('study_plan_tasks')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', check.user.id)
    .eq('status', 'pending')
    .select('id, task_type, writing_mode, question_id')
    .single()

  if (error) return json({ success: false, message: 'Task not found or already started' }, { status: 404 })
  return json({ success: true, task: data })
}
