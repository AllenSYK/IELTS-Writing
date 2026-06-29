import type { EssayAnnotation, EssayEvaluation, WritingRecord } from '@/lib/writing-record-types'
import type { StudyPlanDiagnosis } from '@/lib/study-plan-types'

const CategoryToErrorTags: Record<string, string[]> = {
  'task-response': ['incomplete_task_response'],
  'coherence': ['unclear_progression', 'weak_topic_sentence'],
  'cohesion': ['overused_linkers', 'weak_paragraphing'],
  'unclear-expression': ['unclear_position'],
  'repetition': ['idea_repetition', 'repetition'],
  'vocabulary': ['word_choice', 'limited_range'],
  'collocation': ['collocation'],
  'style': ['informal_language'],
  'spelling': ['spelling'],
  'grammar': ['subject_verb_agreement', 'article', 'tense', 'sentence_fragment'],
  'punctuation': ['punctuation'],
  'sentence-structure': ['run_on_sentence', 'complex_sentence_control']
}

function extractTagsFromAnnotation(annotation: EssayAnnotation): string[] {
  const category = annotation.category
  const mapped = CategoryToErrorTags[category]
  if (mapped && mapped.length > 0) return mapped
  return ['other']
}

function extractTagsFromEvaluation(evaluation: EssayEvaluation): string[] {
  const tags: string[] = []
  const annotations = evaluation.annotations ?? []
  for (const annotation of annotations) {
    tags.push(...extractTagsFromAnnotation(annotation))
  }
  const sentenceErrors = evaluation.sentenceAnnotations ?? evaluation.sentenceErrors ?? []
  for (const error of sentenceErrors) {
    const cat = error.category
    if (cat === 'task') tags.push('incomplete_task_response')
    else if (cat === 'cohesion') tags.push('unclear_progression')
    else if (cat === 'lexical') tags.push('word_choice')
    else tags.push('subject_verb_agreement')
  }
  return tags
}

function scoreForCriterion(evaluation: EssayEvaluation, key: string): number | null {
  const criteria = evaluation.criteria ?? {}
  const value = (criteria as Record<string, unknown>)[key] as { score?: string } | undefined
  if (value?.score) {
    const n = parseFloat(value.score)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function extractCriteriaScores(evaluation: EssayEvaluation): Record<string, number | null> {
  return {
    taskAchievement: scoreForCriterion(evaluation, 'taskAchievement'),
    taskResponse: scoreForCriterion(evaluation, 'taskResponse'),
    coherenceCohesion: scoreForCriterion(evaluation, 'coherenceCohesion'),
    lexicalResource: scoreForCriterion(evaluation, 'lexicalResource'),
    grammaticalRangeAccuracy: scoreForCriterion(evaluation, 'grammaticalRangeAccuracy')
  }
}

function task1Subtype(record: WritingRecord): string | null {
  const qt = record.questionType || ''
  if (qt.includes('line') || qt.includes('line_graph')) return 'line'
  if (qt.includes('bar')) return 'bar'
  if (qt.includes('pie')) return 'pie'
  if (qt.includes('table')) return 'table'
  if (qt.includes('mixed')) return 'mixed'
  if (qt.includes('map')) return 'map'
  if (qt.includes('process') || qt.includes('flow')) return 'process'
  return null
}

function task2Subtype(record: WritingRecord): string | null {
  const qt = record.questionType || ''
  if (qt.includes('agree') || qt.includes('opinion')) return 'agree_disagree'
  if (qt.includes('discuss') || qt.includes('both')) return 'discuss_both'
  if (qt.includes('advantage') || qt.includes('disadvantage')) return 'advantages'
  if (qt.includes('problem') || qt.includes('solution')) return 'problem_solution'
  if (qt.includes('cause') || qt.includes('effect')) return 'cause_effect'
  if (qt.includes('two') || qt.includes('double')) return 'two_part'
  return null
}

export function buildStudyPlanDiagnosis(records: WritingRecord[]): StudyPlanDiagnosis {
  if (records.length === 0) {
    return {
      currentAverage: null,
      task1Average: null,
      task2Average: null,
      taTr: null,
      cc: null,
      lr: null,
      gra: null,
      strongestCriteria: [],
      weakestCriteria: [],
      priorityErrorTags: [],
      dataSufficiency: 'none',
      profileConfidence: 'low',
      task1SubtypePerformance: {},
      task2SubtypePerformance: {}
    }
  }

  const tagCounts = new Map<string, number>()
  const criterionScores = new Map<string, number[]>()
  const task1Scores: number[] = []
  const task2Scores: number[] = []
  const taTrScores: number[] = []
  const ccScores: number[] = []
  const lrScores: number[] = []
  const graScores: number[] = []
  const task1SubtypeMap = new Map<string, number[]>()
  const task2SubtypeMap = new Map<string, number[]>()

  for (const record of records.slice(0, 30)) {
    const tags = extractTagsFromEvaluation(record.evaluation)
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }

    const scores = extractCriteriaScores(record.evaluation)
    const overallBand = parseFloat(record.evaluation.overallBand || record.evaluation.bandEstimate)
    const validBand = Number.isFinite(overallBand) ? overallBand : null

    if (record.taskType === 'task1' && validBand !== null) {
      task1Scores.push(validBand)
      const subtype = task1Subtype(record)
      if (subtype) {
        const arr = task1SubtypeMap.get(subtype) || []
        arr.push(validBand)
        task1SubtypeMap.set(subtype, arr)
      }
    }
    if (record.taskType === 'task2' && validBand !== null) {
      task2Scores.push(validBand)
      const subtype = task2Subtype(record)
      if (subtype) {
        const arr = task2SubtypeMap.get(subtype) || []
        arr.push(validBand)
        task2SubtypeMap.set(subtype, arr)
      }
    }

    const taTr = scores.taskAchievement ?? scores.taskResponse
    if (taTr !== null) taTrScores.push(taTr)
    if (scores.coherenceCohesion !== null) ccScores.push(scores.coherenceCohesion)
    if (scores.lexicalResource !== null) lrScores.push(scores.lexicalResource)
    if (scores.grammaticalRangeAccuracy !== null) graScores.push(scores.grammaticalRangeAccuracy)

    for (const [key, value] of Object.entries(scores)) {
      if (value !== null) {
        const arr = criterionScores.get(key) || []
        arr.push(value)
        criterionScores.set(key, arr)
      }
    }
  }

  const criterionAverages = new Map<string, number>()
  for (const [key, scores] of criterionScores) {
    criterionAverages.set(key, scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const sortedCriteria = [...criterionAverages.entries()].sort((a, b) => a[1] - b[1])
  const weakestCriteria = sortedCriteria.slice(0, 2).map(([key]) => key)
  const strongestCriteria = sortedCriteria.slice(-2).map(([key]) => key).reverse()

  const totalTags = [...tagCounts.values()].reduce((a, b) => a + b, 0) || 1
  const priorityErrorTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, frequency]) => ({
      tag,
      frequency,
      priority: (frequency / totalTags > 0.2 ? 'high' : frequency / totalTags > 0.1 ? 'medium' : 'low') as 'high' | 'medium' | 'low'
    }))

  const overallScores = records
    .slice(0, 20)
    .map((r) => {
      const n = parseFloat(r.evaluation.overallBand || r.evaluation.bandEstimate)
      return Number.isFinite(n) ? n : null
    })
    .filter((n): n is number => n !== null)

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null

  const task1Avg = avg(task1Scores)
  const task2Avg = avg(task2Scores)
  const taTrAvg = avg(taTrScores)
  const ccAvg = avg(ccScores)
  const lrAvg = avg(lrScores)
  const graAvg = avg(graScores)

  const subtypeMapToObj = (map: Map<string, number[]>) => {
    const obj: Record<string, number | null> = {}
    for (const [key, scores] of map) {
      obj[key] = avg(scores)
    }
    return obj
  }

  const confidence = records.length >= 10 ? 'high' : records.length >= 4 ? 'medium' : 'low'

  return {
    currentAverage: overallScores.length > 0 ? avg(overallScores) : null,
    task1Average: task1Avg,
    task2Average: task2Avg,
    taTr: taTrAvg,
    cc: ccAvg,
    lr: lrAvg,
    gra: graAvg,
    strongestCriteria,
    weakestCriteria,
    priorityErrorTags,
    dataSufficiency: records.length >= 5 ? 'sufficient' : records.length >= 2 ? 'limited' : 'none',
    profileConfidence: confidence,
    task1SubtypePerformance: subtypeMapToObj(task1SubtypeMap),
    task2SubtypePerformance: subtypeMapToObj(task2SubtypeMap)
  }
}
