import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  // Try to use the RPC function with built-in timeout detection
  const { data: rpcJobs, error: rpcError } = await service
    .rpc('get_active_generation_job', { p_user_id: userId })

  if (!rpcError && rpcJobs && rpcJobs.length > 0) {
    const job = rpcJobs[0]
    return json({
      success: true,
      job: {
        id: job.id,
        jobType: job.job_type,
        status: job.status,
        progress: job.progress,
        stage: job.stage ?? job.current_step,
        message: job.message ?? job.current_step,
        heartbeatAt: job.heartbeat_at,
        createdAt: job.created_at,
        resultPlanId: job.result_plan_id,
        errorCode: job.error_code,
        errorMessage: job.error_message,
        attemptCount: job.attempt_count,
        startedAt: job.started_at,
        completedAt: job.completed_at
      }
    })
  }

  // Fallback: direct query if RPC not available
  // First, mark stale running jobs as timed_out
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({
      status: 'timed_out',
      error_code: 'GENERATION_HEARTBEAT_TIMEOUT',
      error_message: 'Heartbeat timeout detected on query',
      failed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('status', 'running')
    .not('heartbeat_at', 'is', null)
    .lt('heartbeat_at', fifteenMinutesAgo)

  // Mark queued jobs older than 5 minutes as timed_out
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({
      status: 'timed_out',
      error_code: 'GENERATION_QUEUE_TIMEOUT',
      error_message: 'Job stuck in queue',
      failed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('status', 'queued')
    .is('heartbeat_at', null)
    .lt('created_at', fiveMinutesAgo)

  // Now get the active job
  const { data: activeJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, job_type, status, progress, stage, message, current_step, heartbeat_at, created_at, result_plan_id, error_code, error_message, attempt_count, started_at, completed_at')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeJob) {
    return json({
      success: true,
      job: {
        id: activeJob.id,
        jobType: activeJob.job_type,
        status: activeJob.status,
        progress: activeJob.progress,
        stage: activeJob.stage ?? activeJob.current_step,
        message: activeJob.message ?? activeJob.current_step,
        heartbeatAt: activeJob.heartbeat_at,
        createdAt: activeJob.created_at,
        resultPlanId: activeJob.result_plan_id,
        errorCode: activeJob.error_code,
        errorMessage: activeJob.error_message,
        attemptCount: activeJob.attempt_count,
        startedAt: activeJob.started_at,
        completedAt: activeJob.completed_at
      }
    })
  }

  // No active job, return most recent
  const { data: recentJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, job_type, status, progress, stage, message, current_step, heartbeat_at, created_at, result_plan_id, error_code, error_message, attempt_count, started_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return json({
    success: true,
    job: recentJob ? {
      id: recentJob.id,
      jobType: recentJob.job_type,
      status: recentJob.status,
      progress: recentJob.progress,
      stage: recentJob.stage ?? recentJob.current_step,
      message: recentJob.message ?? recentJob.current_step,
      heartbeatAt: recentJob.heartbeat_at,
      createdAt: recentJob.created_at,
      resultPlanId: recentJob.result_plan_id,
      errorCode: recentJob.error_code,
      errorMessage: recentJob.error_message,
      attemptCount: recentJob.attempt_count,
      startedAt: recentJob.started_at,
      completedAt: recentJob.completed_at
    } : null
  })
}
