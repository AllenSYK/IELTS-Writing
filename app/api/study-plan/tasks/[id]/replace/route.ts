import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { normalizeStudyPlanTaskType } from '@/lib/study-plan-types'

const ReplaceSchema = z.object({
  newTaskType: z.string().min(1).max(50),
  newTitle: z.string().min(1).max(100),
  newDescription: z.string().max(200).optional().default('')
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = ReplaceSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data: existing, error: fetchError } = await service
    .from('study_plan_tasks')
    .select('id, focus_criteria, focus_error_tags, estimated_minutes')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .in('status', ['pending', 'in_progress'])
    .single()

  if (fetchError || !existing) return json({ success: false, message: 'Task not found' }, { status: 404 })

  const normalizedType = normalizeStudyPlanTaskType(body.newTaskType)

  const writingMode = normalizedType === 'task1' ? 'task1'
    : normalizedType === 'task2' ? 'task2'
    : normalizedType === 'full_test' ? null
    : null

  const { error } = await service
    .from('study_plan_tasks')
    .update({
      task_type: normalizedType,
      title: body.newTitle,
      description: body.newDescription,
      writing_mode: writingMode,
      status: 'pending',
      started_at: null,
      completed_at: null,
      writing_record_id: null
    })
    .eq('id', id)

  if (error) return json({ success: false, message: 'Update failed' }, { status: 500 })
  return json({ success: true })
}
