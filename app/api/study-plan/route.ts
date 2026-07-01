import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const [planResult, profileResult, quotaResult] = await Promise.all([
    service
      .from('study_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    service
      .from('study_plan_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    service
      .from('study_plan_generation_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('month_key', currentMonthKey())
  ])

  let tasks: unknown[] = []
  if (planResult.data) {
    const { data: taskData } = await service
      .from('study_plan_tasks')
      .select('*')
      .eq('plan_id', planResult.data.id)
      .order('scheduled_date', { ascending: true })
    tasks = (taskData ?? []).map((t) => mapTask(t as Record<string, unknown>))
  }

  return json({
    success: true,
    plan: planResult.data ? mapPlan(planResult.data, tasks) : null,
    profile: profileResult.data ? mapProfile(profileResult.data) : null,
    quota: {
      monthKey: currentMonthKey(),
      usedCount: quotaResult.count ?? 0,
      remainingCount: Math.max(0, 5 - (quotaResult.count ?? 0)),
      limit: 5
    }
  })
}

function currentMonthKey() {
  const now = new Date()
  const shanghai = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  return `${shanghai.getFullYear()}-${String(shanghai.getMonth() + 1).padStart(2, '0')}`
}

function mapPlan(row: Record<string, unknown>, tasks: unknown[]) {
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    status: row.status,
    currentPhase: row.current_phase ?? 'foundation',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    diagnosis: row.diagnosis,
    preferencesSnapshot: row.preferences_snapshot,
    goalsSnapshot: row.goals_snapshot,
    aiModel: row.ai_model,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    tasks: tasks
  }
}

function mapTask(row: Record<string, unknown>) {
  return {
    id: row.id,
    planId: row.plan_id,
    userId: row.user_id,
    scheduledDate: row.scheduled_date,
    taskType: row.task_type,
    source: row.source,
    questionId: row.question_id,
    title: row.title ?? '',
    description: row.description ?? '',
    difficulty: row.difficulty ?? 'medium',
    priority: row.priority ?? 2,
    focusCriteria: row.focus_criteria ?? [],
    focusErrorTags: row.focus_error_tags ?? [],
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    writingRecordId: row.writing_record_id,
    draftId: row.draft_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    skipReason: row.skip_reason,
    generatedReason: row.generated_reason ?? '',
    writingMode: row.writing_mode,
    questionSource: row.question_source ?? 'question_bank',
    originalQuestionSource: row.original_question_source ?? null,
    fallbackReason: row.fallback_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapProfile(row: Record<string, unknown>) {
  return {
    userId: row.user_id,
    overallTarget: row.overall_target,
    task1Target: row.task1_target,
    task2Target: row.task2_target,
    examDate: row.exam_date,
    sessionsPerWeek: row.sessions_per_week,
    minutesPerSession: row.minutes_per_session,
    preferredDays: row.preferred_days ?? [],
    includeFullTests: row.include_full_tests,
    includePastPapers: row.include_past_papers,
    task1Ratio: row.task1_ratio,
    task2Ratio: row.task2_ratio,
    preferWeakness: row.prefer_weakness,
    weekendExtended: row.weekend_extended,
    timezone: row.timezone,
    intensity: row.intensity ?? 'standard',
    allowTimedPractice: row.allow_timed_practice ?? true,
    currentLevel: row.current_level,
    questionBankRatio: row.question_bank_ratio ?? 80,
    aiGeneratedRatio: row.ai_generated_ratio ?? 20
  }
}
