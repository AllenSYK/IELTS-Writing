import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { getAiConfig, AiProviderError } from '@/lib/ai-provider'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'
import { getDateKeyInTimeZone, addDaysToDateKey } from '@/lib/date-utils'
import { normalizeStudyPlanTaskType } from '@/lib/study-plan-types'

export async function POST() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: activePlan } = await service
    .from('study_plans')
    .select('id, preferences_snapshot, goals_snapshot')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activePlan) {
    return json({ success: false, message: 'No active plan found' }, { status: 404 })
  }

  const today = getDateKeyInTimeZone()
  const nextWeekStart = addDaysToDateKey(today, 7)
  const nextWeekEnd = addDaysToDateKey(nextWeekStart, 6)

  const { count: existingTasks } = await service
    .from('study_plan_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', activePlan.id)
    .gte('scheduled_date', nextWeekStart)

  if ((existingTasks ?? 0) > 0) {
    return json({ success: false, message: 'Next week tasks already exist' }, { status: 409 })
  }

  const records = await loadWritingRecordsFromServer(userId).catch(() => [])
  const diagnosis = buildStudyPlanDiagnosis(records)

  const preferences = (activePlan.preferences_snapshot ?? {}) as Record<string, unknown>
  const goals = (activePlan.goals_snapshot ?? {}) as Record<string, unknown>

  let tasks: Array<Record<string, unknown>> = []

  try {
    const aiConfig = getAiConfig({ modelEnv: 'QWEN_STUDY_PLAN_MODEL', defaultModel: 'qwen3.5-plus' })
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          {
            role: 'system',
            content: 'You are an IELTS study plan generator. Return a JSON object with a "tasks" array of 5-7 study tasks for one week. Each task: scheduledDate (YYYY-MM-DD), taskType (task1|task2|full_test|grammar_drill|vocabulary_drill|review), source (built_in|weakness_drill|review), title (Chinese, max 30), description (Chinese, max 100), focusCriteria (string[]), focusErrorTags (string[]), estimatedMinutes (10-90), difficulty (easy|medium|hard), priority (1-3), generatedReason (Chinese, max 50), writingMode (task1|task2|null). Return ONLY valid JSON.'
          },
          {
            role: 'user',
            content: JSON.stringify({ today: nextWeekStart, diagnosis, preferences, goals })
          }
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
    const taskArray = Array.isArray(parsed) ? parsed : parsed.tasks ?? []
    tasks = Array.isArray(taskArray) ? taskArray.slice(0, 14) : []
  } catch {
    tasks = buildFallbackNextWeekTasks(nextWeekStart, preferences, diagnosis)
  }

  for (const task of tasks) {
    await service.from('study_plan_tasks').insert({
      plan_id: activePlan.id,
      user_id: userId,
      scheduled_date: task.scheduledDate,
      task_type: normalizeStudyPlanTaskType(task.taskType),
      source: task.source ?? 'built_in',
      title: task.title ?? '',
      description: task.description ?? '',
      focus_criteria: task.focusCriteria ?? [],
      focus_error_tags: task.focusErrorTags ?? [],
      estimated_minutes: task.estimatedMinutes ?? 40,
      difficulty: task.difficulty ?? 'medium',
      priority: task.priority ?? 2,
      generated_reason: task.generatedReason ?? '',
      writing_mode: task.writingMode ?? null,
      status: 'pending'
    })
  }

  await service
    .from('study_plans')
    .update({ period_end: nextWeekEnd })
    .eq('id', activePlan.id)

  return json({ success: true, tasksCreated: tasks.length })
}

function buildFallbackNextWeekTasks(
  startDate: string,
  preferences: Record<string, unknown>,
  diagnosis: ReturnType<typeof buildStudyPlanDiagnosis>
): Array<Record<string, unknown>> {
  const sessions = Math.min(7, Math.max(1, (preferences.sessionsPerWeek as number) ?? 4))
  const minutes = (preferences.minutesPerSession as number) ?? 45
  const tasks: Array<Record<string, unknown>> = []

  for (let i = 0; i < sessions; i++) {
    const date = addDaysToDateKey(startDate, i)
    const isTask1 = i % 3 === 0
    tasks.push({
      scheduledDate: date,
      taskType: isTask1 ? 'task1' : 'task2',
      source: 'built_in',
      title: isTask1 ? 'Task 1 写作训练' : 'Task 2 写作训练',
      description: isTask1 ? '完成一篇 Task 1 写作。' : '完成一篇 Task 2 写作。',
      focusCriteria: isTask1 ? ['Task Achievement'] : ['Task Response'],
      focusErrorTags: diagnosis.priorityErrorTags.slice(0, 2).map((t) => t.tag),
      estimatedMinutes: minutes,
      difficulty: 'medium',
      priority: 2,
      generatedReason: '保持训练频率',
      writingMode: isTask1 ? 'task1' : 'task2'
    })
  }

  return tasks
}
