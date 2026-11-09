import { CriterionKeys, Task1CriterionKeys, Task2CriterionKeys, type EssayEvaluation, type WritingRecord } from '@/lib/writing-record-types'
import type { StudyPlanDiagnosis, StudyPlanTaskAbility } from '@/lib/study-plan-types'
import { normalizeCriterion, type Criterion } from '@/lib/study-plan/criteria'

const categoryTags: Record<string, string> = {
  'task-response': 'incomplete_task_response', task: 'incomplete_task_response',
  coherence: 'unclear_progression', cohesion: 'unclear_progression',
  'unclear-expression': 'unclear_position', repetition: 'repetition',
  vocabulary: 'word_choice', lexical: 'word_choice', collocation: 'collocation',
  style: 'informal_language', spelling: 'spelling', grammar: 'grammar',
  punctuation: 'punctuation', 'sentence-structure': 'sentence_structure'
}

const dayMs = 86_400_000
const taskCriteria = { task1: Task1CriterionKeys, task2: Task2CriterionKeys }

export const diagnosisDefaults = {
  // Decay halves the influence of a month-old essay. Thresholds are planning heuristics.
  halfLifeDays: 30,
  recentWindowDays: 90,
  mediumSamples: 3,
  highSamples: 6
}

function band(value: unknown) {
  const score = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return score >= 0 && score <= 9 ? score : null
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function subtype(type: 'task1' | 'task2', raw: string) {
  const pattern = type === 'task1'
    ? /line|bar|pie|table|mixed|map|process|flow/
    : /agree|opinion|discuss|both|advantages?|disadvantages?|problem|solution|cause|effect|two|double/
  const key = raw.toLowerCase().match(pattern)?.[0]
  if (!key) return null
  return ({
    flow: 'process', agree: 'agree_disagree', opinion: 'agree_disagree', discuss: 'discuss_both', both: 'discuss_both',
    advantage: 'advantages', disadvantage: 'advantages', disadvantages: 'advantages', problem: 'problem_solution',
    solution: 'problem_solution', cause: 'cause_effect', effect: 'cause_effect', two: 'two_part', double: 'two_part'
  } as Record<string, string>)[key] ?? key
}

function average(rows: Array<{ score: number | null; weight: number }>) {
  let sum = 0
  let weight = 0
  for (const row of rows) {
    if (row.score === null) continue
    sum += row.score * row.weight
    weight += row.weight
  }
  return weight > 0 ? round(sum / weight) : null
}

const namedIssues: Array<[RegExp, string]> = [
  [/subject.verb agreement|主谓一致/i, 'subject_verb_agreement'],
  [/articles? (?:are |is )?(?:missing|incorrect)|冠词/i, 'article'],
  [/\b(?:verb )?tense\b|时态/i, 'tense'],
  [/sentence fragment|句子残缺/i, 'sentence_fragment'],
  [/run.on sentence|粘连句/i, 'run_on_sentence'],
  [/overview|总体概述|总览/i, 'overview'],
  [/key (?:features?|data)|关键数据/i, 'key_features'],
  [/comparison|comparative|数据比较/i, 'comparison'],
  [/trend|变化趋势/i, 'trend_description'],
  [/topic sentence|主题句/i, 'weak_topic_sentence'],
  [/supporting evidence|supporting example|论据|举例/i, 'weak_support'],
  [/position|立场/i, 'unclear_position']
]

function annotations(evaluation: EssayEvaluation) {
  // Count at most one named issue per annotation, then deduplicate both representations per essay.
  const tags = new Set<string>()
  for (const item of evaluation.annotations ?? []) {
    const detail = [item.explanationZh, item.explanationEn, item.suggestion].filter(Boolean).join(' ')
    const key = namedIssues.find(([pattern]) => pattern.test(detail))?.[1] ?? categoryTags[item.category]
    if (key) tags.add(key)
  }
  for (const item of evaluation.sentenceAnnotations ?? evaluation.sentenceErrors ?? []) {
    const detail = [item.errorType?.replace(/_/g, ' '), item.explanation].filter(Boolean).join(' ')
    const key = namedIssues.find(([pattern]) => pattern.test(detail))?.[1] ?? categoryTags[item.category]
    if (key) tags.add(key)
  }
  // Prefer concrete evidence if a second feedback representation only provides the generic label.
  if (['subject_verb_agreement', 'article', 'tense', 'sentence_fragment', 'run_on_sentence'].some(tag => tags.has(tag))) tags.delete('grammar')
  return tags
}

export function buildStudyPlanDiagnosis(records: WritingRecord[], now = new Date(), config = diagnosisDefaults): StudyPlanDiagnosis {
  const samples = records.flatMap(record => {
    const age = (now.getTime() - Date.parse(record.submittedAt)) / dayMs
    if (!Number.isFinite(age) || age < 0 || !record.evaluation) return []
    const components = record.taskType === 'mock'
      ? [record.components?.task1, record.components?.task2]
      : [record]
    return components.flatMap(component => {
      if (!component || (component.taskType !== 'task1' && component.taskType !== 'task2')) return []
      const evaluation = component.evaluation
      if (!evaluation) return []
      const score = band(evaluation.overallBand) ?? band(evaluation.bandEstimate)
      const criteria: Partial<Record<Criterion, number>> = {}
      const legacyScores = Object.fromEntries(CriterionKeys.map(key => [key, evaluation[key]]))
      for (const [name, value] of Object.entries({ ...legacyScores, ...evaluation.criteria })) {
        const key = normalizeCriterion(name)
        const result = band(value?.score)
        if (key && result !== null) criteria[key] = result
      }
      return [{ age, type: component.taskType, date: record.submittedAt, score, criteria,
        subtype: subtype(component.taskType, component.questionType ?? ''), tags: annotations(evaluation),
        weight: 2 ** (-age / config.halfLifeDays) }]
    })
  }).sort((a, b) => a.age - b.age)

  function byTask(type: 'task1' | 'task2') {
    const rows = samples.filter(row => row.type === type)
    const scored = rows.filter(row => row.score !== null)
    const recent = scored.filter(row => row.age <= config.recentWindowDays).length
    const criteria: StudyPlanTaskAbility['criteria'] = {}
    for (const key of taskCriteria[type]) {
      const score = average(rows.map(row => ({ score: row.criteria[key] ?? null, weight: row.weight })))
      if (score !== null) criteria[key] = score
    }
    function trend(days: number) {
      const latest = scored.filter(row => row.age <= days)
      const earlier = scored.filter(row => row.age > days && row.age <= days * 2)
      if (latest.length < 2 || earlier.length < 2) return null
      const previous = average(earlier)!
      const direction = (average(latest)! - previous) >= 0 ? 1 : -1
      // A single unusually high or low essay cannot establish a sustained trend.
      if (latest.filter(row => (row.score! - previous) * direction >= 0.25).length < 2) return 0
      return round(average(latest)! - previous)
    }
    const latest = rows.filter(row => row.age <= 30)
    const earlier = rows.filter(row => row.age > 30 && row.age <= 60)
    const errors = [...new Set(rows.flatMap(row => [...row.tags]))].map(tag => ({
      tag, frequency: rows.filter(row => row.tags.has(tag)).length,
      recentRate: latest.length ? latest.filter(row => row.tags.has(tag)).length / latest.length : null,
      earlierRate: earlier.length ? earlier.filter(row => row.tags.has(tag)).length / earlier.length : null
    })).sort((a, b) => b.frequency - a.frequency || a.tag.localeCompare(b.tag))
    const criterionTrends: StudyPlanTaskAbility['criterionTrends'] = {}
    for (const key of taskCriteria[type]) {
      const recentScores = latest.filter(row => row.criteria[key] != null)
      const previousScores = earlier.filter(row => row.criteria[key] != null)
      if (recentScores.length >= 2 && previousScores.length >= 2) {
        const mean = (items: typeof rows) => average(items.map(row => ({ score: row.criteria[key] ?? null, weight: row.weight })))!
        criterionTrends[key] = round(mean(recentScores) - mean(previousScores))
      }
    }
    const ability: StudyPlanTaskAbility = {
      samples: scored.length, confidence: recent >= config.highSamples ? 'high' : recent >= config.mediumSamples ? 'medium' : 'low',
      criteria, criterionTrends, lastPracticedAt: rows[0]?.date ?? null, trend7: trend(7), trend30: trend(30), errors
    }
    const subtypes = Object.fromEntries([...new Set(rows.flatMap(row => row.subtype ? [row.subtype] : []))]
      .map(key => [key, average(rows.filter(row => row.subtype === key))]))
    return { ability, subtypes, score: average(rows) }
  }

  const task1 = byTask('task1')
  const task2 = byTask('task2')
  const averageCriterion = (key: Criterion) => average(samples.map(row => ({ score: row.criteria[key] ?? null, weight: row.weight })))
  const ta = averageCriterion('taskAchievement')
  const tr = averageCriterion('taskResponse')
  const cc = averageCriterion('coherenceCohesion')
  const lr = averageCriterion('lexicalResource')
  const gra = averageCriterion('grammaticalRangeAccuracy')
  const known: Array<[Criterion, number | null]> = [['taskAchievement', ta], ['taskResponse', tr],
    ['coherenceCohesion', cc], ['lexicalResource', lr], ['grammaticalRangeAccuracy', gra]]
  const ranked = known.filter((item): item is [Criterion, number] => item[1] !== null).sort((a, b) => a[1] - b[1])
  const taskAbilities = { task1: task1.ability, task2: task2.ability }
  const profileConfidence = task1.ability.confidence === 'low' || task2.ability.confidence === 'low' ? 'low'
    : task1.ability.confidence === 'high' && task2.ability.confidence === 'high' ? 'high' : 'medium'
  const tagCounts = new Map<string, number>()
  for (const sample of samples.filter(row => row.age <= config.recentWindowDays)) {
    for (const tag of sample.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  return {
    taskAbilities,
    currentAverage: task1.score !== null && task2.score !== null ? round((task1.score + 2 * task2.score) / 3) : null,
    task1Average: task1.score, task2Average: task2.score, taTr: ta === null || tr === null ? ta ?? tr : round((ta + tr) / 2), cc, lr, gra,
    strongestCriteria: ranked.slice(-2).reverse().map(([key]) => key),
    weakestCriteria: ranked.slice(0, 2).map(([key]) => key),
    priorityErrorTags: [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
      .map(([tag, frequency]) => ({ tag, frequency, priority: frequency >= 3 ? 'high' : frequency === 2 ? 'medium' : 'low' })),
    dataSufficiency: profileConfidence !== 'low' ? 'sufficient' : task1.ability.samples + task2.ability.samples > 0 ? 'limited' : 'none',
    profileConfidence, task1SubtypePerformance: task1.subtypes, task2SubtypePerformance: task2.subtypes
  }
}
