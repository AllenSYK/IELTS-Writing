import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getAiConfig, AiProviderError } from '@/lib/ai-provider'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'

type JobStatus = 'queued' | 'analyzing_history' | 'building_profile' | 'generating_tasks' | 'saving' | 'completed' | 'failed' | 'cancelled'

async function updateJob(service: ReturnType<typeof createSupabaseServiceRoleClient>, jobId: string, updates: { status?: JobStatus; progress?: number; current_step?: string; error_message?: string; error_code?: string; result_plan_id?: string }) {
  await service
    .from('study_plan_generation_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function processGenerationJob(jobId: string, userId: string) {
  const service = createSupabaseServiceRoleClient()

  const { data: job } = await service
    .from('study_plan_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!job || job.status === 'cancelled' || job.status === 'completed') return

  await service
    .from('study_plan_generation_jobs')
    .update({ started_at: new Date().toISOString(), status: 'analyzing_history', progress: 5, current_step: '正在读取你的历史写作表现' })
    .eq('id', jobId)

  try {
    const records = await loadWritingRecordsFromServer(userId).catch(() => [])
    await updateJob(service, jobId, { status: 'analyzing_history', progress: 15, current_step: '正在分析 Task 1 与 Task 2 强弱项' })

    const diagnosis = buildStudyPlanDiagnosis(records)

    await updateJob(service, jobId, { status: 'building_profile', progress: 30, current_step: '正在计算适合你的训练比例' })

    const { data: profile } = await service
      .from('study_plan_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const input = (job.input_data ?? {}) as Record<string, unknown>
    const preferences = {
      sessionsPerWeek: profile?.sessions_per_week ?? (input.sessionsPerWeek as number) ?? 4,
      minutesPerSession: profile?.minutes_per_session ?? (input.minutesPerSession as number) ?? 45,
      includeFullTests: profile?.include_full_tests ?? (input.includeFullTests as boolean) ?? true,
      intensity: profile?.intensity ?? (input.intensity as string) ?? 'standard',
      allowTimedPractice: profile?.allow_timed_practice ?? (input.allowTimedPractice as boolean) ?? true,
      preferredDays: (input.preferredDays as number[]) ?? [],
      weaknesses: (input.weaknesses as string[]) ?? [],
      rewriteFrequency: (input.rewriteFrequency as string) ?? 'auto_low',
      mockFrequency: (input.mockFrequency as string) ?? 'auto_sprint',
      useErrorNotebook: (input.useErrorNotebook as boolean) ?? true,
      adjustmentSensitivity: (input.adjustmentSensitivity as string) ?? 'standard'
    }
    const goals = {
      overallTarget: profile?.overall_target ?? (input.overallTarget as number) ?? 6.5,
      task1Target: profile?.task1_target ?? (input.task1Target as number) ?? 6.0,
      task2Target: profile?.task2_target ?? (input.task2Target as number) ?? 6.5,
      examDate: profile?.exam_date ?? (input.examDate as string) ?? undefined
    }

    await updateJob(service, jobId, { status: 'generating_tasks', progress: 45, current_step: '正在安排未来 7 天任务' })

    let tasks: Array<Record<string, unknown>> = []

    try {
      const aiConfig = getAiConfig({ modelEnv: 'QWEN_STUDY_PLAN_MODEL', defaultModel: 'qwen3.5-plus' })
      tasks = await generatePlanWithAI(aiConfig, { diagnosis, preferences, goals, records: records.slice(0, 10) })
    } catch {
      tasks = buildFallbackTasks(preferences, goals, diagnosis)
    }

    if (tasks.length === 0) {
      tasks = buildFallbackTasks(preferences, goals, diagnosis)
    }

    await updateJob(service, jobId, { status: 'generating_tasks', progress: 75, current_step: '正在生成任务说明' })

    const today = getDateKeyInTimeZone()
    const periodEnd = addDaysToDateKey(today, 7)

    await updateJob(service, jobId, { status: 'saving', progress: 90, current_step: '正在保存学习计划' })

    const { data: rpcResult, error: rpcError } = await service
      .rpc('save_generated_study_plan', {
        p_job_id: jobId,
        p_user_id: userId,
        p_period_start: today,
        p_period_end: periodEnd,
        p_diagnosis: diagnosis as unknown as Record<string, unknown>,
        p_preferences: preferences as unknown as Record<string, unknown>,
        p_goals: goals as unknown as Record<string, unknown>,
        p_ai_model: 'background_job',
        p_tasks: tasks
      })
      .single()

    if (rpcError) {
      const msg = rpcError.message || ''
      if (msg.includes('JOB_NOT_FOUND')) throw new Error('JOB_NOT_FOUND')
      if (msg.includes('JOB_INVALID_STATE')) throw new Error('JOB_INVALID_STATE')
      throw new Error(`PLAN_SAVE_FAILED: ${msg}`)
    }

    const planId = (rpcResult as unknown as Record<string, unknown>)?.planId as string

    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: '完成',
        result_plan_id: planId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)

    try {
      const { balance } = await ensureWallet(service, userId)
      await service
        .from('study_plan_adjustment_wallets')
        .update({ balance: balance + 3, lifetime_earned: balance + 3, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      await service
        .from('study_plan_adjustment_transactions')
        .insert({
          user_id: userId,
          type: 'bonus',
          amount: 3,
          reason: 'plan_created',
          idempotency_key: `plan_created_${userId}`,
          balance_after: balance + 3
        })
    } catch {
      // wallet bonus is best-effort
    }

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    const errorCode = errorMsg.includes('JOB_NOT_FOUND') ? 'JOB_NOT_FOUND'
      : errorMsg.includes('JOB_INVALID_STATE') ? 'JOB_INVALID_STATE'
      : errorMsg.includes('PLAN_SAVE_FAILED') ? 'PLAN_SAVE_FAILED'
      : errorMsg.includes('AiProviderError') ? 'AI_ERROR'
      : 'DATABASE_ERROR'

    console.error(`[study-plan] Job ${jobId} failed at step:`, errorMsg)

    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg.slice(0, 500),
        error_code: errorCode,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
  }
}

async function ensureWallet(service: ReturnType<typeof createSupabaseServiceRoleClient>, userId: string) {
  const { data } = await service
    .from('study_plan_adjustment_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (data) return { balance: data.balance as number }

  await service
    .from('study_plan_adjustment_wallets')
    .insert({ user_id: userId, balance: 0, lifetime_earned: 0, lifetime_spent: 0 })

  return { balance: 0 }
}

async function generatePlanWithAI(
  config: { apiKey: string; baseUrl: string; model: string },
  input: { diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>; preferences: Record<string, unknown>; goals: Record<string, unknown>; records: unknown[] }
): Promise<Array<Record<string, unknown>>> {
  const summary = input.records.slice(0, 10).map((r: unknown) => {
    const rec = r as Record<string, unknown>
    const ev = (rec.evaluation ?? {}) as Record<string, unknown>
    return {
      taskType: rec.taskType,
      overallBand: ev.overallBand ?? ev.bandEstimate,
      criteria: ev.criteria,
      submittedAt: rec.submittedAt
    }
  })

  const systemPrompt = `You are an IELTS study plan generator. Return a JSON object with a "tasks" array of 5-10 study tasks for one week.
Each task: scheduledDate (YYYY-MM-DD), taskType (task1|task2|full_test|grammar_drill|vocabulary_drill|review|error_review|timed_practice), source (built_in|weakness_drill|review), title (Chinese max 30), description (Chinese max 100), focusCriteria (string[]), focusErrorTags (string[]), estimatedMinutes (10-90), difficulty (easy|medium|hard), priority (1-3), generatedReason (Chinese max 50), writingMode (task1|task2|null). Dates within 7 days. ONLY valid JSON.`

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ today: getDateKeyInTimeZone(), diagnosis: input.diagnosis, preferences: input.preferences, goals: input.goals, recentSummary: summary }) }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(25000)
  })

  if (!response.ok) throw new AiProviderError('AI request failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices?.[0]?.message?.content ?? '{"tasks":[]}'
  const parsed = JSON.parse(content)
  const taskArray = Array.isArray(parsed) ? parsed : parsed.tasks ?? []
  return Array.isArray(taskArray) ? taskArray.slice(0, 14) : []
}

function buildFallbackTasks(
  preferences: Record<string, unknown>,
  goals: Record<string, unknown>,
  diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>
): Array<Record<string, unknown>> {
  const today = getDateKeyInTimeZone()
  const sessions = Math.min(7, Math.max(1, (preferences.sessionsPerWeek as number) ?? 4))
  const minutes = (preferences.minutesPerSession as number) ?? 45
  const tasks: Array<Record<string, unknown>> = []
  const examDate = goals.examDate as string | undefined
  const examDays = examDate ? Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)) : null
  const weaknesses = (preferences.weaknesses as string[]) ?? []

  const t1Weak = diagnosis.weakestCriteria.some((c) => c === 'Task Achievement') || weaknesses.includes('task1_overview')
  const graWeak = diagnosis.weakestCriteria.some((c) => c === 'Grammatical Range and Accuracy') || weaknesses.includes('grammar')

  for (let i = 0; i < sessions; i++) {
    const date = addDaysToDateKey(today, i)
    const isTask1 = i % 3 === 0

    if (isTask1) {
      tasks.push({
        scheduledDate: date,
        taskType: 'task1',
        source: 'weakness_drill',
        title: 'Task 1 写作训练',
        description: '完成一篇 Task 1，重点练习数据选择与概述。',
        focusCriteria: ['Task Achievement'],
        focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((t) => t.tag),
        estimatedMinutes: Math.min(minutes, 25),
        difficulty: 'medium',
        priority: 2,
        generatedReason: t1Weak ? 'Task 1 分数偏低，需要加强' : '保持 Task 1 训练频率',
        writingMode: 'task1'
      })
    } else {
      tasks.push({
        scheduledDate: date,
        taskType: 'task2',
        source: 'weakness_drill',
        title: 'Task 2 写作训练',
        description: '完成一篇 Task 2，重点练习论证展开。',
        focusCriteria: ['Task Response', 'Coherence and Cohesion'],
        focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((t) => t.tag),
        estimatedMinutes: minutes,
        difficulty: examDays !== null && examDays <= 14 ? 'hard' : 'medium',
        priority: 1,
        generatedReason: graWeak ? '语法准确性需要提升' : '保持 Task 2 训练强度',
        writingMode: 'task2'
      })
    }
  }

  if (diagnosis.priorityErrorTags.length > 0) {
    tasks.push({
      scheduledDate: addDaysToDateKey(today, Math.min(sessions, 5)),
      taskType: 'error_review',
      source: 'review',
      title: '错误复盘',
      description: '回顾最近作文中的重复错误，总结改进方法。',
      focusCriteria: ['Coherence and Cohesion'],
      focusErrorTags: diagnosis.priorityErrorTags.slice(0, 3).map((t) => t.tag),
      estimatedMinutes: 20,
      difficulty: 'easy',
      priority: 3,
      generatedReason: '复盘错误有助于避免重复犯错',
      writingMode: null
    })
  }

  return tasks
}
