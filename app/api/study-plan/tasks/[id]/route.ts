import { after } from 'next/server'
import { refreshRollingPlan } from '@/lib/study-plan/rolling'
import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { loadFullWritingRecordsForUser } from '@/lib/server-writing-records'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'

export const maxDuration = 300

const PatchSchema = z.object({
  status: z.enum(['in_progress', 'skipped']).optional(),
  writingRecordId: z.string().uuid().optional(),
  exerciseResponse: z.string().trim().min(8).max(4000).optional()
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const { id } = await params
  let body
  try {
    body = PatchSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  if (body.writingRecordId && body.status === undefined) {
    const { data: record, error: recordError } = await service
      .from('writing_records')
      .select('id')
      .eq('id', body.writingRecordId)
      .eq('user_id', userId)
      .maybeSingle()

    if (recordError || !record) {
      return json({ success: false, message: 'Writing record not found' }, { status: 404 })
    }

    const { data: existingTask } = await service
      .from('study_plan_tasks')
      .select('id, writing_record_id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (!existingTask) {
      return json({ success: false, message: 'Task not found' }, { status: 404 })
    }

    if (existingTask.writing_record_id && existingTask.writing_record_id !== body.writingRecordId) {
      return json({ success: false, message: 'Task already completed with a different record' }, { status: 409 })
    }

    if (existingTask.status === 'completed' && existingTask.writing_record_id === body.writingRecordId) {
      return json({ success: true, result: { taskId: id, status: 'completed', idempotent: true } })
    }

    const authenticated = await createSupabaseServerClient()
    const { data, error } = await authenticated
      .rpc('complete_study_plan_task', { p_task_id: id, p_writing_record_id: body.writingRecordId })
      .single()

    if (error) {
      const msg = error.message || ''
      if (msg.includes('STUDY_PLAN_TASK_NOT_FOUND')) {
        return json({ success: false, message: 'Task not found' }, { status: 404 })
      }
      if (msg.includes('STUDY_PLAN_TASK_ALREADY_LINKED')) {
        return json({ success: false, message: 'Task already completed with a different record' }, { status: 409 })
      }
      if (msg.includes('STUDY_PLAN_TASK_INVALID_STATE')) {
        return json({ success: false, message: 'Task cannot be completed in current state' }, { status: 409 })
      }
      if (msg.includes('STUDY_PLAN_ACCESS_DENIED')) {
        return json({ success: false, message: 'Access denied' }, { status: 403 })
      }
      return json({ success: false, message: error.message }, { status: 500 })
    }

    after(async () => {
      const adapted = await refreshRollingPlan(service, userId, 'completion').catch(error => {
        console.error('Study plan adaptation failed', error)
        return false
      })
      if (!adapted) await updateAbilityProfile(service, userId)
    })

    return json({ success: true, result: data })
  }

  if (body.exerciseResponse && !body.status && !body.writingRecordId) {
    const result = await service.from('study_plan_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString(), exercise_response: body.exerciseResponse })
      .eq('id', id).eq('user_id', userId)
      .in('task_type', ['grammar_drill', 'vocabulary_drill', 'review']).in('status', ['pending', 'in_progress'])
      .select('id').maybeSingle()
    if (result.error || !result.data) return json({ success: false, message: '练习不可提交' }, { status: 409 })
    after(() => refreshRollingPlan(service, userId, 'completion').catch(error => {
      console.error('Study plan adaptation failed', error)
    }))
    return json({ success: true })
  }

  const updates: Record<string, unknown> = {}
  if (body.status) {
    updates.status = body.status
    if (body.status === 'in_progress') updates.started_at = new Date().toISOString()
  }
  if (body.writingRecordId) updates.writing_record_id = body.writingRecordId

  const { error } = await service
    .from('study_plan_tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}

async function updateAbilityProfile(service: ReturnType<typeof createSupabaseServiceRoleClient>, userId: string) {
  try {
    const records = await loadFullWritingRecordsForUser(service, userId).catch(() => [])
    if (records.length === 0) return

    const diagnosis = buildStudyPlanDiagnosis(records)

    await service
      .from('study_plan_profiles')
      .upsert({
        user_id: userId,
        current_level: diagnosis.currentAverage,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    const { data: activePlan } = await service
      .from('study_plans')
      .select('id, diagnosis')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('adaptive_through', null)
      .maybeSingle()

    if (activePlan) {
      await service
        .from('study_plans')
        .update({ diagnosis: diagnosis as unknown as Record<string, unknown> })
        .eq('id', activePlan.id)
    }
  } catch { /* best-effort */ }
}
