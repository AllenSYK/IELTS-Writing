import { after } from 'next/server'
import { refreshRollingPlan } from '@/lib/study-plan/rolling'
import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export const maxDuration = 300

const SkipSchema = z.object({
  reason: z.enum(['no_time', 'too_hard', 'not_interested', 'already_mastered', 'other'])
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = SkipSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data, error } = await service
    .from('study_plan_tasks')
    .update({ status: 'skipped', skip_reason: body.reason })
    .eq('id', id)
    .eq('user_id', check.user.id)
    .in('status', ['pending', 'in_progress'])
    .select('id').maybeSingle()

  if (error) return json({ success: false, message: 'Task not found' }, { status: 404 })
  if (data) after(() => refreshRollingPlan(service, check.user.id, 'skip').catch(error => {
    console.error('Study plan adaptation failed', error)
  }))
  return json({ success: true })
}
