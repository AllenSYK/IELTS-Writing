import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { getAiConfig, AiProviderError } from '@/lib/ai-provider'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'
import { normalizeStudyPlanTaskType } from '@/lib/study-plan-types'

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const userId = check.user.id
  const service = createSupabaseServiceRoleClient()

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch { /* empty body is fine */ }

  const monthKey = currentMonthKey()
  const { count } = await service
    .from('study_plan_generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('month_key', monthKey)

  if ((count ?? 0) >= 5) {
    return json({
      success: false,
      code: 'STUDY_PLAN_MONTHLY_LIMIT',
      message: '本月重新规划次数已用完，下个月将自动恢复。'
    }, { status: 429 })
  }

  const profileUpdates: Record<string, unknown> = {}
  if (body.overallTarget !== undefined) profileUpdates.overall_target = body.overallTarget
  if (body.task1Target !== undefined) profileUpdates.task1_target = body.task1Target
  if (body.task2Target !== undefined) profileUpdates.task2_target = body.task2Target
  if (body.examDate !== undefined) profileUpdates.exam_date = body.examDate || null
  if (body.sessionsPerWeek !== undefined) profileUpdates.sessions_per_week = body.sessionsPerWeek
  if (body.minutesPerSession !== undefined) profileUpdates.minutes_per_session = body.minutesPerSession
  if (body.intensity !== undefined) profileUpdates.intensity = body.intensity
  if (body.allowTimedPractice !== undefined) profileUpdates.allow_timed_practice = body.allowTimedPractice
  if (body.currentLevel !== undefined) profileUpdates.current_level = body.currentLevel

  if (Object.keys(profileUpdates).length > 0) {
    await service
      .from('study_plan_profiles')
      .upsert({ user_id: userId, ...profileUpdates }, { onConflict: 'user_id' })
  }

  const [profileResult, records] = await Promise.all([
    service.from('study_plan_profiles').select('*').eq('user_id', userId).maybeSingle(),
    loadWritingRecordsFromServer(userId).catch(() => [])
  ])

  const profile = profileResult.data
  const diagnosis = buildStudyPlanDiagnosis(records)

  const preferences = {
    sessionsPerWeek: profile?.sessions_per_week ?? 4,
    minutesPerSession: profile?.minutes_per_session ?? 45,
    includeFullTests: profile?.include_full_tests ?? true,
    includePastPapers: profile?.include_past_papers ?? true,
    intensity: profile?.intensity ?? 'standard',
    allowTimedPractice: profile?.allow_timed_practice ?? true
  }

  const goals = {
    overallTarget: profile?.overall_target ?? 6.5,
    task1Target: profile?.task1_target ?? 6.0,
    task2Target: profile?.task2_target ?? 6.5,
    examDate: profile?.exam_date ?? undefined
  }

  let tasks: Array<Record<string, unknown>> = []

  try {
    const aiConfig = getAiConfig({ modelEnv: 'QWEN_STUDY_PLAN_MODEL', defaultModel: 'qwen3.5-plus' })
    const aiTasks = await generatePlanWithAI(aiConfig, { diagnosis, preferences, goals, records: records.slice(0, 20) })
    tasks = aiTasks
  } catch {
    tasks = buildFallbackTasks(preferences, goals, diagnosis) as unknown as Array<Record<string, unknown>>
  }

  for (const task of tasks) {
    task.taskType = normalizeStudyPlanTaskType(task.taskType)
  }

  const periodStart = todayShanghai()
  const periodEnd = addDays(periodStart, 7)

  const { data: rpcResult, error: rpcError } = await service
    .rpc('generate_study_plan_slot', {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_diagnosis: diagnosis,
      p_preferences: preferences,
      p_goals: goals,
      p_ai_model: 'fallback',
      p_tasks: tasks
    })
    .single()

  if (rpcError) {
    const msg = rpcError.message || ''
    if (msg.includes('STUDY_PLAN_MONTHLY_LIMIT')) {
      return json({ success: false, code: 'STUDY_PLAN_MONTHLY_LIMIT', message: '本月重新规划次数已用完。' }, { status: 429 })
    }
    return json({ success: false, message: 'Failed to create plan' }, { status: 500 })
  }

  return json({ success: true, result: rpcResult })
}

function currentMonthKey() {
  const now = new Date()
  const sh = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  return `${sh.getFullYear()}-${String(sh.getMonth() + 1).padStart(2, '0')}`
}

function todayShanghai(): string {
  const now = new Date()
  const sh = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  return sh.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysUntilExam(examDate?: string): number | null {
  if (!examDate) return null
  const diff = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)
  return Math.max(0, diff)
}

function determinePhase(examDays: number | null): string {
  if (examDays === null) return 'foundation'
  if (examDays <= 7) return 'sprint'
  if (examDays <= 14) return 'integrated'
  if (examDays <= 28) return 'focused'
  return 'foundation'
}

function task1RatioForDiagnosis(diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>): number {
  if (!diagnosis.task1Average || !diagnosis.task2Average) return 0.35
  const diff = diagnosis.task2Average - diagnosis.task1Average
  if (diff > 0.5) return 0.45
  if (diff < -0.5) return 0.25
  return 0.35
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
      questionType: rec.questionType,
      overallBand: ev.overallBand ?? ev.bandEstimate,
      criteria: ev.criteria,
      submittedAt: rec.submittedAt
    }
  })

  const systemPrompt = `You are an IELTS study plan generator. Return a JSON object with a "tasks" array of 5-7 study tasks for one week.
Each task object must have:
- scheduledDate (YYYY-MM-DD)
- taskType (task1|task2|full_test|grammar_drill|vocabulary_drill|review)
- source (built_in|weakness_drill|review)
- title (short Chinese title, max 30 chars)
- description (Chinese description, max 100 chars)
- focusCriteria (string array from: Task Achievement, Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy)
- focusErrorTags (string array)
- estimatedMinutes (integer 10-90)
- difficulty (easy|medium|hard)
- priority (integer 1-3, 1=highest)
- generatedReason (Chinese, max 50 chars, why this task helps)
- writingMode (task1|task2|null, for writing tasks only)
Dates must be within 7 days from today. Return ONLY valid JSON.`

  const userPrompt = JSON.stringify({
    today: todayShanghai(),
    examDays: daysUntilExam(input.goals.examDate as string),
    phase: determinePhase(daysUntilExam(input.goals.examDate as string)),
    diagnosis: input.diagnosis,
    preferences: input.preferences,
    goals: input.goals,
    recentSummary: summary
  })

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) throw new AiProviderError('AI request failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices?.[0]?.message?.content ?? '{"tasks":[]}'
  const parsed = JSON.parse(content)
  const taskArray = Array.isArray(parsed) ? parsed : parsed.tasks ?? parsed.plan ?? []
  return Array.isArray(taskArray) ? taskArray.slice(0, 14) : []
}

interface FallbackTask {
  scheduledDate: string
  taskType: string
  source: string
  title: string
  description: string
  focusCriteria: string[]
  focusErrorTags: string[]
  estimatedMinutes: number
  difficulty: string
  priority: number
  generatedReason: string
  writingMode: string | null
}

function buildFallbackTasks(
  preferences: Record<string, unknown>,
  goals: Record<string, unknown>,
  diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>
): FallbackTask[] {
  const today = todayShanghai()
  const sessions = Math.min(7, Math.max(1, preferences.sessionsPerWeek as number))
  const minutes = (preferences.minutesPerSession as number) || 45
  const examDays = daysUntilExam(goals.examDate as string)
  const phase = determinePhase(examDays)
  const t1Ratio = task1RatioForDiagnosis(diagnosis)
  const tasks: FallbackTask[] = []

  const t1Weak = diagnosis.weakestCriteria.some((c) => c === 'Task Achievement')
  const ccWeak = diagnosis.weakestCriteria.some((c) => c === 'Coherence and Cohesion')
  const lrWeak = diagnosis.weakestCriteria.some((c) => c === 'Lexical Resource')
  const graWeak = diagnosis.weakestCriteria.some((c) => c === 'Grammatical Range and Accuracy')

  const intensity = preferences.intensity as string || 'standard'
  const tasksPerDay = intensity === 'intensive' ? 2 : intensity === 'relaxed' ? 1 : 1

  const usedDates = new Set<string>()

  for (let i = 0; i < sessions; i++) {
    const date = addDays(today, i)
    usedDates.add(date)

    for (let j = 0; j < tasksPerDay; j++) {
      const isTask1 = Math.random() < t1Ratio
      const baseMinutes = Math.round(minutes / tasksPerDay)

      if (i === 0 && diagnosis.dataSufficiency === 'none') {
        tasks.push({
          scheduledDate: date,
          taskType: 'task2',
          source: 'weakness_drill',
          title: '诊断测试',
          description: '完成一篇 Task 2 写作，帮助系统了解你的当前水平。',
          focusCriteria: ['Task Response', 'Coherence and Cohesion'],
          focusErrorTags: [],
          estimatedMinutes: baseMinutes,
          difficulty: 'medium',
          priority: 1,
          generatedReason: '需要诊断数据来制定个性化计划',
          writingMode: 'task2'
        })
        continue
      }

      if (phase === 'sprint' && i === Math.floor(sessions / 2) && preferences.includeFullTests) {
        tasks.push({
          scheduledDate: date,
          taskType: 'full_test',
          source: 'built_in',
          title: '考前完整模考',
          description: '完整模拟考试环境，练习时间分配和临场发挥。',
          focusCriteria: ['Task Achievement', 'Task Response', 'Coherence and Cohesion'],
          focusErrorTags: [],
          estimatedMinutes: 60,
          difficulty: 'hard',
          priority: 1,
          generatedReason: '考前冲刺阶段需要完整模考',
          writingMode: null
        })
        continue
      }

      if (isTask1) {
        const focus = t1Weak ? ['Task Achievement'] : ['Coherence and Cohesion']
        tasks.push({
          scheduledDate: date,
          taskType: 'task1',
          source: diagnosis.dataSufficiency !== 'none' ? 'weakness_drill' : 'built_in',
          title: 'Task 1 写作训练',
          description: `完成一篇 Task 1，重点练习${focus[0] === 'Task Achievement' ? '数据选择与概述' : '比较与衔接'}。`,
          focusCriteria: focus,
          focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((t) => t.tag),
          estimatedMinutes: Math.min(baseMinutes, 25),
          difficulty: phase === 'foundation' ? 'easy' : 'medium',
          priority: 2,
          generatedReason: t1Weak ? 'Task 1 分数偏低，需要加强' : '保持 Task 1 训练频率',
          writingMode: 'task1'
        })
      } else {
        const focus: string[] = []
        if (t1Weak) focus.push('Task Response')
        if (ccWeak) focus.push('Coherence and Cohesion')
        if (lrWeak) focus.push('Lexical Resource')
        if (graWeak) focus.push('Grammatical Range and Accuracy')
        if (focus.length === 0) focus.push('Task Response')

        tasks.push({
          scheduledDate: date,
          taskType: 'task2',
          source: diagnosis.dataSufficiency !== 'none' ? 'weakness_drill' : 'built_in',
          title: 'Task 2 写作训练',
          description: `完成一篇 Task 2，重点练习${focus[0]}。`,
          focusCriteria: focus.slice(0, 2),
          focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((t) => t.tag),
          estimatedMinutes: baseMinutes,
          difficulty: phase === 'foundation' ? 'easy' : phase === 'sprint' ? 'hard' : 'medium',
          priority: 1,
          generatedReason: graWeak ? '语法准确性需要提升' : '保持 Task 2 训练强度',
          writingMode: 'task2'
        })
      }
    }
  }

  if (ccWeak || lrWeak) {
    const date = addDays(today, Math.min(sessions, 5))
    if (!usedDates.has(date)) {
      tasks.push({
        scheduledDate: date,
        taskType: 'review',
        source: 'review',
        title: '错误复盘',
        description: '回顾最近作文中的重复错误，总结改进方法。',
        focusCriteria: ccWeak ? ['Coherence and Cohesion'] : ['Lexical Resource'],
        focusErrorTags: diagnosis.priorityErrorTags.slice(0, 3).map((t) => t.tag),
        estimatedMinutes: 20,
        difficulty: 'easy',
        priority: 3,
        generatedReason: '复盘错误有助于避免重复犯错',
        writingMode: null
      })
    }
  }

  if (preferences.includeFullTests && phase !== 'sprint') {
    const date = addDays(today, 6)
    tasks.push({
      scheduledDate: date,
      taskType: 'full_test',
      source: 'built_in',
      title: '周末完整测试',
      description: '完整模考，检验本周学习效果。',
      focusCriteria: ['Task Achievement', 'Task Response'],
      focusErrorTags: [],
      estimatedMinutes: 60,
      difficulty: 'hard',
      priority: 2,
      generatedReason: '定期模考检验学习效果',
      writingMode: null
    })
  }

  return tasks
}
