import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const PatchSchema = z.object({
  overallTarget: z.number().min(1).max(9).optional(),
  task1Target: z.number().min(1).max(9).optional(),
  task2Target: z.number().min(1).max(9).optional(),
  examDate: z.string().nullable().optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  minutesPerSession: z.number().int().min(10).max(240).optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  includeFullTests: z.boolean().optional(),
  includePastPapers: z.boolean().optional(),
  task1Ratio: z.number().min(0.1).max(0.9).optional(),
  task2Ratio: z.number().min(0.1).max(0.9).optional(),
  preferWeakness: z.boolean().optional(),
  weekendExtended: z.boolean().optional()
})

export async function PATCH(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  let body
  try {
    body = PatchSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const updates: Record<string, unknown> = {}
  if (body.overallTarget !== undefined) updates.overall_target = body.overallTarget
  if (body.task1Target !== undefined) updates.task1_target = body.task1Target
  if (body.task2Target !== undefined) updates.task2_target = body.task2Target
  if (body.examDate !== undefined) updates.exam_date = body.examDate
  if (body.sessionsPerWeek !== undefined) updates.sessions_per_week = body.sessionsPerWeek
  if (body.minutesPerSession !== undefined) updates.minutes_per_session = body.minutesPerSession
  if (body.preferredDays !== undefined) updates.preferred_days = body.preferredDays
  if (body.includeFullTests !== undefined) updates.include_full_tests = body.includeFullTests
  if (body.includePastPapers !== undefined) updates.include_past_papers = body.includePastPapers
  if (body.task1Ratio !== undefined) updates.task1_ratio = body.task1Ratio
  if (body.task2Ratio !== undefined) updates.task2_ratio = body.task2Ratio
  if (body.preferWeakness !== undefined) updates.prefer_weakness = body.preferWeakness
  if (body.weekendExtended !== undefined) updates.weekend_extended = body.weekendExtended

  const { data, error } = await service
    .from('study_plan_profiles')
    .upsert({ user_id: check.user.id, ...updates }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true, profile: mapProfile(data) })
}

function mapProfile(row: Record<string, unknown>) {
  return {
    userId: row.user_id, overallTarget: row.overall_target, task1Target: row.task1_target,
    task2Target: row.task2_target, examDate: row.exam_date, sessionsPerWeek: row.sessions_per_week,
    minutesPerSession: row.minutes_per_session, preferredDays: row.preferred_days ?? [],
    includeFullTests: row.include_full_tests, includePastPapers: row.include_past_papers,
    task1Ratio: row.task1_ratio, task2Ratio: row.task2_ratio,
    preferWeakness: row.prefer_weakness, weekendExtended: row.weekend_extended, timezone: row.timezone
  }
}
