import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'
import type { WritingRecord } from '@/lib/writing-record-types'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timed_out'

const STAGE_PROGRESS: Record<string, { progress: number; message: string }> = {
  loading_records: { progress: 10, message: '正在加载写作记录' },
  calculating_counts: { progress: 25, message: '正在统计篇数' },
  calculating_scores: { progress: 40, message: '正在计算分数' },
  analyzing_errors: { progress: 55, message: '正在分析错误模式' },
  updating_weaknesses: { progress: 70, message: '正在更新薄弱项' },
  saving_analysis: { progress: 90, message: '正在保存分析结果' },
  completed: { progress: 100, message: '分析完成' }
}

async function updateJob(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  updates: Record<string, unknown>
) {
  const now = new Date().toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({ ...updates, updated_at: now, heartbeat_at: now })
    .eq('id', jobId)
}

async function setStage(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  stage: string
) {
  const config = STAGE_PROGRESS[stage]
  if (!config) return
  await updateJob(service, jobId, {
    status: 'running',
    progress: config.progress,
    stage,
    message: config.message,
    current_step: config.message
  })
}

export async function processAnalysisRefreshJob(jobId: string, userId: string) {
  const service = createSupabaseServiceRoleClient()

  const { data: job } = await service
    .from('study_plan_generation_jobs')
    .select('id, user_id, status, progress, job_type, started_at, heartbeat_at')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!job || job.status === 'cancelled' || job.status === 'completed' || job.status === 'timed_out') return

  await updateJob(service, jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
    stage: 'loading_records',
    message: '正在加载写作记录'
  })

  try {
    // Step 1: Load records
    await setStage(service, jobId, 'loading_records')
    const records = await loadWritingRecordsFromServer(userId).catch(() => [])
    await heartbeat(service, jobId)

    // Step 2: Calculate counts
    await setStage(service, jobId, 'calculating_counts')
    const counts = calculateCounts(records)
    await heartbeat(service, jobId)

    // Step 3: Calculate scores
    await setStage(service, jobId, 'calculating_scores')
    const scores = calculateScores(records)
    await heartbeat(service, jobId)

    // Step 4: Build diagnosis (reuses existing logic)
    await setStage(service, jobId, 'analyzing_errors')
    const diagnosis = buildStudyPlanDiagnosis(records)
    await heartbeat(service, jobId)

    // Step 5: Build analysis snapshot
    await setStage(service, jobId, 'updating_weaknesses')
    const analysisSnapshot = {
      counts,
      scores,
      diagnosis: {
        currentAverage: diagnosis.currentAverage,
        task1Average: diagnosis.task1Average,
        task2Average: diagnosis.task2Average,
        taTr: diagnosis.taTr,
        cc: diagnosis.cc,
        lr: diagnosis.lr,
        gra: diagnosis.gra,
        strongestCriteria: diagnosis.strongestCriteria,
        weakestCriteria: diagnosis.weakestCriteria,
        priorityErrorTags: diagnosis.priorityErrorTags,
        dataSufficiency: diagnosis.dataSufficiency,
        profileConfidence: diagnosis.profileConfidence,
        task1SubtypePerformance: diagnosis.task1SubtypePerformance,
        task2SubtypePerformance: diagnosis.task2SubtypePerformance
      },
      updatedAt: new Date().toISOString()
    }
    await heartbeat(service, jobId)

    // Step 6: Save to profile
    await setStage(service, jobId, 'saving_analysis')
    const latestRecordAt = records.length > 0
      ? records.reduce((latest, r) => {
          const t = new Date(r.submittedAt || 0).getTime()
          return t > latest ? t : latest
        }, 0)
      : null

    await service
      .from('study_plan_profiles')
      .update({
        analysis_snapshot: analysisSnapshot,
        analysis_updated_at: new Date().toISOString(),
        analysis_source_record_count: records.length,
        analysis_latest_record_at: latestRecordAt ? new Date(latestRecordAt).toISOString() : null,
        analysis_refresh_job_id: jobId
      })
      .eq('user_id', userId)

    // Step 7: Mark completed
    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        stage: 'completed',
        message: '分析完成',
        current_step: '分析完成',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
      })
      .eq('id', jobId)

    console.log(JSON.stringify({
      event: 'ANALYSIS_REFRESH_COMPLETED',
      jobId,
      recordCount: records.length,
      timestamp: new Date().toISOString()
    }))

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(JSON.stringify({
      event: 'ANALYSIS_REFRESH_FAILED',
      jobId,
      error: errorMsg,
      timestamp: new Date().toISOString()
    }))

    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg.slice(0, 500),
        error_code: 'ANALYSIS_REFRESH_ERROR',
        failed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function heartbeat(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string
) {
  await service
    .from('study_plan_generation_jobs')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', jobId)
}

function calculateCounts(records: WritingRecord[]) {
  const submitted = records.filter(r => r.submittedAt && r.evaluation)
  const task1 = submitted.filter(r => r.taskType === 'task1')
  const task2 = submitted.filter(r => r.taskType === 'task2')
  const mock = submitted.filter(r => r.taskType === 'mock')

  const now = Date.now()
  const last7 = submitted.filter(r => {
    const t = new Date(r.submittedAt).getTime()
    return (now - t) < 7 * 86400000
  })
  const last30 = submitted.filter(r => {
    const t = new Date(r.submittedAt).getTime()
    return (now - t) < 30 * 86400000
  })

  return {
    total: submitted.length,
    task1: task1.length,
    task2: task2.length,
    fullTests: mock.length,
    last7Days: last7.length,
    last30Days: last30.length
  }
}

function calculateScores(records: WritingRecord[]) {
  const submitted = records.filter(r => r.submittedAt && r.evaluation)
  const getBand = (r: WritingRecord): number | null => {
    const n = parseFloat(r.evaluation?.overallBand || r.evaluation?.bandEstimate)
    return Number.isFinite(n) ? n : null
  }

  const allBands = submitted.map(getBand).filter((n): n is number => n !== null)
  const task1Bands = submitted.filter(r => r.taskType === 'task1').map(getBand).filter((n): n is number => n !== null)
  const task2Bands = submitted.filter(r => r.taskType === 'task2').map(getBand).filter((n): n is number => n !== null)

  const recent5 = allBands.slice(0, 5)
  const recent10 = allBands.slice(0, 10)

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null
  const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null
  const latest = allBands.length > 0 ? allBands[0] : null

  // Trend: compare recent 5 to previous 5
  const prev5 = allBands.slice(5, 10)
  const recent5Avg = avg(recent5)
  const prev5Avg = avg(prev5)
  let trend: 'rising' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data'
  if (recent5Avg !== null && prev5Avg !== null) {
    const diff = recent5Avg - prev5Avg
    if (diff >= 0.3) trend = 'rising'
    else if (diff <= -0.3) trend = 'declining'
    else trend = 'stable'
  }

  return {
    overall: avg(allBands),
    recent5: recent5Avg,
    recent10: avg(recent10),
    task1: avg(task1Bands),
    task2: avg(task2Bands),
    highest: max(allBands),
    latest,
    trend
  }
}

export function shouldSuggestReplan(
  previous: Record<string, unknown> | null | undefined,
  refreshed: Record<string, unknown>
): { suggestReplan: boolean; reasons: string[] } {
  if (!previous) return { suggestReplan: false, reasons: [] }

  const reasons: string[] = []

  const prevCounts = previous.counts as Record<string, number> | undefined
  const newCounts = refreshed.counts as Record<string, number> | undefined
  if (prevCounts && newCounts) {
    const newEssays = (newCounts.total ?? 0) - (prevCounts.total ?? 0)
    if (newEssays >= 3) reasons.push(`新增了 ${newEssays} 篇已批改作文`)
  }

  const prevScores = previous.scores as Record<string, number | null> | undefined
  const newScores = refreshed.scores as Record<string, number | null> | undefined
  if (prevScores && newScores) {
    const prevAvg = prevScores.overall ?? 0
    const newAvg = newScores.overall ?? 0
    if (Math.abs(newAvg - prevAvg) >= 0.5) {
      reasons.push(`总体平均分从 ${prevAvg.toFixed(1)} 变为 ${newAvg.toFixed(1)}`)
    }
    const prevT1 = prevScores.task1 ?? 0
    const newT1 = newScores.task1 ?? 0
    if (Math.abs(newT1 - prevT1) >= 0.5) {
      reasons.push(`Task 1 平均分变化 ${Math.abs(newT1 - prevT1).toFixed(1)}`)
    }
    const prevT2 = prevScores.task2 ?? 0
    const newT2 = newScores.task2 ?? 0
    if (Math.abs(newT2 - prevT2) >= 0.5) {
      reasons.push(`Task 2 平均分变化 ${Math.abs(newT2 - prevT2).toFixed(1)}`)
    }
  }

  const prevDiag = previous.diagnosis as Record<string, unknown> | undefined
  const newDiag = refreshed.diagnosis as Record<string, unknown> | undefined
  if (prevDiag && newDiag) {
    const prevWeak = (prevDiag.weakestCriteria as string[]) ?? []
    const newWeak = (newDiag.weakestCriteria as string[]) ?? []
    if (prevWeak[0] !== newWeak[0]) {
      reasons.push('最薄弱评分维度发生变化')
    }
  }

  const prevTime = previous.updatedAt as string | undefined
  if (prevTime) {
    const daysSince = (Date.now() - new Date(prevTime).getTime()) / 86400000
    if (daysSince >= 14) reasons.push('距上次分析已超过两周')
  }

  return {
    suggestReplan: reasons.length >= 2,
    reasons
  }
}
