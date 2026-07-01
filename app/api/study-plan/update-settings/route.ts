import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { getDateKeyInTimeZone } from '@/lib/date-utils'

const UpdateSettingsSchema = z.object({
  overallTarget: z.number().min(1).max(9).optional(),
  task1Target: z.number().min(1).max(9).optional(),
  task2Target: z.number().min(1).max(9).optional(),
  examDate: z.string().nullable().optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  minutesPerSession: z.number().int().min(10).max(240).optional(),
  intensity: z.enum(['relaxed', 'standard', 'intensive']).optional(),
  allowTimedPractice: z.boolean().optional(),
  includeFullTests: z.boolean().optional(),
  questionBankRatio: z.number().int().min(0).max(100).optional(),
  aiGeneratedRatio: z.number().int().min(0).max(100).optional()
})

export async function PATCH(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = UpdateSettingsSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  if (body.examDate !== undefined && body.examDate !== null) {
    const today = getDateKeyInTimeZone()
    if (body.examDate < today) {
      return json({ success: false, message: '考试日期不能是过去' }, { status: 400 })
    }
  }

  // Validate ratio sum
  if (body.questionBankRatio !== undefined || body.aiGeneratedRatio !== undefined) {
    const bankR = body.questionBankRatio ?? 80
    const aiR = body.aiGeneratedRatio ?? 20
    if (bankR + aiR !== 100) {
      return json({ success: false, message: '题库比例与AI比例之和必须等于100' }, { status: 400 })
    }
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: activePlan } = await service
    .from('study_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activePlan) {
    return json({ success: false, message: 'No active plan found' }, { status: 404 })
  }

  const profileUpdates: Record<string, unknown> = {}
  if (body.overallTarget !== undefined) profileUpdates.overall_target = body.overallTarget
  if (body.task1Target !== undefined) profileUpdates.task1_target = body.task1Target
  if (body.task2Target !== undefined) profileUpdates.task2_target = body.task2Target
  if (body.examDate !== undefined) profileUpdates.exam_date = body.examDate
  if (body.sessionsPerWeek !== undefined) profileUpdates.sessions_per_week = body.sessionsPerWeek
  if (body.minutesPerSession !== undefined) profileUpdates.minutes_per_session = body.minutesPerSession
  if (body.intensity !== undefined) profileUpdates.intensity = body.intensity
  if (body.allowTimedPractice !== undefined) profileUpdates.allow_timed_practice = body.allowTimedPractice
  if (body.includeFullTests !== undefined) profileUpdates.include_full_tests = body.includeFullTests
  if (body.questionBankRatio !== undefined) profileUpdates.question_bank_ratio = body.questionBankRatio
  if (body.aiGeneratedRatio !== undefined) profileUpdates.ai_generated_ratio = body.aiGeneratedRatio

  if (Object.keys(profileUpdates).length === 0) {
    return json({ success: false, message: 'No changes provided' }, { status: 400 })
  }

  profileUpdates.updated_at = new Date().toISOString()

  const { error: profileError } = await service
    .from('study_plan_profiles')
    .upsert({ user_id: userId, ...profileUpdates }, { onConflict: 'user_id' })

  if (profileError) {
    return json({ success: false, message: profileError.message }, { status: 500 })
  }

  const today = getDateKeyInTimeZone()
  const { count } = await service
    .from('study_plan_tasks')
    .select('id', { count: 'exact' })
    .eq('plan_id', activePlan.id)
    .eq('user_id', userId)
    .in('status', ['pending', 'rescheduled'])
    .gt('scheduled_date', today)

  const affectedCount = count ?? 0

  if (affectedCount > 0 && body.minutesPerSession !== undefined) {
    const newMinutes = body.minutesPerSession
    await service
      .from('study_plan_tasks')
      .update({ estimated_minutes: newMinutes, updated_at: new Date().toISOString() })
      .eq('plan_id', activePlan.id)
      .eq('user_id', userId)
      .in('status', ['pending', 'rescheduled'])
      .gt('scheduled_date', today)
  }

  if (body.examDate !== undefined) {
    const daysUntilExam = body.examDate
      ? Math.ceil((new Date(body.examDate).getTime() - Date.now()) / 86400000)
      : null

    let newPhase = 'foundation'
    if (daysUntilExam !== null) {
      if (daysUntilExam <= 7) newPhase = 'sprint'
      else if (daysUntilExam <= 14) newPhase = 'integrated'
      else if (daysUntilExam <= 28) newPhase = 'focused'
    }

    await service
      .from('study_plans')
      .update({ current_phase: newPhase })
      .eq('id', activePlan.id)
  }

  return json({
    success: true,
    affectedTaskCount: affectedCount
  })
}
