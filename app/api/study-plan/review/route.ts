import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: activePlan } = await service
    .from('study_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activePlan) return json({ success: true, review: null })

  const today = getDateKeyInTimeZone()
  const weekStart = addDaysToDateKey(today, -6)

  const { data: tasks } = await service
    .from('study_plan_tasks')
    .select('id, status, task_type, scheduled_date, completed_at, writing_record_id, estimated_minutes, focus_criteria')
    .eq('plan_id', activePlan.id)
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', today)

  if (!tasks || tasks.length === 0) {
    return json({ success: true, review: null })
  }

  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.status === 'completed').length
  const skippedTasks = tasks.filter((t) => t.status === 'skipped').length
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const completedWithRecords = tasks.filter((t) => t.status === 'completed' && t.writing_record_id)
  let averageBand: number | null = null
  let task1Band: number | null = null
  let task2Band: number | null = null

  if (completedWithRecords.length > 0) {
    const recordIds = completedWithRecords.map((t) => t.writing_record_id)
    const { data: records } = await service
      .from('writing_records')
      .select('id, task_type, evaluation, record_data')
      .in('id', recordIds)

    if (records && records.length > 0) {
      const bands: number[] = []
      const task1Bands: number[] = []
      const task2Bands: number[] = []

      for (const record of records) {
        const ev = (record.record_data as Record<string, unknown>)?.evaluation ?? record.evaluation
        const evaluation = ev as Record<string, unknown>
        const band = parseFloat((evaluation.overallBand || evaluation.bandEstimate) as string)
        if (Number.isFinite(band)) {
          bands.push(band)
          if (record.task_type === 'task1') task1Bands.push(band)
          if (record.task_type === 'task2') task2Bands.push(band)
        }
      }

      const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null
      averageBand = avg(bands)
      task1Band = avg(task1Bands)
      task2Band = avg(task2Bands)
    }
  }

  const summary = buildReviewSummary(completionRate, averageBand, completedTasks, skippedTasks)

  return json({
    success: true,
    review: {
      weekStart,
      weekEnd: today,
      completionRate,
      totalTasks,
      completedTasks,
      skippedTasks,
      averageBand,
      task1Band,
      task2Band,
      summary
    }
  })
}

function buildReviewSummary(completionRate: number, averageBand: number | null, completed: number, skipped: number): string {
  const parts: string[] = []

  parts.push(`本周完成率为 ${completionRate}%，共完成 ${completed} 个任务。`)

  if (averageBand !== null) {
    parts.push(`平均分 ${averageBand.toFixed(1)}。`)
  }

  if (skipped > 0) {
    parts.push(`跳过 ${skipped} 个任务。`)
  }

  if (completionRate >= 80) {
    parts.push('表现优秀，下周可适当增加专项训练。')
  } else if (completionRate >= 50) {
    parts.push('保持当前节奏，下周继续加油。')
  } else {
    parts.push('下周将适当减少任务量，确保可持续学习。')
  }

  return parts.join('')
}
