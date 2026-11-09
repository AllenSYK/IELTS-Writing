import type { QuestionAssignments } from '@/lib/study-plan/question-allocation'
import { plannerConfig } from '@/lib/study-plan/config'
import { refreshRollingPlan } from '@/lib/study-plan/rolling'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'
import { createApiObservation } from '@/lib/api-observability'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { studyPlanAdjustmentMonthRange, studyPlanAdjustmentQuota } from '@/lib/study-plan-adjustments'

export const maxDuration = 300

export async function GET(request: Request) {
  const observation = createApiObservation('/api/study-plan', request)
  const check = await observation.time('license', () => requireActiveWebLicense(observation))
  if (!check.ok) {
    return observation.respond({ success: false, message: check.message }, { status: check.status })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id
  const adjustmentMonth = studyPlanAdjustmentMonthRange()

  const [planResult, profileResult, quotaResult] = await Promise.all([
    observation.time('plan', () => service
      .from('study_plans')
      .select('id, user_id, version, status, current_phase, period_start, period_end, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at, created_at, adaptive_through, adaptation_reason, adaptation_applied_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()),
    observation.time('profile', () => service
      .from('study_plan_profiles')
      .select('user_id, overall_target, task1_target, task2_target, exam_date, sessions_per_week, minutes_per_session, preferred_days, include_full_tests, include_past_papers, task1_ratio, task2_ratio, prefer_weakness, weekend_extended, timezone, intensity, allow_timed_practice, current_level, question_bank_ratio, ai_generated_ratio, analysis_snapshot, analysis_updated_at, analysis_source_record_count, analysis_latest_record_at, planner_options')
      .eq('user_id', userId)
      .maybeSingle()),
    observation.time('quota', () => service
      .from('study_plan_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('job_type', 'replan')
      .in('status', ['queued', 'running', 'completed'])
      .gte('created_at', adjustmentMonth.startsAt)
      .lt('created_at', adjustmentMonth.endsAt))
  ])

  // Most calendar reads only load the saved plan. Fill the horizon when a local date advances.
  if (planResult.data?.adaptive_through) {
    const saved = planResult.data.preferences_snapshot as Record<string, unknown>
    const current = plannerConfig(profileResult.data, { ...saved, ...(planResult.data.goals_snapshot as Record<string, unknown>) })
    const previous = plannerConfig(null, { ...saved, ...(planResult.data.goals_snapshot as Record<string, unknown>) }, true)
    const horizon = addDaysToDateKey(getDateKeyInTimeZone(new Date(), current.preferences.timezone), 6)
    const through = planResult.data.period_end < horizon ? planResult.data.period_end : horizon
    const dirty = await service.from('study_plan_tasks').select('id')
      .eq('plan_id', planResult.data.id).in('status', ['completed', 'skipped'])
      .gt('updated_at', planResult.data.adaptation_applied_at ?? planResult.data.created_at).limit(1)
    if (planResult.data.adaptive_through < through || dirty.data?.length
      || JSON.stringify(current) !== JSON.stringify(previous)) {
      const changed = await refreshRollingPlan(service, userId, 'calendar').catch(() => false)
      if (changed) {
        const updated = await service.from('study_plans')
          .select('id, user_id, version, status, current_phase, period_start, period_end, diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at, created_at, adaptive_through, adaptation_reason, adaptation_applied_at')
          .eq('id', planResult.data.id).eq('user_id', userId).maybeSingle()
        if (updated.data) planResult.data = updated.data
      }
    }
  }

  let tasks: unknown[] = []
  if (planResult.data) {
    const planId = planResult.data.id
    const { data: taskData } = await observation.time('tasks', () => service
        .from('study_plan_tasks')
        .select('id, plan_id, user_id, scheduled_date, task_type, source, question_id, title, description, difficulty, priority, focus_criteria, focus_error_tags, estimated_minutes, status, writing_record_id, draft_id, started_at, completed_at, skip_reason, generated_reason, writing_mode, question_source, original_question_source, fallback_reason, training_reason, assigned_questions, is_locked, created_at, updated_at')
        .eq('plan_id', planId)
        .order('scheduled_date', { ascending: true }))
    tasks = (taskData ?? []).map((t) => mapTask(t as Record<string, unknown>))
  } else {
    observation.record('tasks', 0)
  }

  return observation.respond({
    success: true,
    plan: planResult.data ? mapPlan(planResult.data, tasks) : null,
    profile: profileResult.data ? mapProfile(profileResult.data) : null,
    quota: studyPlanAdjustmentQuota(quotaResult.count ?? 0)
  })
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
    adaptationReason: row.adaptation_reason,
    adaptiveThrough: row.adaptive_through,
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
  const assigned = Object.values((row.assigned_questions ?? {}) as QuestionAssignments)
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
    trainingReason: row.training_reason ?? undefined,
    assignedSourceCounts: {
      bank: assigned.filter(item => item?.actual === 'question_bank').length,
      ai: assigned.filter(item => item?.actual === 'ai_generated').length,
      unavailable: assigned.filter(item => item?.actual === null).length
    },
    hasAssignedMock: Boolean(row.task_type === 'full_test'
      && (row.assigned_questions as { task1?: { question?: unknown } })?.task1?.question
      && (row.assigned_questions as { task2?: { question?: unknown } })?.task2?.question),
    updatedAt: row.updated_at
  }
}

function mapProfile(
  row: Record<string, unknown>
) {
  const storedSnapshot = row.analysis_snapshot && typeof row.analysis_snapshot === 'object'
    ? row.analysis_snapshot as Record<string, unknown>
    : null

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
    aiGeneratedRatio: row.ai_generated_ratio ?? 20,
    plannerOptions: row.planner_options ?? {},
    analysisSnapshot: storedSnapshot,
    analysisUpdatedAt: row.analysis_updated_at ?? null,
    analysisSourceRecordCount: row.analysis_source_record_count ?? null,
    analysisLatestRecordAt: row.analysis_latest_record_at ?? null
  }
}
