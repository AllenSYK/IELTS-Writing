import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const PatchSchema = z.object({
  status: z.enum(['in_progress', 'skipped']).optional(),
  writingRecordId: z.string().optional()
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const { id } = await params
  let body
  try {
    body = PatchSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()

  if (body.writingRecordId && body.status === undefined) {
    const { data, error } = await service
      .rpc('complete_study_plan_task', { p_task_id: id, p_writing_record_id: body.writingRecordId })
      .single()
    if (error) return json({ success: false, message: error.message }, { status: 500 })
    return json({ success: true, result: data })
  }

  const updates: Record<string, unknown> = {}
  if (body.status) {
    updates.status = body.status
    if (body.status === 'in_progress') updates.started_at = new Date().toISOString()
  }
  if (body.writingRecordId) updates.writing_record_id = body.writingRecordId

  const { error } = await service
    .from('study_plan_tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', check.user.id)

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}
