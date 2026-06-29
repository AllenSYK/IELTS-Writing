import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const SettingsSchema = z.object({
  overallTarget: z.number().min(1).max(9).optional(),
  task1Target: z.number().min(1).max(9).optional(),
  task2Target: z.number().min(1).max(9).optional(),
  examDate: z.string().nullable().optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  minutesPerSession: z.number().int().min(10).max(240).optional(),
  intensity: z.enum(['relaxed', 'standard', 'intensive']).optional(),
  allowTimedPractice: z.boolean().optional(),
  includeFullTests: z.boolean().optional()
})

export async function PATCH(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = SettingsSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const updates: Record<string, unknown> = {}
  if (body.overallTarget !== undefined) updates.overall_target = body.overallTarget
  if (body.task1Target !== undefined) updates.task1_target = body.task1Target
  if (body.task2Target !== undefined) updates.task2_target = body.task2Target
  if (body.examDate !== undefined) updates.exam_date = body.examDate
  if (body.sessionsPerWeek !== undefined) updates.sessions_per_week = body.sessionsPerWeek
  if (body.minutesPerSession !== undefined) updates.minutes_per_session = body.minutesPerSession
  if (body.intensity !== undefined) updates.intensity = body.intensity
  if (body.allowTimedPractice !== undefined) updates.allow_timed_practice = body.allowTimedPractice
  if (body.includeFullTests !== undefined) updates.include_full_tests = body.includeFullTests

  if (Object.keys(updates).length === 0) {
    return json({ success: false, message: 'No changes provided' }, { status: 400 })
  }

  const { data, error } = await service
    .from('study_plan_profiles')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true, profile: data })
}
