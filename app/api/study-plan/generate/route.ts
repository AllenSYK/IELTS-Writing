import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { getAiConfig, AiProviderError } from '@/lib/ai-provider'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'

export async function POST() {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const userId = check.user.id
  const service = createSupabaseServiceRoleClient()

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
    includePastPapers: profile?.include_past_papers ?? true
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
    tasks = buildFallbackTasks(preferences, goals)
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
      submittedAt: rec.submittedAt
    }
  })

  const systemPrompt = `You are an IELTS study plan generator. Return a JSON array of 5-7 study tasks for one week.
Each task object must have: scheduledDate (YYYY-MM-DD), taskType (task1|task2|full_test|grammar_drill|vocabulary_drill|review), source (built_in|weakness_drill|review), focusCriteria (string array), focusErrorTags (string array), estimatedMinutes (integer 10-120).
Dates must be within 7 days from today. Do NOT include questionId. Return ONLY valid JSON array.`

  const userPrompt = JSON.stringify({
    today: todayShanghai(),
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
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }),
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) throw new AiProviderError('AI request failed', response.status)
  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const content = data.choices?.[0]?.message?.content ?? '[]'
  const parsed = JSON.parse(content)
  const taskArray = Array.isArray(parsed) ? parsed : parsed.tasks ?? parsed.plan ?? []
  return Array.isArray(taskArray) ? taskArray.slice(0, 14) : []
}

function buildFallbackTasks(preferences: Record<string, unknown>, _goals: Record<string, unknown>): Array<Record<string, unknown>> {
  const today = todayShanghai()
  const sessions = Math.min(7, Math.max(1, preferences.sessionsPerWeek as number))
  const minutes = preferences.minutesPerSession as number || 45
  const tasks: Array<Record<string, unknown>> = []

  for (let i = 0; i < sessions; i++) {
    const date = addDays(today, i)
    const isTask1 = i % 3 === 0
    tasks.push({
      scheduledDate: date,
      taskType: isTask1 ? 'task1' : 'task2',
      source: 'built_in',
      focusCriteria: isTask1 ? ['Task Achievement'] : ['Task Response'],
      focusErrorTags: [],
      estimatedMinutes: minutes
    })
  }

  if (preferences.includeFullTests) {
    tasks.push({
      scheduledDate: addDays(today, 6),
      taskType: 'full_test',
      source: 'built_in',
      focusCriteria: ['Task Achievement', 'Task Response'],
      focusErrorTags: [],
      estimatedMinutes: 60
    })
  }

  return tasks
}
