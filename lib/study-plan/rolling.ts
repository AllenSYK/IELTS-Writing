import { createHash, randomUUID } from 'node:crypto'
import { addDaysToDateKey, getDateKeyInTimeZone } from '@/lib/date-utils'
import type { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { loadFullWritingRecordsForUser } from '@/lib/server-writing-records'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { allocateTraining, type TrainingReason, type TrainingTask } from '@/lib/study-plan/allocator'
import { adaptiveProfileColumns, plannerConfig } from '@/lib/study-plan/config'
import { materializeTraining } from '@/lib/study-plan/materialize'
import type { AssignedTrainingTask, QuestionAssignments } from '@/lib/study-plan/question-allocation'
import type { StudyPlanDiagnosis } from '@/lib/study-plan-types'

type Service = ReturnType<typeof createSupabaseServiceRoleClient>
type Trigger = 'calendar' | 'completion' | 'skip' | 'settings'

function allocationEvidence(diagnosis: StudyPlanDiagnosis, sensitivity: string) {
  const step = sensitivity === 'conservative' ? 1 : sensitivity === 'active' ? 0.25 : 0.5
  return JSON.stringify((['task1', 'task2'] as const).map(mode => {
    const ability = diagnosis.taskAbilities?.[mode]
    const score = mode === 'task1' ? diagnosis.task1Average : diagnosis.task2Average
    return [ability?.confidence, ability?.confidence === 'low' || score == null ? null : Math.round(score / step),
      Object.entries(ability?.criteria ?? {}).sort((a, b) => a[1] - b[1])[0]?.[0],
      ability?.errors.filter(error => error.frequency >= 2 && (error.recentRate ?? 0) > 0).slice(0, 2).map(error => error.tag),
      (ability?.trend7 ?? ability?.trend30 ?? 0) >= 0.5]
  }))
}

function carryQuestion(task: TrainingTask, previous: {
  question_id: string | null; question_source: string; original_question_source: string | null;
  fallback_reason: string | null; assigned_questions: unknown
}): AssignedTrainingTask {
  return {
    ...task, questionId: previous.question_id, questionSource: previous.question_source as AssignedTrainingTask['questionSource'],
    originalQuestionSource: previous.original_question_source as AssignedTrainingTask['originalQuestionSource'],
    fallbackReason: previous.fallback_reason, assignedQuestions: previous.assigned_questions as QuestionAssignments
  }
}

export async function refreshRollingPlan(service: Service, userId: string, trigger: Trigger, settings = {}) {
  const [plan, profile] = await Promise.all([
    service.from('study_plans').select('id, period_start, period_end, diagnosis, preferences_snapshot, goals_snapshot, adaptive_through, adaptation_key, adaptation_applied_at')
      .eq('user_id', userId).eq('status', 'active').not('adaptive_through', 'is', null).maybeSingle(),
    service.from('study_plan_profiles').select(adaptiveProfileColumns).eq('user_id', userId).maybeSingle()
  ])
  if (plan.error || profile.error) throw new Error('STUDY_PLAN_ROLLING_LOAD_FAILED')
  const current = plan.data
  if (!current?.adaptive_through) return false
  const { preferences, goals } = plannerConfig(profile.data, {
    ...(current.preferences_snapshot as Record<string, unknown>), ...(current.goals_snapshot as Record<string, unknown>), ...settings
  }, false)
  const now = new Date()
  const today = getDateKeyInTimeZone(now, preferences.timezone)
  const calendarLimit = addDaysToDateKey(today, 6)
  const storedGoals = current.goals_snapshot as { examDate?: string }
  const periodEnd = goals.examDate ?? (storedGoals?.examDate ? addDaysToDateKey(today, 27) : current.period_end)
  const through = calendarLimit < periodEnd ? calendarLimit : periodEnd
  const settingsChanged = JSON.stringify(preferences) !== JSON.stringify(plannerConfig(null, current.preferences_snapshot as Record<string, unknown>, true).preferences)
    || goals.overallTarget !== (current.goals_snapshot as typeof goals)?.overallTarget
    || goals.task1Target !== (current.goals_snapshot as typeof goals)?.task1Target
    || goals.task2Target !== (current.goals_snapshot as typeof goals)?.task2Target
    || goals.examDate !== storedGoals?.examDate

  const lease = randomUUID()
  const leaseCutoff = new Date(now.getTime() - 5 * 60_000).toISOString()
  const claim = await service.from('study_plans')
    .update({ adaptation_lease: lease, adaptation_started_at: now.toISOString() })
    .eq('id', current.id).eq('user_id', userId).eq('status', 'active').eq('adaptive_through', current.adaptive_through)
    .or(`adaptation_lease.is.null,adaptation_started_at.lt.${leaseCutoff}`)
    .filter('adaptation_key', current.adaptation_key === null ? 'is' : 'eq', current.adaptation_key)
    .select('id').maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) return false

  try {
    const [records, existing] = await Promise.all([
      loadFullWritingRecordsForUser(service, userId),
      service.from('study_plan_tasks')
        .select('id, task_type, scheduled_date, status, skip_reason, estimated_minutes, started_at, draft_id, is_locked, question_id, question_source, original_question_source, fallback_reason, assigned_questions, training_reason, updated_at')
        .eq('plan_id', current.id).eq('user_id', userId).gte('scheduled_date', addDaysToDateKey(today, -21))
        .order('scheduled_date').order('id')
    ])
    if (existing.error) throw existing.error
    const diagnosis = buildStudyPlanDiagnosis(records, now)
    const rows = existing.data ?? []
    const outcomes = rows
      .map(row => ({ taskType: row.task_type, scheduledDate: row.scheduled_date, status: row.status,
        skipReason: row.skip_reason, estimatedMinutes: row.estimated_minutes,
        focusTask: (row.training_reason as TrainingReason | null)?.focusTask, criterion: (row.training_reason as TrainingReason | null)?.criterion }))
    const eventKey = createHash('sha256').update(JSON.stringify([
      today, through, preferences, goals, records.slice(0, 30).map(row => [row.id, row.submittedAt]),
      rows.filter(row => row.status === 'completed' || row.status === 'skipped').map(row => [row.id, row.status, row.skip_reason])
    ])).digest('hex')
    if (eventKey === current.adaptation_key) {
      const observedAt = rows.filter(row => row.status === 'completed' || row.status === 'skipped')
        .reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, current.adaptation_applied_at ?? '')
      if (observedAt && observedAt !== current.adaptation_applied_at) {
        await service.from('study_plans').update({ adaptation_applied_at: observedAt })
          .eq('id', current.id).eq('user_id', userId).eq('adaptation_lease', lease)
      }
      return false
    }
    const newSkip = rows.some(row => row.status === 'skipped'
      && (!current.adaptation_applied_at || row.updated_at > current.adaptation_applied_at))
    const evidenceChanged = allocationEvidence(diagnosis, preferences.adjustmentSensitivity)
      !== allocationEvidence(current.diagnosis as StudyPlanDiagnosis, preferences.adjustmentSensitivity)
    const reallocate = settingsChanged || trigger === 'settings' || trigger === 'skip' || newSkip || evidenceChanged
    const tomorrow = addDaysToDateKey(today, 1)
    const firstUnplanned = addDaysToDateKey(current.adaptive_through, 1)
    const earliest = settingsChanged || trigger === 'settings' ? today : tomorrow
    const start = reallocate || earliest > firstUnplanned ? earliest : firstUnplanned
    const reservedDates = rows.filter(row => row.scheduled_date >= earliest
      && (row.scheduled_date < start || row.status !== 'pending' || row.is_locked || row.started_at || row.draft_id))
      .map(row => row.scheduled_date)
    const draft = allocateTraining({ start: earliest, end: through, anchor: current.period_start, preferences, goals, diagnosis, outcomes, reservedDates })
      .filter(task => task.scheduledDate >= start)
    const rotateType = rows.filter(row => row.status === 'skipped' && row.skip_reason === 'not_interested'
      && (!current.adaptation_applied_at || row.updated_at > current.adaptation_applied_at)).at(-1)?.task_type
    const ratioChanged = preferences.questionBankRatio !== (current.preferences_snapshot as typeof preferences)?.questionBankRatio
    const carry = new Map<TrainingTask, AssignedTrainingTask>()
    let rotated = false
    for (const task of draft) {
      if (ratioChanged || !(task.writingMode || task.taskType === 'full_test')) continue
      const previous = rows.find(row => row.scheduled_date === task.scheduledDate && row.task_type === task.taskType && row.question_id)
      if (previous && !rotated && task.taskType === rotateType) {
        rotated = true
        continue
      }
      if (previous) carry.set(task, carryQuestion(task, previous))
    }
    const newTasks = draft.filter(task => !carry.has(task))
    const priorCount = rows.filter(row => row.scheduled_date < start || reservedDates.includes(row.scheduled_date))
      .reduce((sum, row) => sum + Object.keys(row.assigned_questions ?? {}).length, 0)
      + [...carry.values()].reduce((sum, task) => sum + Object.keys(task.assignedQuestions).length, 0)
    const assigned = await materializeTraining(service, userId, newTasks, diagnosis, preferences, records, ratioChanged ? 0 : priorCount)
    const tasks = draft.map(task => carry.get(task) ?? assigned.shift()!)
    const reason = settingsChanged || trigger === 'settings' ? '已按最新训练设置更新后续安排。'
      : trigger === 'skip' || newSkip ? '已根据近期跳过原因检查后续训练负荷。'
      : evidenceChanged ? '新批改改变了近期能力画像，已更新后续训练。'
      : start <= through ? '已补充未来一周的训练。' : '已更新能力画像，现有训练安排适用。'
    const result = await service.rpc('commit_adaptive_study_plan', {
      p_plan_id: current.id, p_user_id: userId, p_lease: lease, p_key: eventKey, p_start: start, p_through: through,
      p_period_end: periodEnd, p_diagnosis: diagnosis, p_preferences: preferences, p_goals: goals, p_reason: reason, p_tasks: tasks
    })
    if (result.error) throw result.error
    return result.data === true
  } finally {
    await service.from('study_plans').update({ adaptation_lease: null, adaptation_started_at: null })
      .eq('id', current.id).eq('user_id', userId).eq('adaptation_lease', lease)
  }
}
