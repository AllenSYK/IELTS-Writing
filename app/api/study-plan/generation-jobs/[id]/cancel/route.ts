import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()

  const { data: job, error } = await service
    .from('study_plan_generation_jobs')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', check.user.id)
    .maybeSingle()

  if (error || !job) {
    return json({ success: false, message: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'completed') {
    return json({ success: false, message: 'Cannot cancel completed job' }, { status: 400 })
  }

  await service
    .from('study_plan_generation_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)

  return json({ success: true, status: 'cancelled' })
}
