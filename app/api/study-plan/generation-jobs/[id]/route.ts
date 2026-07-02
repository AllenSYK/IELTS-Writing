import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data: job, error } = await service
    .from('study_plan_generation_jobs')
    .select('id, job_type, status, progress, stage, message, current_step, heartbeat_at, result_plan_id, error_code, error_message, attempt_count, created_at, started_at, completed_at, updated_at')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .maybeSingle()

  if (error || !job) {
    return json({ success: false, message: 'Job not found' }, { status: 404 })
  }

  return json({
    success: true,
    job: {
      id: job.id,
      jobType: job.job_type,
      status: job.status,
      progress: job.progress,
      stage: job.stage ?? job.current_step,
      message: job.message ?? job.current_step,
      currentStep: job.current_step,
      heartbeatAt: job.heartbeat_at,
      createdAt: job.created_at,
      resultPlanId: job.result_plan_id,
      errorCode: job.error_code,
      errorMessage: job.error_message,
      attemptCount: job.attempt_count,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      updatedAt: job.updated_at
    }
  })
}
