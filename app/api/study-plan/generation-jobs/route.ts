import { after } from 'next/server'
import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { processGenerationJob } from '@/lib/study-plan-generation'
import { studyPlanAdjustmentMonthRange } from '@/lib/study-plan-adjustments'

export const maxDuration = 300

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
  adjustmentSensitivity: z.enum(['conservative', 'standard', 'active']).optional(),
  questionBankRatio: z.number().int().min(0).max(100).optional(),
  aiGeneratedRatio: z.number().int().min(0).max(100).optional(),
  sourcePlanId: z.string().uuid().optional()
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
  const jobType = body.sourcePlanId ? 'replan' : 'initial_generation'

  // Check for existing active job (deduplication)
  const { data: activeJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, status, progress, current_step, heartbeat_at, created_at')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeJob) {
    // Check if the active job is actually stale (heartbeat > 15 min)
    const heartbeat = activeJob.heartbeat_at ? new Date(activeJob.heartbeat_at).getTime() : 0
    const isStale = activeJob.status === 'running' && heartbeat > 0 && (Date.now() - heartbeat) > 15 * 60 * 1000
    const isQueuedTooLong = activeJob.status === 'queued' && (Date.now() - new Date(activeJob.created_at).getTime()) > 5 * 60 * 1000

    if (!isStale && !isQueuedTooLong) {
      // Active job is still valid, return it
      return json({
        success: true,
        jobId: activeJob.id,
        status: activeJob.status,
        progress: activeJob.progress,
        currentStep: activeJob.current_step,
        message: '已有生成任务在进行中'
      }, { status: 200 })
    }

    // Mark stale job as timed_out
    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'timed_out',
        error_code: isStale ? 'GENERATION_HEARTBEAT_TIMEOUT' : 'GENERATION_QUEUE_TIMEOUT',
        error_message: isStale ? 'Heartbeat timeout' : 'Queue timeout',
        failed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', activeJob.id)
  }

  if (jobType === 'replan') {
    const adjustmentMonth = studyPlanAdjustmentMonthRange()
    const { count, error: quotaError } = await service
      .from('study_plan_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('job_type', 'replan')
      .in('status', ['queued', 'running', 'completed'])
      .gte('created_at', adjustmentMonth.startsAt)
      .lt('created_at', adjustmentMonth.endsAt)

    if (quotaError) {
      return json({ success: false, message: '暂时无法读取本月调整次数，请稍后重试' }, { status: 500 })
    }
    if ((count ?? 0) >= adjustmentMonth.limit) {
      return json({
        success: false,
        code: 'STUDY_PLAN_MONTHLY_ADJUSTMENT_LIMIT',
        message: '本月 3 次学习计划调整机会已用完，下个月将自动恢复。'
      }, { status: 429 })
    }
  }

  // Update profile if needed
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
    if (body.questionBankRatio !== undefined) profileUpdates.question_bank_ratio = body.questionBankRatio
    if (body.aiGeneratedRatio !== undefined) profileUpdates.ai_generated_ratio = body.aiGeneratedRatio

    await service
      .from('study_plan_profiles')
      .upsert(profileUpdates, { onConflict: 'user_id' })
  }

  // Create new job
  const now = new Date().toISOString()
  const { data: job, error: jobError } = await service
    .from('study_plan_generation_jobs')
    .insert({
      user_id: userId,
      status: 'queued',
      progress: 0,
      job_type: jobType,
      source_plan_id: body.sourcePlanId ?? null,
      input_data: body,
      heartbeat_at: now,
      stage: 'queued',
      message: '任务已创建，等待处理'
    })
    .select('id, status')
    .single()

  if (jobError || !job) {
    if (jobError?.message?.includes('STUDY_PLAN_MONTHLY_ADJUSTMENT_LIMIT')) {
      return json({
        success: false,
        code: 'STUDY_PLAN_MONTHLY_ADJUSTMENT_LIMIT',
        message: '本月 3 次学习计划调整机会已用完，下个月将自动恢复。'
      }, { status: 429 })
    }
    return json({ success: false, message: jobError?.message || 'Failed to create job' }, { status: 500 })
  }

  console.log(JSON.stringify({
    event: 'STUDY_PLAN_JOB_CREATED',
    jobId: job.id,
    jobType,
    userId: userId.slice(0, 8),
    timestamp: now
  }))

  // Keep the serverless invocation alive after returning the accepted response.
  after(async () => {
    try {
      await processGenerationJob(job.id, userId)
    } catch (err) {
      console.error('[study-plan] Background job failed:', err)
    }
  })

  return json({ success: true, jobId: job.id, status: 'queued' }, { status: 202 })
}
