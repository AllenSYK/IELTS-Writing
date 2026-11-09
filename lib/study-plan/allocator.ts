import { addDaysToDateKey } from '@/lib/date-utils'
import type { DBStudyPlanTaskType, StudyPlanDiagnosis, StudyPlanGoals, StudyPlanTaskSource } from '@/lib/study-plan-types'
import { normalizeCriterion, type Criterion } from '@/lib/study-plan/criteria'
import { daysBetween, scheduleLearningDays, weekday } from '@/lib/study-plan/scheduler'

type WritingMode = 'task1' | 'task2'
type Phase = 'foundation' | 'focused' | 'integrated' | 'sprint'

export type PlannerPreferences = {
  sessionsPerWeek: number
  minutesPerSession: number
  preferredDays: number[]
  includeFullTests: boolean
  allowTimedPractice: boolean
  intensity: string
  weaknesses: string[]
  mockFrequency: string
  rewriteFrequency: string
  useErrorNotebook: boolean
  adjustmentSensitivity: string
  questionBankRatio: number
  aiGeneratedRatio: number
  timezone: string
}

export type PracticeOutcome = {
  taskType: string
  scheduledDate: string
  status: string
  estimatedMinutes: number
  skipReason?: string | null
  focusTask?: WritingMode | 'both'
  criterion?: Criterion
}

export type TrainingReason = {
  phase: Phase
  focusTask: WritingMode | 'both'
  criterion?: Criterion
  target?: number
  estimate?: number | null
  confidence?: 'low' | 'medium' | 'high'
  kind: 'diagnostic' | 'writing' | 'mock' | 'drill' | 'rewrite' | 'recovery' | 'self_check'
  recurrence?: number
  timed?: boolean
}

export type TrainingTask = {
  scheduledDate: string
  taskType: DBStudyPlanTaskType
  source: StudyPlanTaskSource
  title: string
  description: string
  focusCriteria: Criterion[]
  focusErrorTags: string[]
  estimatedMinutes: number
  difficulty: 'easy' | 'medium' | 'hard'
  priority: number
  generatedReason: string
  writingMode: WritingMode | null
  reason: TrainingReason
}

const modes = ['task1', 'task2'] as const
const fullMinutes = { task1: 20, task2: 40 } as const
const focusInstructions: Record<Criterion, [string, string]> = {
  taskAchievement: ['Overview 与要点选择', '用自己最近的一道 Task 1 题，选出两个最显著特征。先写一句 Overview，再写两句比较或阶段概述；检查是否覆盖了这两个特征。'],
  taskResponse: ['观点与论证', '用最近一道 Task 2 题，写一句直接回答题目的观点，再写一段，包含论点、原因和例子。划出例子与观点的联系。'],
  coherenceCohesion: ['段落衔接', '选出最近作文的一段，给每句标记用途：论点、解释或例证。调整顺序并重写一处衔接，再通读确认逻辑。'],
  lexicalResource: ['词汇与搭配', '从近期作文中找三个重复或含义不准确的词组，核对搭配后改写原句，并用其中一个词组另写一句。'],
  grammaticalRangeAccuracy: ['语法与改写', '从最近作文中挑三句，逐句检查主谓、时态及句子边界。圈出错误并重写，再比较修改前后的意思。']
}

function phaseFor(date: string, examDate: string | undefined, diagnosis: StudyPlanDiagnosis): Phase {
  const remaining = examDate ? daysBetween(date, examDate) : Infinity
  if (remaining <= 7) return 'sprint'
  if (remaining <= 21) return 'integrated'
  if (diagnosis.profileConfidence === 'low') return 'foundation'
  return remaining <= 42 || diagnosis.profileConfidence === 'high' ? 'integrated' : 'focused'
}

export function allocateTraining({
  start, end, anchor = start, preferences, goals, diagnosis, outcomes = [], reservedDates = []
}: {
  start: string; end: string; anchor?: string; preferences: PlannerPreferences; goals: StudyPlanGoals
  diagnosis: StudyPlanDiagnosis; outcomes?: PracticeOutcome[]; reservedDates?: string[]
}): TrainingTask[] {
  const effectiveEnd = goals.examDate && goals.examDate < end ? goals.examDate : end
  const dates = scheduleLearningDays(start, effectiveEnd, preferences.sessionsPerWeek, preferences.preferredDays, anchor)
    .filter(day => !reservedDates.includes(day.date))
  const available = preferences.minutesPerSession
  const recent = outcomes.filter(task => task.scheduledDate < start && task.scheduledDate >= addDaysToDateKey(start, -21))
  const skipped = recent.filter(task => task.status === 'skipped')
  const recentSkip = skipped.at(-1)
  const sensitivity = preferences.adjustmentSensitivity === 'active' ? 1 : preferences.adjustmentSensitivity === 'conservative' ? 3 : 2
  const reducedLoad = recentSkip?.skipReason === 'no_time' || skipped.filter(task => ['no_time', 'too_hard'].includes(task.skipReason ?? '')).length >= sensitivity
    || (recent.length >= 4 && recent.filter(task => task.status === 'completed').length * 2 < recent.length)
  const limit = Math.min(available, reducedLoad || preferences.intensity === 'relaxed' ? Math.max(10, Math.floor(available * 0.8 / 5) * 5) : available)
  const loads = { task1: 0, task2: 0 }
  const reserved = outcomes.filter(task => task.scheduledDate >= addDaysToDateKey(start, -6)
    && (task.status === 'completed' || reservedDates.includes(task.scheduledDate)) && task.status !== 'skipped')
  const existingMocks = new Set(reserved.filter(task => task.taskType === 'full_test')
    .map(task => Math.floor(daysBetween(anchor, task.scheduledDate) / 7)))
  for (const task of reserved) {
    const mode = task.focusTask ?? task.taskType
    if (mode === 'task1' || mode === 'task2') loads[mode] += task.estimatedMinutes
    else if (task.taskType === 'full_test') { loads.task1 += 20; loads.task2 += 40 }
  }
  const assessed = new Set<WritingMode>(modes.filter(mode => loads[mode] > 0))
  const tasks: TrainingTask[] = []

  const individualWeightedTarget = ((goals.task1Target ?? goals.overallTarget) + 2 * (goals.task2Target ?? goals.overallTarget)) / 3
  const overallShortfall = Math.max(0, goals.overallTarget - individualWeightedTarget)
  const profiles = Object.fromEntries(modes.map(mode => {
    const ability = diagnosis.taskAbilities?.[mode]
    const target = Math.min(9, Math.round(10 * (((mode === 'task1' ? goals.task1Target : goals.task2Target) ?? goals.overallTarget) + overallShortfall)) / 10)
    const estimate = mode === 'task1' ? diagnosis.task1Average : diagnosis.task2Average
    const confidence = ability?.confidence ?? diagnosis.profileConfidence
    const valid = (key: Criterion) => key !== (mode === 'task1' ? 'taskResponse' : 'taskAchievement')
    const ranked = Object.entries(ability?.criteria ?? {})
      .map(([key, score]) => [normalizeCriterion(key), score] as const)
      .filter((item): item is readonly [Criterion, number] => Boolean(item[0]) && item[1] !== undefined)
      .filter(([key]) => valid(key))
      .sort((a, b) => a[1] - b[1])
    const mastered = recentSkip?.skipReason === 'already_mastered' && recentSkip.focusTask === mode ? recentSkip.criterion : undefined
    const weakest = (ranked.find(([key]) => key !== mastered) ?? ranked[0])?.[0]
    const oldCriteria = diagnosis.weakestCriteria.map(normalizeCriterion)
      .find((key): key is Criterion => Boolean(key && valid(key)))
    const criterion = preferences.weaknesses.includes('grammar') ? 'grammaticalRangeAccuracy'
      : mode === 'task1' && preferences.weaknesses.some(key => key === 'task1_overview' || key === 'task1_data')
        ? 'taskAchievement' : weakest ?? oldCriteria ?? (mode === 'task1' ? 'taskAchievement' : 'taskResponse')
    const recurring = (ability?.errors ?? []).filter(error => error.frequency > 1 && (error.recentRate ?? 0) > 0)
    const gap = confidence === 'low' ? 0 : Math.max(0, target - (estimate ?? target))
    const skillGap = confidence === 'low' ? 0 : Math.max(0, target - (ability?.criteria[criterion] ?? target))
    const recurrenceBoost = recurring.some(error => (error.recentRate ?? 0) > (error.earlierRate ?? 0)) ? 0.25 : 0
    // Start from exam weighting. Add at most two bands of gap and one band of neglect;
    // taper the gap signal once repeated recent essays show improvement.
    const neglected = ability?.lastPracticedAt
      ? Math.min(1, Math.max(0, daysBetween(ability.lastPracticedAt.slice(0, 10), start) / 21)) : 1
    const progress = (ability?.trend7 ?? ability?.trend30 ?? 0) >= 0.5 ? 0.5 : 1
    const weight = (mode === 'task2' ? 2 : 1) * (1 + Math.min(2, gap) * progress + Math.min(0.25, skillGap / 8) + neglected / 2 + recurrenceBoost)
    return [mode, { mode, target, estimate, confidence, criterion, recurring, weight }]
  })) as Record<WritingMode, {
    mode: WritingMode; target: number; estimate: number | null; confidence: StudyPlanDiagnosis['profileConfidence']
    criterion: Criterion; recurring: NonNullable<StudyPlanDiagnosis['taskAbilities']>['task1']['errors']; weight: number
  }>

  const mockDates = new Set<string>()
  if (preferences.includeFullTests && preferences.allowTimedPractice && limit >= 60 && preferences.mockFrequency !== 'none') {
    const weeks = new Map<number, typeof dates>()
    for (const day of dates) {
      const week = Math.floor(daysBetween(anchor, day.date) / 7)
      weeks.set(week, [...(weeks.get(week) ?? []), day])
    }
    for (const [week, days] of weeks) {
      if (existingMocks.has(week)) continue
      const eligible = days.filter(day => preferences.mockFrequency === 'weekly'
        || (preferences.mockFrequency === 'biweekly' && week % 2 === 0)
        || (preferences.mockFrequency === 'auto_sprint' && phaseFor(day.date, goals.examDate, diagnosis) === 'sprint'))
      const pick = eligible.find(day => weekday(day.date) === 6 || weekday(day.date) === 0) ?? eligible.at(-1)
      if (pick) mockDates.add(pick.date)
    }
  }

  const rewrites = new Map<number, number>()
  const softened = new Set<WritingMode>()
  for (const day of dates) {
    const phase = phaseFor(day.date, goals.examDate, diagnosis)
    const base = { scheduledDate: day.date, difficulty: phase === 'sprint' ? 'hard' : 'medium' } as const
    if (mockDates.has(day.date)) {
      tasks.push({ ...base, taskType: 'full_test', source: 'past_paper', title: '完整模考',
        description: '完成 Task 1（20 分钟）和 Task 2（40 分钟）。', estimatedMinutes: 60, priority: 1,
        focusCriteria: ['taskAchievement', 'taskResponse'], focusErrorTags: [], writingMode: null,
        generatedReason: '训练设置允许完整模考，且本日有至少 60 分钟。',
        reason: { phase, focusTask: 'both', kind: 'mock' } })
      loads.task1 += 20
      loads.task2 += 40
      assessed.add('task1')
      assessed.add('task2')
      continue
    }
    const [first, second] = modes
    const totalWeight = profiles.task1.weight + profiles.task2.weight
    const totalMinutes = loads.task1 + loads.task2 + limit
    const deficit = (mode: WritingMode) => totalMinutes * profiles[mode].weight / totalWeight - loads[mode]
    const mode = assessed.has(first) !== assessed.has(second)
      ? assessed.has(first) ? second : first
      : deficit(second) >= deficit(first) ? second : first
    const profile = profiles[mode]
    const hasEvidence = profile.confidence !== 'low'
    const focusCriteria = [profile.criterion]
    const focusErrorTags = preferences.useErrorNotebook ? profile.recurring.slice(0, 2).map(error => error.tag) : []
    const generatedReason = hasEvidence
      ? `${mode === 'task1' ? 'Task 1' : 'Task 2'} 近期估计 ${profile.estimate ?? '暂无'}，目标 ${profile.target}。${focusErrorTags.length ? '近期重复错误优先练习。' : '按分数差距和近期训练量分配。'}`
      : '对应题型的近期样本不足，安排训练以收集诊断依据。'
    const reason = { phase, focusTask: mode, criterion: profile.criterion, target: profile.target,
      estimate: profile.estimate, confidence: profile.confidence, recurrence: profile.recurring[0]?.frequency }
    const [focusTitle, baseInstruction] = focusInstructions[profile.criterion]
    const focusInstruction = focusErrorTags.length
      ? `${baseInstruction} 打开错题本，挑选一个同类错误验证修改。`
      : baseInstruction
    const week = Math.floor(daysBetween(anchor, day.date) / 7)
    const rewriteQuota = preferences.rewriteFrequency === 'weekly_2' ? 2
      : preferences.rewriteFrequency === 'weekly_1' || (preferences.rewriteFrequency === 'auto_low' && focusErrorTags.length) ? 1 : 0
    const rewrite = hasEvidence && assessed.has(mode) && (rewrites.get(week) ?? 0) < rewriteQuota
      && phase !== 'sprint' && (focusErrorTags.length > 0 || preferences.rewriteFrequency.startsWith('weekly_'))
    const hasStruggled = !softened.has(mode) && (
      (recentSkip?.skipReason === 'too_hard' && (recentSkip.focusTask ?? recentSkip.taskType) === mode)
      || (diagnosis.taskAbilities?.[mode]?.trend7 ?? 0) <= -0.5
    )
    if (hasStruggled) softened.add(mode)
    const full = !day.recovery && !rewrite && !hasStruggled && limit >= fullMinutes[mode]
    assessed.add(mode)
    if (full) {
      const minutes = fullMinutes[mode]
      loads[mode] += minutes
      tasks.push({ ...base, taskType: mode, source: 'past_paper',
        title: `${mode === 'task1' ? 'Task 1' : 'Task 2'} · ${hasEvidence ? focusTitle : '诊断写作'}`,
        description: `完成一篇作文，重点检查${focusTitle}。${preferences.allowTimedPractice ? '按考试时长练习。' : '可以分段完成。'}`,
        focusCriteria, focusErrorTags, estimatedMinutes: minutes, priority: 1, generatedReason, writingMode: mode,
        reason: { ...reason, timed: preferences.allowTimedPractice, kind: hasEvidence ? 'writing' : 'diagnostic' } })
      if (limit - minutes >= 5) {
        const followUp = Math.min(limit - minutes, preferences.intensity === 'intensive' ? 30 : 25)
        tasks.push({ ...base, taskType: 'review', source: 'review', difficulty: 'easy', title: '写作自检与修改',
          description: followUp >= 15 ? focusInstruction : '重读刚写的作文，找出并重写一句最影响理解的句子。',
          focusCriteria, focusErrorTags, estimatedMinutes: followUp, priority: 2, generatedReason,
          writingMode: null, reason: { ...reason, kind: 'self_check' } })
        loads[mode] += followUp
      }
    } else {
      if (rewrite) rewrites.set(week, (rewrites.get(week) ?? 0) + 1)
      const minutes = Math.min(limit, day.recovery ? 15 : preferences.intensity === 'intensive' ? 40 : 30)
      loads[mode] += minutes
      const skill = profile.criterion
      const noSampleInstruction = mode === 'task1'
        ? '从平台题库选一道 Task 1 题，写两句 Overview，再标出两个能支撑概述的数据或关键阶段。'
        : '从平台题库选一道 Task 2 题，写一个观点句和一个论证段。读一遍，确认例子支持观点。'
      tasks.push({ ...base, taskType: day.recovery ? 'review' : skill === 'grammaticalRangeAccuracy' ? 'grammar_drill' : skill === 'lexicalResource' ? 'vocabulary_drill' : 'review',
        source: day.recovery ? 'review' : 'weakness_drill', difficulty: day.recovery ? 'easy' : 'medium',
        title: day.recovery ? '轻量复习' : `${rewrite ? '作文修改' : '专项练习'} · ${focusTitle}`,
        description: profile.estimate === null ? noSampleInstruction : focusInstruction,
        focusCriteria, focusErrorTags, estimatedMinutes: minutes, priority: 2,
        generatedReason: day.recovery ? '连续三个学习日后降低负荷，保留原定学习日。'
          : hasStruggled ? '近期这类训练遇到困难，先拆成专项练习。' : generatedReason,
        writingMode: null, reason: { ...reason, kind: day.recovery ? 'recovery' : rewrite ? 'rewrite' : 'drill' } })
    }
  }
  return tasks
}
