import { z } from 'zod'
import { validDateKey } from '@/lib/study-plan/config'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const RescheduleSchema = z.object({
  newDate: z.string().refine(validDateKey)
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

  const { data: profile } = await service.from('study_plan_profiles')
    .select('exam_date, timezone').eq('user_id', check.user.id).maybeSingle()
  const today = getDateKeyInTimeZone(new Date(), profile?.timezone ?? undefined)
  if (body.newDate < today || (profile?.exam_date && body.newDate > profile.exam_date)) {
    return json({ success: false, message: '请选择今天至考试日之间的日期。' }, { status: 400 })
  }
  const { error, data } = await service
    .from('study_plan_tasks')
    .update({ scheduled_date: body.newDate, status: 'pending', is_locked: true })
    .eq('id', id)
    .eq('user_id', check.user.id)
    .in('status', ['pending', 'skipped'])
    .select('id').maybeSingle()

  if (error || !data) return json({ success: false, message: 'Task not found' }, { status: 404 })
  return json({ success: true })
}
