import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const RescheduleSchema = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = RescheduleSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { error } = await service
    .from('study_plan_tasks')
    .update({ scheduled_date: body.newDate, status: 'pending' })
    .eq('id', id)
    .eq('user_id', check.user.id)
    .in('status', ['pending', 'in_progress', 'skipped'])

  if (error) return json({ success: false, message: 'Task not found' }, { status: 404 })
  return json({ success: true })
}
