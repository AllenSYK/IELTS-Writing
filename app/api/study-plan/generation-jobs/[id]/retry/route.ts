import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { processGenerationJob } from '@/lib/study-plan-generation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data: job, error } = await service
    .from('study_plan_generation_jobs')
    .select('id, status, attempt_count')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .maybeSingle()

  if (error || !job) {
    return json({ success: false, message: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'failed' && job.status !== 'cancelled') {
    return json({ success: false, message: 'Can only retry failed or cancelled jobs' }, { status: 400 })
  }

  if ((job.attempt_count as number) >= 3) {
    return json({ success: false, message: 'Maximum retry attempts reached' }, { status: 429 })
  }

  await service
    .from('study_plan_generation_jobs')
    .update({
      status: 'queued',
      progress: 0,
      current_step: null,
      error_message: null,
      error_code: null,
      attempt_count: (job.attempt_count as number) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  processGenerationJob(id, check.user.id).catch((err) => {
    console.error('[study-plan] Retry job failed:', err)
  })

  return json({ success: true, jobId: id, status: 'queued' })
}
