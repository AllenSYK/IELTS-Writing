import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'
import { selectQuestionsForPlan, buildQuestionSnapshot } from '@/lib/question-selection'
import type { TaskQuestionResult } from '@/lib/question-selection'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timed_out'

const STAGE_PROGRESS: Record<string, { progress: number; stage: string; message: string }> = {
  queued: { progress: 0, stage: 'queued', message: '任务已创建，等待处理' },
  loading_profile: { progress: 10, stage: 'loading_profile', message: '正在读取你的学习偏好' },
  loading_history: { progress: 20, stage: 'loading_history', message: '正在加载历史写作记录' },
  analyzing_weaknesses: { progress: 30, stage: 'analyzing_weaknesses', message: '正在分析 Task 1 与 Task 2 强弱项' },
  building_schedule: { progress: 45, stage: 'building_schedule', message: '正在计算适合你的训练比例' },
  selecting_questions: { progress: 60, stage: 'selecting_questions', message: '正在从题库中选题' },
  generating_ai_items: { progress: 75, stage: 'generating_ai_items', message: '正在生成个性化任务' },
  saving_plan: { progress: 90, stage: 'saving_plan', message: '正在保存学习计划' },
  finalizing: { progress: 97, stage: 'finalizing', message: '即将完成' }
}

async function updateJob(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  updates: {
    status?: JobStatus
    progress?: number
    current_step?: string
    stage?: string
    message?: string
    error_message?: string
    error_code?: string
    result_plan_id?: string
    started_at?: string
    completed_at?: string
    failed_at?: string
  }
) {
  const now = new Date().toISOString()
  await service
    .from('study_plan_generation_jobs')
    .update({ ...updates, updated_at: now, heartbeat_at: now })
    .eq('id', jobId)
}

async function updateStage(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobId: string,
  stageKey: string
) {
  const config = STAGE_PROGRESS[stageKey]
  if (!config) return
  await updateJob(service, jobId, {
    status: 'running',
    progress: config.progress,
    current_step: config.message,
    stage: config.stage,
    message: config.message
  })
  console.log(JSON.stringify({
    event: 'STUDY_PLAN_JOB_STAGE_CHANGED',
    jobId,
    stage: config.stage,
    progress: config.progress,
    timestamp: new Date().toISOString()
  }))
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

export async function processGenerationJob(jobId: string, userId: string) {
  const service = createSupabaseServiceRoleClient()

  const { data: job } = await service
    .from('study_plan_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!job || job.status === 'cancelled' || job.status === 'completed' || job.status === 'timed_out') return

  console.log(JSON.stringify({
    event: 'STUDY_PLAN_JOB_STARTED',
    jobId,
    jobType: job.job_type,
    userId: userId.slice(0, 8),
    timestamp: new Date().toISOString()
  }))

  const startedAt = Date.now()

  try {
    // Start
    await updateJob(service, jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: 5,
      stage: 'loading_profile',
      message: '正在读取你的学习偏好'
    })

    // Load profile
    await updateStage(service, jobId, 'loading_profile')
    const { data: profile } = await service
      .from('study_plan_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    // Load history
    await updateStage(service, jobId, 'loading_history')
    const records = await loadWritingRecordsFromServer(userId).catch(() => [])

    // Analyze weaknesses
    await updateStage(service, jobId, 'analyzing_weaknesses')
    const diagnosis = buildStudyPlanDiagnosis(records)
    await heartbeat(service, jobId)

    // Build schedule
    await updateStage(service, jobId, 'building_schedule')
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
      adjustmentSensitivity: (input.adjustmentSensitivity as string) ?? 'standard',
      questionBankRatio: (input.questionBankRatio as number) ?? profile?.question_bank_ratio ?? 80,
      aiGeneratedRatio: (input.aiGeneratedRatio as number) ?? profile?.ai_generated_ratio ?? 20
    }
    const goals = {
      overallTarget: profile?.overall_target ?? (input.overallTarget as number) ?? 6.5,
      task1Target: profile?.task1_target ?? (input.task1Target as number) ?? 6.0,
      task2Target: profile?.task2_target ?? (input.task2Target as number) ?? 6.5,
      examDate: profile?.exam_date ?? (input.examDate as string) ?? undefined,
      prepWeeks: (input.prepWeeks as number) ?? undefined
    }
    await heartbeat(service, jobId)

    const today = getDateKeyInTimeZone()
    const totalWeeks = goals.examDate
      ? Math.max(1, Math.ceil(Math.max(0, (new Date(goals.examDate).getTime() - Date.now()) / 86400000) / 7))
      : (goals.prepWeeks ?? 4)
    const periodEnd = addDaysToDateKey(today, totalWeeks * 7)

    const totalStudyDays = totalWeeks * preferences.sessionsPerWeek
    const task1Count = Math.max(2, Math.ceil(totalStudyDays * 0.35))
    const task2Count = Math.max(3, Math.ceil(totalStudyDays * 0.45))
    const mockCount = preferences.includeFullTests ? Math.max(1, Math.floor(totalWeeks / 2)) : 0

    // Select questions (this can be slow with AI)
    await updateStage(service, jobId, 'selecting_questions')
    await heartbeat(service, jobId)

    const questions = await selectQuestionsForPlan(userId, {
      task1Count,
      task2Count,
      mockCount,
      weaknesses: preferences.weaknesses,
      bankRatio: preferences.questionBankRatio
    })

    await heartbeat(service, jobId)

    // Build tasks
    await updateStage(service, jobId, 'generating_ai_items')
    const tasks = buildFullPeriodTasks(today, periodEnd, totalWeeks, preferences, goals, diagnosis, questions)
    await heartbeat(service, jobId)

    // Save plan
    await updateStage(service, jobId, 'saving_plan')

    const { data: rpcResult, error: rpcError } = await service
      .rpc('save_generated_study_plan', {
        p_job_id: jobId,
        p_user_id: userId,
        p_period_start: today,
        p_period_end: periodEnd,
        p_diagnosis: diagnosis as unknown as Record<string, unknown>,
        p_preferences: preferences as unknown as Record<string, unknown>,
        p_goals: goals as unknown as Record<string, unknown>,
        p_ai_model: 'full_period_v1',
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

    // Finalize
    await updateStage(service, jobId, 'finalizing')

    // Mark completed
    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: '完成',
        stage: 'completed',
        message: '学习计划已生成',
        result_plan_id: planId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
      })
      .eq('id', jobId)

    const duration = Math.round((Date.now() - startedAt) / 1000)
    console.log(JSON.stringify({
      event: 'STUDY_PLAN_JOB_COMPLETED',
      jobId,
      duration,
      planId,
      timestamp: new Date().toISOString()
    }))

    // Award bonus points (best-effort)
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
      : 'DATABASE_ERROR'

    const duration = Math.round((Date.now() - startedAt) / 1000)
    console.log(JSON.stringify({
      event: 'STUDY_PLAN_JOB_FAILED',
      jobId,
      errorCode,
      duration,
      timestamp: new Date().toISOString()
    }))

    await service
      .from('study_plan_generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg.slice(0, 500),
        error_code: errorCode,
        failed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString()
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

function selectLearningDays(sessionsPerWeek: number, preferredDays: number[]): number[] {
  if (preferredDays.length >= sessionsPerWeek) return preferredDays.slice(0, sessionsPerWeek)

  const allDays = [0, 1, 2, 3, 4, 5, 6]
  if (sessionsPerWeek >= 7) return allDays
  if (sessionsPerWeek >= 6) return allDays.filter((d) => d !== 0)

  const spacing = Math.floor(7 / sessionsPerWeek)
  const result: number[] = []
  const start = preferredDays.length > 0 ? preferredDays[0] : 1

  for (let i = 0; i < sessionsPerWeek; i++) {
    const day = (start + i * spacing) % 7
    if (!result.includes(day)) result.push(day)
  }

  return result.sort((a, b) => a - b)
}

function buildFullPeriodTasks(
  startDate: string,
  endDate: string,
  totalWeeks: number,
  preferences: Record<string, unknown>,
  goals: Record<string, unknown>,
  diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>,
  questions: { task1Questions: TaskQuestionResult[]; task2Questions: TaskQuestionResult[]; mockPairs: Array<{ t1: TaskQuestionResult; t2: TaskQuestionResult }> }
): Array<Record<string, unknown>> {
  const tasks: Array<Record<string, unknown>> = []
  const sessionsPerWeek = Math.min(7, Math.max(1, (preferences.sessionsPerWeek as number) ?? 4))
  const minutesPerSession = (preferences.minutesPerSession as number) ?? 45
  const preferredDays = (preferences.preferredDays as number[]) ?? []
  const weaknesses = (preferences.weaknesses as string[]) ?? []
  const includeFullTests = (preferences.includeFullTests as boolean) ?? true
  const intensity = (preferences.intensity as string) ?? 'standard'

  const learningDays = selectLearningDays(sessionsPerWeek, preferredDays)

  const examDate = goals.examDate as string | undefined
  const examDays = examDate ? Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)) : null

  let t1Idx = 0
  let t2Idx = 0
  let mockIdx = 0

  const t1Weak = diagnosis.weakestCriteria.some((c) => c === 'Task Achievement') || weaknesses.includes('task1_overview') || weaknesses.includes('task1_data')
  const graWeak = diagnosis.weakestCriteria.some((c) => c === 'Grammatical Range and Accuracy') || weaknesses.includes('grammar')
  const ccWeak = diagnosis.weakestCriteria.some((c) => c === 'Coherence and Cohesion')

  const tasksPerDay = intensity === 'intensive' ? 2 : 1

  let currentDate = startDate
  let weekNum = 0
  let consecutiveStudyDays = 0

  while (currentDate <= endDate) {
    const dayOfWeek = new Date(currentDate + 'T00:00:00+08:00').getDay()
    const isLearningDay = learningDays.includes(dayOfWeek)
    const daysFromStart = Math.floor((new Date(currentDate).getTime() - new Date(startDate).getTime()) / 86400000)
    weekNum = Math.floor(daysFromStart / 7)

    if (!isLearningDay) {
      consecutiveStudyDays = 0
      currentDate = addDaysToDateKey(currentDate, 1)
      continue
    }

    consecutiveStudyDays++

    if (consecutiveStudyDays > 3) {
      tasks.push({
        scheduledDate: currentDate,
        taskType: 'review',
        source: 'review',
        title: '轻量复习',
        description: '回顾最近学习内容，保持手感。',
        focusCriteria: [],
        focusErrorTags: [],
        estimatedMinutes: 15,
        difficulty: 'easy',
        priority: 3,
        generatedReason: '连续学习后安排轻量日',
        writingMode: null,
        questionId: null,
        questionSnapshot: null,
        questionSource: 'question_bank'
      })
      consecutiveStudyDays = 0
      currentDate = addDaysToDateKey(currentDate, 1)
      continue
    }

    for (let t = 0; t < tasksPerDay; t++) {
      const remainingMinutes = minutesPerSession - (t > 0 ? Math.round(minutesPerSession * 0.6) : 0)
      const taskMinutes = t === 0 ? Math.round(minutesPerSession * 0.6) : remainingMinutes

      const isSprintWeek = examDays !== null && examDays <= 7 * (totalWeeks - weekNum)
      const isLastWeek = weekNum >= totalWeeks - 1

      // Mock test scheduling
      if (includeFullTests && dayOfWeek === (learningDays[learningDays.length - 1] ?? 6) && weekNum % 2 === 0 && t === 0) {
        const mockResult = questions.mockPairs[mockIdx % Math.max(1, questions.mockPairs.length)]
        if (mockResult) {
          mockIdx++
          const t1Q = mockResult.t1.question
          const t2Q = mockResult.t2.question
          tasks.push({
            scheduledDate: currentDate,
            taskType: 'full_test',
            source: 'past_paper',
            title: '完整模考',
            description: t1Q && t2Q ? `${t1Q.title || 'Task 1'} + ${t2Q.title || 'Task 2'}` : '完整模考',
            focusCriteria: ['Task Achievement', 'Task Response'],
            focusErrorTags: [],
            estimatedMinutes: 60,
            difficulty: 'hard',
            priority: 1,
            generatedReason: '定期模考检验学习效果',
            writingMode: null,
            questionId: t1Q?.id ?? null,
            questionSnapshot: t1Q ? buildQuestionSnapshot(t1Q) : null,
            questionSource: mockResult.t1.source,
            originalQuestionSource: mockResult.t1.originalSource,
            fallbackReason: mockResult.t1.fallbackReason,
            taskMetadata: {
              task1QuestionId: t1Q?.id ?? null,
              task2QuestionId: t2Q?.id ?? null,
              task1Snapshot: t1Q ? buildQuestionSnapshot(t1Q) : null,
              task2Snapshot: t2Q ? buildQuestionSnapshot(t2Q) : null,
              task1QuestionSource: mockResult.t1.source,
              task2QuestionSource: mockResult.t2.source,
              task1FallbackReason: mockResult.t1.fallbackReason,
              task2FallbackReason: mockResult.t2.fallbackReason
            }
          })
          continue
        }
      }

      // Task 1 vs Task 2 alternation
      const isTask1Turn = (t1Idx + t2Idx) % 3 === 0 || (t1Weak && t1Idx < t2Idx + 2)

      if (isTask1Turn && t1Idx < questions.task1Questions.length) {
        const result = questions.task1Questions[t1Idx]
        t1Idx++
        const q = result.question
        const visualLabel = q?.visualTypes?.includes('map') ? '地图题' : q?.visualTypes?.includes('process') ? '流程图' : '图表题'
        const sourceLabel = result.source === 'ai_generated' ? 'AI' : '题库'
        tasks.push({
          scheduledDate: currentDate,
          taskType: 'task1',
          source: 'past_paper',
          title: q ? `Task 1 · ${visualLabel}` : `Task 1 · ${visualLabel}（${sourceLabel}）`,
          description: q?.title || `完成一篇 Task 1 ${visualLabel}。`,
          focusCriteria: ['Task Achievement'],
          focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((tag) => tag.tag),
          estimatedMinutes: Math.min(taskMinutes, 25),
          difficulty: isSprintWeek ? 'hard' : 'medium',
          priority: 2,
          generatedReason: t1Weak ? 'Task 1 分数偏低，需要加强' : '保持 Task 1 训练频率',
          writingMode: 'task1',
          questionId: q?.id ?? null,
          questionSnapshot: q ? buildQuestionSnapshot(q) : null,
          questionSource: result.source,
          originalQuestionSource: result.originalSource,
          fallbackReason: result.fallbackReason
        })
      } else if (t2Idx < questions.task2Questions.length) {
        const result = questions.task2Questions[t2Idx]
        t2Idx++
        const q = result.question
        const typeLabel = q?.questionType === 'opinion' ? 'Opinion' : q?.questionType === 'discussion' ? 'Discussion' : q?.questionType === 'problem_solution' ? '问题解决' : q?.questionType === 'advantages_disadvantages' ? '优缺点' : '综合'
        const sourceLabel = result.source === 'ai_generated' ? 'AI' : '题库'
        tasks.push({
          scheduledDate: currentDate,
          taskType: 'task2',
          source: 'past_paper',
          title: q ? `Task 2 · ${typeLabel}` : `Task 2 · ${typeLabel}（${sourceLabel}）`,
          description: q?.title || '完成一篇 Task 2 写作。',
          focusCriteria: graWeak ? ['Grammatical Range and Accuracy', 'Task Response'] : ['Task Response', 'Coherence and Cohesion'],
          focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((tag) => tag.tag),
          estimatedMinutes: taskMinutes,
          difficulty: isSprintWeek || isLastWeek ? 'hard' : 'medium',
          priority: 1,
          generatedReason: graWeak ? '语法准确性需要提升' : '保持 Task 2 训练强度',
          writingMode: 'task2',
          questionId: q?.id ?? null,
          questionSnapshot: q ? buildQuestionSnapshot(q) : null,
          questionSource: result.source,
          originalQuestionSource: result.originalSource,
          fallbackReason: result.fallbackReason
        })
      } else {
        tasks.push({
          scheduledDate: currentDate,
          taskType: 'error_review',
          source: 'review',
          title: '错误复盘',
          description: '回顾最近作文中的重复错误，总结改进方法。',
          focusCriteria: ccWeak ? ['Coherence and Cohesion'] : ['Grammatical Range and Accuracy'],
          focusErrorTags: diagnosis.priorityErrorTags.slice(0, 3).map((tag) => tag.tag),
          estimatedMinutes: 20,
          difficulty: 'easy',
          priority: 3,
          generatedReason: '复盘错误有助于避免重复犯错',
          writingMode: null,
          questionId: null,
          questionSnapshot: null,
          questionSource: 'question_bank'
        })
      }
    }

    currentDate = addDaysToDateKey(currentDate, 1)
  }

  return tasks
}
