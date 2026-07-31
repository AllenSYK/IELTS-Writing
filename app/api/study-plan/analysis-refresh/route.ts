import { after } from 'next/server'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { processAnalysisRefreshJob } from '@/lib/study-plan-analysis-refresh'

export const maxDuration = 300

export async function POST() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  // Check for existing active job (any type)
  const { data: activeJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, status, job_type')
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeJob) {
    if (activeJob.job_type === 'analysis_refresh') {
      // Already refreshing, return existing job
      return json({
        success: true,
        jobId: activeJob.id,
        status: activeJob.status,
        message: '学习数据正在更新中'
      })
    }
    // Another job (generation/replan) is running
    return json({
      success: false,
      message: '计划生成完成后可更新分析'
    }, { status: 409 })
  }

  // Cooldown: prevent refresh within 2 minutes of last refresh
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data: recentJob } = await service
    .from('study_plan_generation_jobs')
    .select('id, completed_at')
    .eq('user_id', userId)
    .eq('job_type', 'analysis_refresh')
    .eq('status', 'completed')
    .gte('completed_at', twoMinutesAgo)
    .limit(1)
    .maybeSingle()

  if (recentJob) {
    return json({
      success: false,
      message: '刚刚已更新，请稍后再试'
    }, { status: 429 })
  }

  // Check if stale jobs need cleanup
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({ status: 'timed_out', error_code: 'HEARTBEAT_TIMEOUT', failed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'running')
    .lt('heartbeat_at', fifteenMinutesAgo)

  // Create new analysis_refresh job
  const now = new Date().toISOString()
  const { data: job, error } = await service
    .from('study_plan_generation_jobs')
    .insert({
      user_id: userId,
      status: 'queued',
      progress: 0,
      job_type: 'analysis_refresh',
      stage: 'queued',
      message: '正在准备更新学习数据',
      heartbeat_at: now,
      input_data: {}
    })
    .select('id')
    .single()

  if (error || !job) {
    return json({ success: false, message: error?.message || '创建任务失败' }, { status: 500 })
  }

  // Keep the serverless invocation alive after returning the accepted response.
  after(async () => {
    try {
      await processAnalysisRefreshJob(job.id, userId)
    } catch (err) {
      console.error('[analysis-refresh] Background job failed:', err)
    }
  })

  return json({ success: true, jobId: job.id, status: 'queued' }, { status: 202 })
}
