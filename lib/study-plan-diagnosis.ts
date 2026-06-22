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

function criterionKeyForRecord(record: WritingRecord): string[] {
  if (record.taskType === 'task1') return ['Task Achievement', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy']
  if (record.taskType === 'task2') return ['Task Response', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy']
  return ['Task Achievement', 'Task Response', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy']
}

function scoreForCriterion(evaluation: EssayEvaluation, criterion: string): number | null {
  const criteria = evaluation.criteria ?? {}
  for (const [key, value] of Object.entries(criteria)) {
    const labels: Record<string, string> = {
      taskAchievement: 'Task Achievement',
      taskResponse: 'Task Response',
      coherenceCohesion: 'Coherence and Cohesion',
      lexicalResource: 'Lexical Resource',
      grammaticalRangeAccuracy: 'Grammatical Range and Accuracy'
    }
    if (labels[key] === criterion && value?.score) {
      const n = parseFloat(value.score)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

export function buildStudyPlanDiagnosis(records: WritingRecord[]): StudyPlanDiagnosis {
  if (records.length === 0) {
    return {
      currentAverage: null,
      strongestCriteria: [],
      weakestCriteria: [],
      priorityErrorTags: [],
      dataSufficiency: 'none'
    }
  }

  const tagCounts = new Map<string, number>()
  const criterionScores = new Map<string, number[]>()

  for (const record of records.slice(0, 30)) {
    const tags = extractTagsFromEvaluation(record.evaluation)
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
    }
    for (const criterion of criterionKeyForRecord(record)) {
      const score = scoreForCriterion(record.evaluation, criterion)
      if (score !== null) {
        const arr = criterionScores.get(criterion) || []
        arr.push(score)
        criterionScores.set(criterion, arr)
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

  const currentAverage = overallScores.length > 0
    ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length
    : null

  return {
    currentAverage: currentAverage ? Math.round(currentAverage * 10) / 10 : null,
    strongestCriteria,
    weakestCriteria,
    priorityErrorTags,
    dataSufficiency: records.length >= 5 ? 'sufficient' : records.length >= 2 ? 'limited' : 'none'
  }
}
