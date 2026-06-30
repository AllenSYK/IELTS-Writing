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
    .select('id, status, progress, current_step, result_plan_id, error_message, error_code, attempt_count, created_at, updated_at, started_at, completed_at')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .maybeSingle()

  if (error || !job) {
    return json({ success: false, message: 'Job not found' }, { status: 404 })
  }

  return json({ success: true, job })
}
