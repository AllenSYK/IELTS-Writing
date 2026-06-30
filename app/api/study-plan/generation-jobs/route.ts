import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { processGenerationJob } from '@/lib/study-plan-generation'

const CreateJobSchema = z.object({
  overallTarget: z.number().min(5.5).max(9).optional(),
  task1Target: z.number().min(5.5).max(9).optional(),
  task2Target: z.number().min(5.5).max(9).optional(),
  examDate: z.string().nullable().optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  minutesPerSession: z.number().int().min(10).max(120).optional(),
  intensity: z.enum(['relaxed', 'standard', 'intensive']).optional(),
  allowTimedPractice: z.boolean().optional(),
  includeFullTests: z.boolean().optional(),
  currentLevel: z.number().nullable().optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  weaknesses: z.array(z.string()).optional(),
  rewriteFrequency: z.enum(['none', 'weekly_1', 'weekly_2', 'auto_low']).optional(),
  mockFrequency: z.enum(['none', 'biweekly', 'weekly', 'auto_sprint']).optional(),
  useErrorNotebook: z.boolean().optional(),
  adjustmentSensitivity: z.enum(['conservative', 'standard', 'active']).optional()
})

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = CreateJobSchema.parse(await request.json())
  } catch {
    body = {}
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: activeJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['queued', 'analyzing_history', 'building_profile', 'generating_tasks', 'saving'])
    .maybeSingle()

  if (activeJob) {
    return json({ success: true, jobId: activeJob.id, status: activeJob.status, message: '已有生成任务在进行中' }, { status: 200 })
  }

  if (body.overallTarget !== undefined || body.sessionsPerWeek !== undefined || body.examDate !== undefined) {
    const profileUpdates: Record<string, unknown> = { user_id: userId }
    if (body.overallTarget !== undefined) profileUpdates.overall_target = body.overallTarget
    if (body.task1Target !== undefined) profileUpdates.task1_target = body.task1Target
    if (body.task2Target !== undefined) profileUpdates.task2_target = body.task2Target
    if (body.examDate !== undefined) profileUpdates.exam_date = body.examDate
    if (body.sessionsPerWeek !== undefined) profileUpdates.sessions_per_week = body.sessionsPerWeek
    if (body.minutesPerSession !== undefined) profileUpdates.minutes_per_session = body.minutesPerSession
    if (body.intensity !== undefined) profileUpdates.intensity = body.intensity
    if (body.allowTimedPractice !== undefined) profileUpdates.allow_timed_practice = body.allowTimedPractice
    if (body.includeFullTests !== undefined) profileUpdates.include_full_tests = body.includeFullTests
    if (body.currentLevel !== undefined) profileUpdates.current_level = body.currentLevel

    await service
      .from('study_plan_profiles')
      .upsert(profileUpdates, { onConflict: 'user_id' })
  }

  const { data: job, error: jobError } = await service
    .from('study_plan_generation_jobs')
    .insert({
      user_id: userId,
      status: 'queued',
      progress: 0,
      input_data: body
    })
    .select('id, status')
    .single()

  if (jobError || !job) {
    return json({ success: false, message: jobError?.message || 'Failed to create job' }, { status: 500 })
  }

  processGenerationJob(job.id, userId).catch((err) => {
    console.error('[study-plan] Background job failed:', err)
  })

  return json({ success: true, jobId: job.id, status: 'queued' }, { status: 202 })
}
