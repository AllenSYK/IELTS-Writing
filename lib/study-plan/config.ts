import type { PlannerPreferences } from '@/lib/study-plan/allocator'
import type { StudyPlanGoals } from '@/lib/study-plan-types'

export const adaptiveProfileColumns = 'overall_target, task1_target, task2_target, exam_date, sessions_per_week, minutes_per_session, preferred_days, include_full_tests, intensity, allow_timed_practice, question_bank_ratio, ai_generated_ratio, timezone, planner_options'

export function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}

export function plannerConfig(profile: Record<string, unknown> | null, settings: Record<string, unknown>, useInputFirst = false) {
  function value<T>(input: string, column: string, fallback: T): T {
    const hasInput = Object.hasOwn(settings, input)
    const hasProfile = profile && Object.hasOwn(profile, column)
    return (useInputFirst && hasInput ? settings[input] : hasProfile ? profile[column] : hasInput ? settings[input] : fallback) as T
  }
  const options = profile?.planner_options as Record<string, unknown> | undefined
  const option = <T>(key: string, fallback: T): T => (
    useInputFirst ? settings[key] ?? options?.[key] : options?.[key] ?? settings[key]
  ) as T ?? fallback
  const overallTarget = value('overallTarget', 'overall_target', 6.5)
  const preferences: PlannerPreferences = {
    sessionsPerWeek: value('sessionsPerWeek', 'sessions_per_week', 4),
    minutesPerSession: value('minutesPerSession', 'minutes_per_session', 45),
    includeFullTests: value('includeFullTests', 'include_full_tests', true),
    intensity: value('intensity', 'intensity', 'standard'),
    allowTimedPractice: value('allowTimedPractice', 'allow_timed_practice', true),
    preferredDays: value('preferredDays', 'preferred_days', []) ?? [],
    weaknesses: option<string[]>('weaknesses', []),
    rewriteFrequency: option('rewriteFrequency', 'auto_low'),
    mockFrequency: option('mockFrequency', 'auto_sprint'),
    useErrorNotebook: option('useErrorNotebook', true),
    adjustmentSensitivity: option('adjustmentSensitivity', 'standard'),
    questionBankRatio: value('questionBankRatio', 'question_bank_ratio', 80),
    aiGeneratedRatio: value('aiGeneratedRatio', 'ai_generated_ratio', 20),
    timezone: value('timezone', 'timezone', 'Asia/Shanghai')
  }
  try { new Intl.DateTimeFormat('en', { timeZone: preferences.timezone }) }
  catch { preferences.timezone = 'Asia/Shanghai' }
  const examDate = value<string | null>('examDate', 'exam_date', null)
  const goals: StudyPlanGoals = {
    overallTarget,
    task1Target: value('task1Target', 'task1_target', overallTarget),
    task2Target: value('task2Target', 'task2_target', overallTarget),
    ...(examDate && validDateKey(examDate) ? { examDate } : {})
  }
  return { preferences, goals }
}
