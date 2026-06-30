import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: activeJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, status, progress, current_step, result_plan_id, error_message, created_at, updated_at')
    .eq('user_id', userId)
    .in('status', ['queued', 'analyzing_history', 'building_profile', 'generating_tasks', 'saving'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeJob) {
    return json({ success: true, job: activeJob })
  }

  const { data: recentJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, status, progress, current_step, result_plan_id, error_message, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return json({ success: true, job: recentJob ?? null })
}
