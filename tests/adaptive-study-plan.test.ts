import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDateKeyInTimeZone } from '@/lib/date-utils'
import { allocateTraining, type PlannerPreferences } from '@/lib/study-plan/allocator'
import { scheduleLearningDays, selectLearningDays } from '@/lib/study-plan/scheduler'
import { buildStudyPlanDiagnosis } from '@/lib/study-plan-diagnosis'
import { assignTrainingQuestions, focusQuestionTypes, requestedQuestionSources } from '@/lib/study-plan/question-allocation'
import type { WritingRecord } from '@/lib/writing-record-types'
import type { WritingQuestion } from '@/lib/ielts-questions'

const now = new Date('2026-11-09T12:00:00Z')
const empty = buildStudyPlanDiagnosis([], now)
const preferences: PlannerPreferences = {
  sessionsPerWeek: 4, minutesPerSession: 45, preferredDays: [], includeFullTests: true, allowTimedPractice: true,
  intensity: 'standard', weaknesses: [], mockFrequency: 'auto_sprint', rewriteFrequency: 'none',
  useErrorNotebook: true, adjustmentSensitivity: 'standard', questionBankRatio: 80, aiGeneratedRatio: 20, timezone: 'Europe/London'
}
const goals = { overallTarget: 7 }
const window = { start: '2026-11-09', end: '2026-11-15' }
const day = 86_400_000

function essay(mode: 'task1' | 'task2', age: number, score: number, weak = 'Coherence and Cohesion', grammar = false) {
  return {
    id: `${mode}-${age}`, taskType: mode, questionType: mode === 'task1' ? 'bar_chart' : 'problem_solution',
    submittedAt: new Date(now.getTime() - age * day).toISOString(),
    evaluation: {
      overallBand: String(score), criteria: { [weak]: { score: '5' } },
      annotations: grammar ? [{ category: 'grammar' }, { category: 'grammar' }] : [],
      sentenceAnnotations: grammar ? [{ category: 'grammar' }] : []
    }
  } as unknown as WritingRecord
}

function history(t1: number, t2: number, weak?: string) {
  return [1, 4, 8, 12, 20, 31].flatMap(age => [essay('task1', age, t1, weak), essay('task2', age, t2, weak)])
}

test('calendar spreads the default week and preserves explicitly selected days', () => {
  for (const sessions of [3, 4, 5, 6, 7]) {
    assert.equal(selectLearningDays(sessions).length, sessions)
    assert.equal(scheduleLearningDays('2026-12-29', '2027-01-04', sessions, []).length, sessions)
  }
  assert.notDeepEqual(selectLearningDays(4), [1, 2, 3, 4])
  assert.equal(selectLearningDays(4, [0, 2]).length, 4)
  assert.ok([0, 2].every(value => selectLearningDays(4, [0, 2]).includes(value)))
  assert.deepEqual(selectLearningDays(3, [1, 3, 5, 0]), [1, 3, 5, 0])
  assert.equal(scheduleLearningDays('2026-11-13', '2026-11-16', 7, [], '2026-11-09').at(-1)?.recovery, true)
  assert.equal(scheduleLearningDays('2026-11-09', '2026-11-15', 7, []).filter(x => x.recovery).length, 1)
})

test('calendar keys stay correct across London DST and Shanghai day boundaries', () => {
  for (const [instant, london, shanghai] of [
    ['2026-03-28T23:45:00Z', '2026-03-28', '2026-03-29'],
    ['2026-03-29T23:45:00Z', '2026-03-30', '2026-03-30'],
    ['2026-10-25T23:45:00Z', '2026-10-25', '2026-10-26'],
    ['2026-12-31T20:00:00Z', '2026-12-31', '2027-01-01']
  ]) {
    assert.equal(getDateKeyInTimeZone(instant, 'Europe/London'), london)
    assert.equal(getDateKeyInTimeZone(instant, 'Asia/Shanghai'), shanghai)
  }
})

test('allocation honors time and exam cutoffs at each intensity and preserves a mock on a recovery date', () => {
  for (const minutesPerSession of [20, 30, 45, 60, 90]) {
    for (const intensity of ['relaxed', 'standard', 'intensive']) {
      const settings = { ...preferences, minutesPerSession, intensity, sessionsPerWeek: 7, mockFrequency: 'weekly' }
      const tasks = allocateTraining({ ...window, preferences: settings, goals, diagnosis: empty })
      assert.equal(new Set(tasks.map(task => task.scheduledDate)).size, 7)
      for (const date of new Set(tasks.map(task => task.scheduledDate))) {
        const daily = tasks.filter(task => task.scheduledDate === date)
        assert.ok(daily.reduce((sum, task) => sum + task.estimatedMinutes, 0) <= minutesPerSession)
        assert.ok(daily.length <= 2)
      }
      for (const task of tasks) {
        if (task.taskType === 'task1') assert.equal(task.estimatedMinutes, 20)
        if (task.taskType === 'task2') assert.equal(task.estimatedMinutes, 40)
        if (task.taskType === 'full_test') assert.equal(task.estimatedMinutes, 60)
      }
      if (minutesPerSession < 60) assert.ok(!tasks.some(task => task.taskType === 'full_test'))
      if (minutesPerSession < 40) assert.ok(!tasks.some(task => task.taskType === 'task2'))
    }
  }
  const mock = allocateTraining({ start: '2026-11-11', end: '2026-11-17',
    preferences: { ...preferences, sessionsPerWeek: 7, minutesPerSession: 60, mockFrequency: 'weekly' },
    goals: { ...goals, examDate: '2026-11-14' }, diagnosis: empty })
  assert.equal(mock.find(task => task.taskType === 'full_test')?.scheduledDate, '2026-11-14')
  assert.ok(mock.every(task => task.scheduledDate <= '2026-11-14'))
  const untimed = allocateTraining({ ...window, preferences: { ...preferences, allowTimedPractice: false, minutesPerSession: 90, mockFrequency: 'weekly' }, goals, diagnosis: empty })
  assert.ok(!untimed.some(task => task.taskType === 'full_test'))
  assert.ok(untimed.filter(task => task.writingMode).every(task => task.reason.timed === false))
})

test('diagnosis distinguishes missing, limited, stable, improving and declining evidence', () => {
  assert.equal(empty.dataSufficiency, 'none')
  assert.equal(buildStudyPlanDiagnosis([essay('task1', 1, 5.5)], now).dataSufficiency, 'limited')
  assert.equal(buildStudyPlanDiagnosis(history(5.5, 6).slice(0, 4), now).profileConfidence, 'low')
  const baseline = buildStudyPlanDiagnosis(history(5.5, 6), now)
  assert.equal(baseline.profileConfidence, 'high')
  assert.equal(baseline.currentAverage, 5.8)
  assert.equal(baseline.taskAbilities?.task1.criteria.coherenceCohesion, 5)
  assert.equal(baseline.task1SubtypePerformance.bar, 5.5)
  assert.equal(baseline.task2SubtypePerformance.problem_solution, 6)
  const trends = buildStudyPlanDiagnosis([essay('task1', 1, 7), essay('task1', 4, 7), essay('task1', 10, 6),
    essay('task1', 12, 6), essay('task2', 1, 5), essay('task2', 4, 5), essay('task2', 10, 6), essay('task2', 12, 6)], now)
  assert.equal(trends.taskAbilities?.task1.trend7, 1)
  assert.equal(trends.taskAbilities?.task2.trend7, -1)
  const outlier = buildStudyPlanDiagnosis([...history(6, 6), essay('task2', 0, 8.5)], now)
  assert.ok(outlier.task2Average! < 6.6)
  assert.equal(outlier.taskAbilities?.task2.trend7, 0)
})

test('ordinary grammar feedback counts once per essay and changes the actual drill', () => {
  const grammar = buildStudyPlanDiagnosis([1, 4, 8].flatMap(age =>
    [essay('task1', age, 6, 'Grammar', true), essay('task2', age, 6, 'Grammatical Range and Accuracy', true)]), now)
  assert.deepEqual(grammar.taskAbilities?.task2.errors.map(item => [item.tag, item.frequency]), [['grammar', 3]])
  const base = { ...window, preferences: { ...preferences, minutesPerSession: 30 }, goals }
  const gramTasks = allocateTraining({ ...base, diagnosis: grammar })
  const coherence = allocateTraining({ ...base, diagnosis: buildStudyPlanDiagnosis(history(6, 6), now) })
  assert.ok(gramTasks.some(task => task.taskType === 'grammar_drill'))
  assert.ok(coherence.some(task => task.reason.focusTask === 'task2' && task.focusCriteria.includes('coherenceCohesion')))
  assert.ok(!coherence.some(task => task.taskType === 'grammar_drill'))
})

test('exam weights, gaps and skip feedback change time allocation', () => {
  const base = { ...window, preferences: { ...preferences, sessionsPerWeek: 6 }, goals }
  const t1Weak = allocateTraining({ ...base, diagnosis: buildStudyPlanDiagnosis(history(4.5, 7.5, 'Lexical Resource'), now) })
  const t2Weak = allocateTraining({ ...base, diagnosis: buildStudyPlanDiagnosis(history(7.5, 4.5, 'Lexical Resource'), now) })
  const time = (tasks: typeof t1Weak, mode: string) =>
    tasks.filter(task => task.reason.focusTask === mode).reduce((sum, task) => sum + task.estimatedMinutes, 0)
  assert.ok(time(t1Weak, 'task1') > time(t2Weak, 'task1'))
  assert.ok(time(t2Weak, 'task2') > time(t2Weak, 'task1'))
  const noTime = allocateTraining({ ...base, diagnosis: empty,
    outcomes: [{ taskType: 'task2', scheduledDate: '2026-11-08', status: 'skipped', skipReason: 'no_time', estimatedMinutes: 40 }] })
  assert.ok(noTime.every(task => task.taskType !== 'task2'))
  assert.ok(noTime.some(task => task.reason.focusTask === 'task2' && task.reason.kind === 'drill'))
})

test('question assignment uses a global ratio, records fallback and excludes non-writing tasks', async () => {
  for (const ratio of [0, 20, 50, 80, 100]) {
    assert.equal(requestedQuestionSources(7, ratio).filter(source => source === 'question_bank').length, Math.round(7 * ratio / 100))
  }
  const tasks = allocateTraining({ ...window, preferences: { ...preferences, mockFrequency: 'weekly', minutesPerSession: 60 }, goals, diagnosis: empty })
  const question = (taskType: 'task1' | 'task2', index: number): WritingQuestion => ({
    id: `q-${taskType}-${index}`, title: `Prompt ${taskType} ${index}`, promptLead: `Prompt ${taskType} ${index}`,
    promptDetail: '', questionType: taskType === 'task1' ? 'bar_chart' : 'problem_solution',
    taskType, durationMinutes: taskType === 'task1' ? 20 : 40, wordTarget: taskType === 'task1' ? 150 : 250, generatedSource: 'static-bank'
  })
  const diagnosis = buildStudyPlanDiagnosis(history(6, 6), now)
  const preferred = { task1: focusQuestionTypes('task1', diagnosis, []), task2: focusQuestionTypes('task2', diagnosis, []) }
  assert.deepEqual(preferred, { task1: ['bar_chart'], task2: ['problem_solution'] })
  const generated: string[] = []
  const assigned = await assignTrainingQuestions({
    tasks, bankRatio: 50, preferred,
    bank: { task1: [1, 2, 3, 4].map(i => question('task1', i)), task2: [1, 2, 3, 4].map(i => question('task2', i)) },
    generate: async (_mode, subtype) => { generated.push(subtype ?? ''); throw new Error('mock provider failure') }
  })
  const questions = assigned.flatMap(task => Object.values(task.assignedQuestions))
  assert.ok(questions.length > 0)
  assert.ok(generated.length > 0)
  assert.ok(generated.every(type => type === 'bar_chart' || type === 'problem_solution'))
  assert.equal(questions.filter(result => result.expected === 'ai_generated').length, generated.length)
  assert.ok(questions.filter(result => result.expected === 'ai_generated').every(result =>
    result.actual === 'question_bank' && result.fallbackReason === 'AI_GENERATION_FAILED'))
  assert.equal(new Set(questions.map(result => result.question?.id)).size, questions.length)
  assert.ok(assigned.filter(task => task.taskType === 'review').every(task => !Object.keys(task.assignedQuestions).length))
})

test('example: four 45-minute days at Task 1 5.5 / Task 2 6.0, target 7', () => {
  const input = { ...window, preferences, goals, diagnosis: buildStudyPlanDiagnosis(history(5.5, 6), now) }
  const tasks = allocateTraining(input)
  assert.deepEqual(tasks, allocateTraining(input))
  assert.equal(new Set(tasks.map(task => task.scheduledDate)).size, 4)
  assert.equal(tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0), 180)
})
