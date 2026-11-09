import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadFullWritingRecordsForUser } from '@/lib/server-writing-records'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'
import { allocateTraining } from '@/lib/study-plan/allocator'
import { materializeTraining } from '@/lib/study-plan/materialize'
import { adaptiveProfileColumns, plannerConfig } from '@/lib/study-plan/config'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out'

const STAGE_PROGRESS: Record<string, { progress: number; stage: string; message: string }> = {
  queued: { progress: 0, stage: 'queued', message: '任务已创建，等待处理' },
  loading_profile: { progress: 10, stage: 'loading_profile', message: '正在读取你的学习偏好' },
  loading_history: { progress: 20, stage: 'loading_history', message: '正在加载历史写作记录' },
  analyzing_weaknesses: { progress: 30, stage: 'analyzing_weaknesses', message: '正在分析 Task 1 与 Task 2 强弱项' },
  building_schedule: { progress: 45, stage: 'building_schedule', message: '正在计算适合你的训练比例' },
  selecting_questions: { progress: 60, stage: 'selecting_questions', message: '正在从题库中选题' },
  generating_ai_items: { progress: 75, stage: 'generating_ai_items', message: '正在生成个性化任务' },
  saving_plan: { progress: 90, stage: 'saving_plan', message: '正在保存学习计划' },
  finalizing: { progress: 97, stage: 'finalizing', message: '即将完成' }
}

async function updateJob(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  updates: {
    status?: JobStatus
    progress?: number
    current_step?: string
    stage?: string
    message?: string
    error_message?: string
    error_code?: string
    result_plan_id?: string
    started_at?: string
    completed_at?: string
    failed_at?: string
  }
) {
  const now = new Date().toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({ ...updates, updated_at: now, heartbeat_at: now })
    .eq('id', jobId)
    .eq('status', 'running')
}

async function updateStage(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  stageKey: string
) {
  const config = STAGE_PROGRESS[stageKey]
  if (!config) return
  await updateJob(service, jobId, {
    status: 'running',
    progress: config.progress,
    current_step: config.message,
    stage: config.stage,
    message: config.message
  })
  console.log(JSON.stringify({
    event: 'STUDY_PLAN_JOB_STAGE_CHANGED',
    jobId,
    stage: config.stage,
    progress: config.progress,
    timestamp: new Date().toISOString()
  }))
}

async function heartbeat(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string
) {
  await service
    .from('study_plan_generation_jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'running')
}

export async function processGenerationJob(jobId: string, userId: string) {
  const service = createSupabaseServiceRoleClient()

  const { data: job } = await service
    .from('study_plan_generation_jobs')
    .select('id, user_id, status, progress, job_type, input_data, started_at, heartbeat_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!job || job.status !== 'queued') return

  const claim = await service.from('study_plan_generation_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId).eq('user_id', userId).eq('status', 'queued')
    .select('id').maybeSingle()
  if (claim.error || !claim.data) return

  console.log(JSON.stringify({
    event: 'STUDY_PLAN_JOB_STARTED',
    jobId,
    jobType: job.job_type,
    userId: userId.slice(0, 8),
    timestamp: new Date().toISOString()
  }))

  const startedAt = Date.now()

  const heartbeatInterval = setInterval(() => {
    heartbeat(service, jobId).catch(() => {})
  }, 20_000)

  try {
    // Start
    await updateJob(service, jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: 5,
      stage: 'loading_profile',
      message: '正在读取你的学习偏好'
    })

    // Load profile
    await updateStage(service, jobId, 'loading_profile')
    const { data: profile, error: profileError } = await service
      .from('study_plan_profiles')
      .select(adaptiveProfileColumns)
      .eq('user_id', userId)
      .maybeSingle()

    // Load history
    await updateStage(service, jobId, 'loading_history')
    if (profileError) throw profileError
    const records = await loadFullWritingRecordsForUser(service, userId)

    // Analyze weaknesses
    await updateStage(service, jobId, 'analyzing_weaknesses')
    const diagnosis = buildStudyPlanDiagnosis(records)
    await heartbeat(service, jobId)

    // Build schedule
    await updateStage(service, jobId, 'building_schedule')
    const input = (job.input_data ?? {}) as Record<string, unknown>
    const { preferences, goals } = plannerConfig(profile, input, true)
    const today = getDateKeyInTimeZone(new Date(), preferences.timezone)
    if (goals.examDate && goals.examDate < today) throw new Error('EXAM_DATE_PASSED')
    const periodEnd = goals.examDate ?? addDaysToDateKey(today, 27)
    const weekEnd = addDaysToDateKey(today, 6)
    const through = periodEnd < weekEnd ? periodEnd : weekEnd
    const draft = allocateTraining({ start: today, end: through, preferences, goals, diagnosis })

    await updateStage(service, jobId, 'selecting_questions')
    const tasks = await materializeTraining(service, userId, draft, diagnosis, preferences, records)
    await heartbeat(service, jobId)

    // Save plan
    await updateStage(service, jobId, 'saving_plan')

    const { data: rpcResult, error: rpcError } = await service
      .rpc('save_adaptive_study_plan', {
        p_job_id: jobId,
        p_user_id: userId,
        p_period_start: today,
        p_period_end: periodEnd,
        p_diagnosis: diagnosis as unknown as Record<string, unknown>,
        p_preferences: preferences as unknown as Record<string, unknown>,
        p_goals: goals as unknown as Record<string, unknown>,
        p_through: through,
        p_tasks: tasks
      })
      .single()

    if (rpcError) {
      const msg = rpcError.message || ''
      if (msg.includes('JOB_NOT_FOUND')) throw new Error('JOB_NOT_FOUND')
      if (msg.includes('JOB_INVALID_STATE')) throw new Error('JOB_INVALID_STATE')
      throw new Error(`PLAN_SAVE_FAILED: ${msg}`)
    }

    const planId = (rpcResult as unknown as Record<string, unknown>)?.planId as string

    const duration = Math.round((Date.now() - startedAt) / 1000)
    console.log(JSON.stringify({
      event: 'STUDY_PLAN_JOB_COMPLETED',
      jobId,
      duration,
      planId,
      timestamp: new Date().toISOString()
    }))

    clearInterval(heartbeatInterval)
  } catch (err) {
    clearInterval(heartbeatInterval)
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    const errorCode = errorMsg.includes('JOB_NOT_FOUND') ? 'JOB_NOT_FOUND'
      : errorMsg.includes('JOB_INVALID_STATE') ? 'JOB_INVALID_STATE'
      : errorMsg.includes('PLAN_SAVE_FAILED') ? 'PLAN_SAVE_FAILED'
      : 'DATABASE_ERROR'

    const duration = Math.round((Date.now() - startedAt) / 1000)
    console.log(JSON.stringify({
      event: 'STUDY_PLAN_JOB_FAILED',
      jobId,
      errorCode,
      duration,
      timestamp: new Date().toISOString()
    }))

    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg.slice(0, 500),
        error_code: errorCode,
        failed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}
