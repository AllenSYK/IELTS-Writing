import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCorrectedEssay,
  dedupeAndSortAnnotations,
  generateWritingPromptWithAi,
  getEvaluationCacheKey,
  locateBlockAnnotation,
  officialTaskRubric,
  parseAiEvaluationText,
  splitEssayIntoBlocks
} from '../lib/ai'
import {
  AiProviderError,
  fetchAiNonStreamingCompletion,
  getGradingAiConfig,
  getVisionAiConfig
} from '../lib/ai-provider'
import { validateBlockAnnotationResponse } from '../lib/essay-annotation-schema'
import { applyAcceptedAnnotationChanges } from '../lib/essay-annotations'
import { QuestionTypeLabels, task1Questions, task2Questions } from '../lib/ielts-questions'
import {
  calculateEssayOverallBand,
  calculateWritingOverall,
  roundToHalfBand
} from '../lib/ielts-scoring'
import type { EssayAnnotation } from '../lib/writing-records'
import { prepareTask1ChartSpec, validateChartSpec } from '../lib/task1-chart-schema'
import { getFallbackQuestionsByType } from '../lib/task1-fallback-questions'
import {
  UploadMaxBytes,
  UploadedTask1ResultSchema,
  UploadedTask1VisualSchema,
  UploadedTask2ResultSchema,
  buildConfirmedUploadedQuestion,
  validateImageUpload
} from '../lib/uploaded-writing-task'
import {
  parseUploadedWritingTask,
  uploadedTaskSystemPrompt,
  uploadedTaskUserPrompt
} from '../lib/uploaded-writing-task-ai'

test('IELTS band rounding uses half-band steps', () => {
  assert.equal(roundToHalfBand(6.24), 6)
  assert.equal(roundToHalfBand(6.25), 6.5)
  assert.equal(roundToHalfBand(6.5), 6.5)
  assert.equal(roundToHalfBand(6.74), 6.5)
  assert.equal(roundToHalfBand(6.75), 7)
  assert.equal(roundToHalfBand(8.75), 9)
  assert.equal(roundToHalfBand(9), 9)
})

function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

test('uploaded image validation checks content, MIME, extension, size, and dimensions', () => {
  const image = validateImageUpload({
    name: 'task.png',
    reportedMimeType: 'image/png',
    size: 24,
    bytes: pngBytes(1200, 800)
  })
  assert.deepEqual(image, { mimeType: 'image/png', extension: 'png', width: 1200, height: 800 })
  assert.throws(() => validateImageUpload({
    name: 'task.jpg',
    reportedMimeType: 'image/jpeg',
    size: 24,
    bytes: pngBytes(1200, 800)
  }))
  assert.throws(() => validateImageUpload({
    name: 'task.png',
    reportedMimeType: 'image/png',
    size: UploadMaxBytes + 1,
    bytes: pngBytes(1200, 800)
  }))
})

test('Task 1 upload preserves uncertain values as null and marks the practice partial', () => {
  const parsed = UploadedTask1ResultSchema.parse({
    taskType: 'task1_academic',
    questionText: 'The chart below shows energy use.\nSummarise the information.',
    visuals: [{
      kind: 'line',
      title: 'Energy use',
      xAxis: { categories: ['2020', '2021'] },
      yAxis: { unit: '%' },
      series: [{ name: 'Solar', values: [20, null] }]
    }],
    parseStatus: 'partial',
    uncertainties: [{ location: 'visuals[0].series[0].values[1]', message: 'The 2021 value is unreadable.' }]
  })
  assert.equal(parsed.visuals[0].kind === 'line' ? parsed.visuals[0].series[0].values[1] : undefined, null)
  const question = buildConfirmedUploadedQuestion({
    uploadId: 'upload-1',
    result: parsed
  })
  assert.equal(question.generatedSource, 'user_upload')
  assert.equal(question.chartSpec?.series?.[0].values[1], null)
  assert.equal(question.structuredData?.parseStatus, 'partial')
  assert.match(question.image || '', /uploaded-writing-tasks\/upload-1\/image/)
})

test('Task 2 upload keeps the complete multi-question wording', () => {
  const parsed = UploadedTask2ResultSchema.parse({
    taskType: 'task2',
    questionText: 'Many people move to cities.\nWhy does this happen? Is this a positive or negative development?',
    detectedQuestionType: 'two_part',
    requirements: ['Why does this happen?', 'Is this a positive or negative development?'],
    minimumWords: 250,
    suggestedMinutes: 40,
    uncertainties: []
  })
  assert.equal(parsed.requirements.length, 2)
  const question = buildConfirmedUploadedQuestion({
    uploadId: 'upload-2',
    result: parsed
  })
  assert.equal(question.questionType, 'two_part')
  assert.match(`${question.promptLead}\n${question.promptDetail}`, /Why does this happen\?/)
  assert.match(`${question.promptLead}\n${question.promptDetail}`, /positive or negative development\?/)
})

test('General Training Task 1 is preserved as a letter rather than Task 2', () => {
  const parsed = UploadedTask1ResultSchema.parse({
    taskType: 'task1_general_letter',
    questionText: 'Write a letter to your local council. Explain the problem, describe its effect, and suggest a solution.',
    visuals: [],
    letter: {
      situation: 'A local service has changed.',
      recipient: 'Local council',
      purpose: 'Request a solution',
      bulletPoints: ['Explain the problem', 'Describe its effect', 'Suggest a solution'],
      tone: 'formal'
    },
    uncertainties: []
  })
  const question = buildConfirmedUploadedQuestion({ uploadId: 'upload-letter', result: parsed })
  assert.equal(question.taskType, 'task1')
  assert.equal(question.trainingType, 'general')
  assert.equal(question.questionType, 'letter')
})

test('Task 1 visual schema reconstructs line, pie, table, map, and process visuals', () => {
  const visuals = [
    {
      kind: 'line',
      title: 'Visitors',
      xAxis: { categories: ['2020', '2021'] },
      series: [{ name: 'Museum', values: [10, 20] }]
    },
    {
      kind: 'pie',
      title: 'Transport',
      unit: '%',
      slices: [{ label: 'Bus', value: 60 }, { label: 'Car', value: 40 }]
    },
    {
      kind: 'table',
      title: 'Population',
      columns: ['City', '2025'],
      rows: [['A', 20], ['B', null]]
    },
    {
      kind: 'map',
      title: 'Town centre',
      locations: [{ name: 'Station', before: 'Old station', after: 'New station', features: ['road'] }]
    },
    {
      kind: 'process',
      title: 'Water treatment',
      steps: [
        { order: 1, label: 'Filter', next: [2] },
        { order: 2, label: 'Store' }
      ]
    }
  ]
  visuals.forEach((visual) => assert.equal(UploadedTask1VisualSchema.safeParse(visual).success, true))
})

test('Mixed Task 1 keeps a line chart and pie chart as separate visuals', () => {
  const parsed = UploadedTask1ResultSchema.parse({
    taskType: 'task1_academic',
    questionText: 'The charts below show transport use. Summarise the information.',
    visuals: [
      {
        kind: 'line',
        title: 'Use over time',
        xAxis: { categories: ['2020', '2021'] },
        series: [{ name: 'Rail', values: [20, 30] }]
      },
      {
        kind: 'pie',
        title: 'Share in 2021',
        unit: '%',
        slices: [{ label: 'Rail', value: 30 }, { label: 'Other', value: 70 }]
      }
    ],
    uncertainties: []
  })
  const question = buildConfirmedUploadedQuestion({ uploadId: 'upload-mixed', result: parsed })
  assert.equal(parsed.visuals.length, 2)
  assert.equal(question.questionType, 'mixed_charts')
  assert.deepEqual(question.chartSpec?.charts?.map((chart) => chart.chartType), ['line', 'pie'])
})

test('Single essay overall is calculated from exactly four criterion scores', () => {
  assert.equal(calculateEssayOverallBand([6, 6, 6, 7]), 6.5)
  assert.equal(calculateEssayOverallBand([6, 6, 7, 8]), 7)
  assert.equal(calculateEssayOverallBand([5, 6, 6, 7]), 6)
  assert.equal(calculateEssayOverallBand([9, 9, 9, 9]), 9)
  assert.equal(calculateEssayOverallBand([6, 6, 7]), null)
})

test('Writing mock score weights Task 2 about twice Task 1', () => {
  assert.equal(calculateWritingOverall(6, 7), 6.5)
  assert.equal(calculateWritingOverall(7, 6), 6.5)
  assert.equal(calculateWritingOverall(5.5, 7.5), 7)
})

test('批改响应解析器接受完整的 Task 2 结构', () => {
  const parsed = parseAiEvaluationText(
    JSON.stringify({
      overallBand: '7.0',
      taskResponse: { score: 6, feedback: 'clear position', evidence: ['A clear position'], whyNotHigher: 'support is general' },
      coherenceCohesion: { score: 6, feedback: 'logical' },
      lexicalResource: { score: 6, feedback: 'range is adequate' },
      grammaticalRangeAccuracy: { score: 7, feedback: 'some errors' },
      summary: '整体回应清楚。',
      strengths: ['position is clear'],
      weaknesses: ['examples need more detail'],
      annotations: []
    }),
    'task2'
  )
  assert.equal(parsed.overallBand, '6.5')
  assert.equal(parsed.criteria?.taskResponse?.score, '6')
  assert.deepEqual(parsed.criteria?.taskResponse?.evidence, ['A clear position'])
  assert.equal(parsed.summary, '整体回应清楚。')
})

test('AI overallBand is ignored in favour of server-side criterion averaging', () => {
  const parsed = parseAiEvaluationText(JSON.stringify({
    overallBand: 8,
    taskResponse: { score: 6, feedback: '回应主要任务' },
    coherenceCohesion: { score: 6, feedback: '结构基本清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 7, feedback: '句式有变化' },
    summary: '服务器计算总分。',
    strengths: [],
    weaknesses: []
  }), 'task2')
  assert.equal(parsed.overallBand, '6.5')
  assert.equal(parsed.bandEstimate, '6.5')
})

test('Scoring responses keep only the first three strengths and weaknesses', () => {
  const parsed = parseAiEvaluationText(JSON.stringify({
    taskResponse: { score: 6, feedback: '回应任务' },
    coherenceCohesion: { score: 6, feedback: '结构清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 6, feedback: '语法基本准确' },
    summary: '测试',
    strengths: ['one', 'two', 'three', 'four'],
    weaknesses: ['one', 'two', 'three', 'four', 'five']
  }), 'task2')

  assert.deepEqual(parsed.strengths, ['one', 'two', 'three'])
  assert.deepEqual(parsed.weaknesses, ['one', 'two', 'three'])
})

test('Released provider aliases normalize only at the AI response boundary', () => {
  const parsed = parseAiEvaluationText(JSON.stringify({
    taskResponse: { score: 6, feedback: '回应任务' },
    coherenceCohesion: { score: 6, feedback: '结构清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 6, feedback: '语法基本准确' },
    overall_comment: '旧版总体评价',
    merits: ['旧版优点'],
    improvements: ['旧版问题'],
    annotations: [{
      text: 'people is',
      correction: 'people are',
      category: 'grammar',
      severity: 'high',
      scoreCriterion: 'Grammatical Range and Accuracy',
      explanationZh: '主谓一致错误',
      effect: '影响准确性',
      fix: '改为 people are'
    }]
  }), 'task2')

  assert.equal(parsed.summary, '旧版总体评价')
  assert.deepEqual(parsed.strengths, ['旧版优点'])
  assert.deepEqual(parsed.weaknesses, ['旧版问题'])
  assert.equal(parsed.annotations?.[0]?.originalText, 'people is')
  assert.equal(parsed.annotations?.[0]?.replacement, 'people are')
})

test('Malformed pseudo-JSON is rejected instead of being guessed into valid data', () => {
  assert.throws(() => parseAiEvaluationText(`{
    'taskResponse': {'score': 6, 'feedback': '回应任务'}
  }`, 'task2'))
})

test('批改标注使用准确的 UTF-16 偏移并标记无法定位的文本', () => {
  const essay = 'Many people is interested in study abroad. Many people also think it is expencive.'
  const parsed = parseAiEvaluationText(
    JSON.stringify({
      overallBand: '6.0',
      taskResponse: { score: 6, feedback: 'position is present' },
      coherenceCohesion: { score: 6, feedback: 'basic progression' },
      lexicalResource: { score: 5, feedback: 'some word choice errors' },
      grammaticalRangeAccuracy: { score: 5, feedback: 'agreement errors' },
      summary: '需要提升准确性。',
      strengths: ['观点基本明确'],
      weaknesses: ['语法错误影响清晰度'],
      annotations: [
        {
          id: 'ann-1',
          start: 5,
          end: 14,
          originalText: 'people is',
          replacement: 'people are',
          category: 'grammar',
          severity: 'high',
          scoreCriterion: 'Grammatical Range and Accuracy',
          explanationZh: '主谓一致错误。',
          impactOnScore: '影响语法准确性。',
          suggestion: '改为 people are'
        },
        {
          id: 'ann-2',
          start: 0,
          end: 10,
          originalText: 'exspensive',
          replacement: 'expensive',
          category: 'spelling',
          severity: 'medium',
          scoreCriterion: 'Lexical Resource',
          explanationZh: '拼写错误。',
          impactOnScore: '影响词汇准确性。',
          suggestion: '改为 expensive'
        }
      ]
    }),
    'task2',
    'test',
    'test-model',
    essay
  )
  assert.equal(parsed.annotations?.[0]?.start, 5)
  assert.equal(parsed.annotations?.[0]?.end, 14)
  assert.equal(parsed.annotations?.[0]?.unresolved, false)
  assert.equal(parsed.annotations?.[1]?.unresolved, true)
})

test('批改响应解析器拒绝缺少任务评分项的数据', () => {
  assert.throws(() =>
    parseAiEvaluationText(
      JSON.stringify({
        overallBand: '7.0',
        coherenceCohesion: { score: 7, feedback: 'logical' },
        lexicalResource: { score: 7, feedback: 'range is adequate' },
        grammaticalRangeAccuracy: { score: 6, feedback: 'some errors' },
        summary: '整体回应清楚。',
        strengths: [],
        weaknesses: [],
        annotations: []
      }),
      'task1'
    )
  )
})

test('Criterion scores reject half bands and values outside 0-9', () => {
  const base = {
    taskResponse: { score: 6, feedback: '回应任务' },
    coherenceCohesion: { score: 6, feedback: '结构清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 6, feedback: '语法基本准确' },
    summary: '测试',
    strengths: [],
    weaknesses: []
  }
  assert.throws(() => parseAiEvaluationText(JSON.stringify({
    ...base,
    lexicalResource: { score: 6.5, feedback: 'invalid' }
  }), 'task2'))
  assert.throws(() => parseAiEvaluationText(JSON.stringify({
    ...base,
    lexicalResource: { score: 10, feedback: 'invalid' }
  }), 'task2'))
})

test('Task 1 and Task 2 require their correct first criterion', () => {
  const shared = {
    coherenceCohesion: { score: 6, feedback: '结构清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 6, feedback: '语法基本准确' },
    summary: '测试',
    strengths: [],
    weaknesses: []
  }
  const task1 = parseAiEvaluationText(JSON.stringify({
    ...shared,
    taskAchievement: { score: 6, feedback: '完成主要要求' }
  }), 'task1')
  const task2 = parseAiEvaluationText(JSON.stringify({
    ...shared,
    taskResponse: { score: 6, feedback: '回应主要问题' }
  }), 'task2')
  assert.equal(task1.criteria?.taskAchievement?.score, '6')
  assert.equal(task2.criteria?.taskResponse?.score, '6')
  assert.throws(() => parseAiEvaluationText(JSON.stringify({
    ...shared,
    taskResponse: { score: 6, feedback: '错误维度' }
  }), 'task1'))
})

test('More than 20 legacy annotations are preserved without truncation', () => {
  const annotations = Array.from({ length: 24 }, (_, index) => ({
    originalText: `issue-${index}`,
    category: 'grammar',
    severity: 'low',
    scoreCriterion: 'Grammatical Range and Accuracy',
    explanationZh: '问题说明',
    impactOnScore: '影响准确性',
    suggestion: '修改建议'
  }))
  const parsed = parseAiEvaluationText(JSON.stringify({
    taskResponse: { score: 6, feedback: '回应任务' },
    coherenceCohesion: { score: 6, feedback: '结构清楚' },
    lexicalResource: { score: 6, feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: 6, feedback: '语法基本准确' },
    summary: '测试',
    strengths: [],
    weaknesses: [],
    annotations
  }), 'task2')
  assert.equal(parsed.annotations?.length, 24)
})

test('Essay blocks preserve every character and occurrence locates repeated text locally', () => {
  const essay = 'Many people agree. Many people disagree.\n\nMany people remain unsure.'
  const blocks = splitEssayIntoBlocks(essay)
  assert.equal(blocks.map((block) => block.text).join(''), essay)
  const second = locateBlockAnnotation({
    originalText: 'Many people',
    occurrence: 2,
    category: 'grammar',
    severity: 'medium',
    scoreCriterion: 'Grammatical Range and Accuracy',
    explanationZh: '测试',
    impactOnScore: '测试',
    suggestion: '测试'
  }, blocks[0], 'task2')
  assert.equal(second.start, essay.indexOf('Many people', 1))
  assert.equal(essay.slice(second.start, second.end), 'Many people')

  const otherParagraph = locateBlockAnnotation({
    originalText: 'Many people',
    occurrence: 1,
    category: 'grammar',
    severity: 'medium',
    scoreCriterion: 'Grammatical Range and Accuracy',
    explanationZh: '测试',
    impactOnScore: '测试',
    suggestion: '测试'
  }, blocks[1], 'task2')
  assert.equal(otherParagraph.start, essay.lastIndexOf('Many people'))
})

test('Unmatched block annotations remain visible as unresolved', () => {
  const annotation = locateBlockAnnotation({
    originalText: 'not in this block',
    occurrence: 1,
    category: 'unclear-expression',
    severity: 'low',
    scoreCriterion: 'Coherence and Cohesion',
    explanationZh: '测试',
    impactOnScore: '测试',
    suggestion: '测试'
  }, { index: 0, text: 'Actual text.', baseOffset: 0 }, 'task2')
  assert.equal(annotation.unresolved, true)
  assert.equal(annotation.start, -1)
  assert.equal(annotation.end, -1)
})

function annotation(overrides: Partial<EssayAnnotation>): EssayAnnotation {
  return {
    id: 'base',
    start: 0,
    end: 1,
    originalText: 'a',
    replacement: 'A',
    category: 'grammar',
    severity: 'medium',
    scoreCriterion: 'Grammatical Range and Accuracy',
    explanationZh: '测试',
    impactOnScore: '测试',
    suggestion: '测试',
    unresolved: false,
    ...overrides
  }
}

test('Annotations dedupe exact duplicates but keep different categories at one position', () => {
  const deduped = dedupeAndSortAnnotations([
    annotation({ id: 'one' }),
    annotation({ id: 'duplicate' }),
    annotation({ id: 'vocabulary', category: 'vocabulary', scoreCriterion: 'Lexical Resource' })
  ])
  assert.equal(deduped.length, 2)
})

test('Corrected essay applies replacements backwards and resolves overlaps deterministically', () => {
  const essay = 'I has a apple.'
  const corrected = buildCorrectedEssay(essay, [
    annotation({ id: 'article', start: 6, end: 7, originalText: 'a', replacement: 'an', severity: 'medium' }),
    annotation({ id: 'verb', start: 2, end: 5, originalText: 'has', replacement: 'have', severity: 'high' })
  ])
  assert.equal(corrected, 'I have an apple.')

  const overlap = buildCorrectedEssay('abcdef', [
    annotation({ id: 'low-long', start: 1, end: 5, originalText: 'bcde', replacement: 'X', severity: 'low' }),
    annotation({ id: 'high-short', start: 2, end: 4, originalText: 'cd', replacement: 'Y', severity: 'high' })
  ])
  assert.equal(overlap, 'abYef')

  const sameSeverity = buildCorrectedEssay('abcdef', [
    annotation({ id: 'short', start: 2, end: 4, originalText: 'cd', replacement: 'Y', severity: 'medium' }),
    annotation({ id: 'long', start: 1, end: 5, originalText: 'bcde', replacement: 'X', severity: 'medium' })
  ])
  assert.equal(sameSeverity, 'aXf')
})

test('Accepted annotation changes preserve the highest-priority non-overlapping edits', () => {
  const annotations = [
    annotation({ id: 'long', start: 1, end: 5, originalText: 'bcde', replacement: 'X', severity: 'low' }),
    annotation({ id: 'short', start: 2, end: 4, originalText: 'cd', replacement: 'Y', severity: 'high' })
  ]
  const acceptedAt = '2026-06-20T00:00:00.000Z'
  const result = applyAcceptedAnnotationChanges('abcdef', [
    { annotationId: 'long', start: 1, end: 5, originalText: 'bcde', replacement: 'X', acceptedAt },
    { annotationId: 'short', start: 2, end: 4, originalText: 'cd', replacement: 'Y', acceptedAt }
  ], annotations)

  assert.equal(result, 'abYef')
})

test('Evaluation cache separates phase, grading version, and model', () => {
  const base = { essay: 'Essay text', taskType: 'task2', prompt: 'Prompt', promptVersion: 'p1' }
  const quick = getEvaluationCacheKey({ ...base, model: 'model-a', phase: 'quick' })
  const full = getEvaluationCacheKey({ ...base, model: 'model-a', phase: 'full' })
  const otherModel = getEvaluationCacheKey({ ...base, model: 'model-b', phase: 'full' })
  const otherProvider = getEvaluationCacheKey({ ...base, provider: 'provider-b', model: 'model-a', phase: 'full' })
  const letterTask = getEvaluationCacheKey({ ...base, questionType: 'letter', model: 'model-a', phase: 'full' })
  const oldRubric = getEvaluationCacheKey({ ...base, model: 'model-a', phase: 'full', gradingVersion: 'old' })
  const differentWhitespace = getEvaluationCacheKey({ ...base, essay: 'Essay  text', model: 'model-a', phase: 'full' })
  const otherUser = getEvaluationCacheKey({ ...base, model: 'model-a', phase: 'full', cacheScope: 'user-b' })
  assert.notEqual(quick, full)
  assert.notEqual(full, otherModel)
  assert.notEqual(full, otherProvider)
  assert.notEqual(full, letterTask)
  assert.notEqual(full, oldRubric)
  assert.notEqual(full, differentWhitespace)
  assert.notEqual(full, otherUser)
})

test('grading model uses the dedicated qwen3.5-plus configuration', () => {
  const previousKey = process.env.AI_API_KEY
  const previousBaseUrl = process.env.AI_BASE_URL
  const previousGeneralModel = process.env.AI_MODEL
  const previousGradingModel = process.env.QWEN_GRADING_MODEL
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  process.env.AI_MODEL = 'question-model'
  delete process.env.QWEN_GRADING_MODEL

  try {
    const config = getGradingAiConfig()
    assert.equal(config.model, 'qwen3.5-plus')
  } finally {
    if (previousKey === undefined) delete process.env.AI_API_KEY
    else process.env.AI_API_KEY = previousKey
    if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL
    else process.env.AI_BASE_URL = previousBaseUrl
    if (previousGeneralModel === undefined) delete process.env.AI_MODEL
    else process.env.AI_MODEL = previousGeneralModel
    if (previousGradingModel === undefined) delete process.env.QWEN_GRADING_MODEL
    else process.env.QWEN_GRADING_MODEL = previousGradingModel
  }
})

test('vision model is fixed to qwen3.5-plus and never falls back to another model', () => {
  const previousKey = process.env.AI_API_KEY
  const previousBaseUrl = process.env.AI_BASE_URL
  const previousVisionModel = process.env.QWEN_VISION_MODEL
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  delete process.env.QWEN_VISION_MODEL

  try {
    assert.equal(getVisionAiConfig().model, 'qwen3.5-plus')
    process.env.QWEN_VISION_MODEL = 'qwen3.7-plus'
    assert.throws(() => getVisionAiConfig(), /QWEN_VISION_MODEL=qwen3\.5-plus/)
  } finally {
    if (previousKey === undefined) delete process.env.AI_API_KEY
    else process.env.AI_API_KEY = previousKey
    if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL
    else process.env.AI_BASE_URL = previousBaseUrl
    if (previousVisionModel === undefined) delete process.env.QWEN_VISION_MODEL
    else process.env.QWEN_VISION_MODEL = previousVisionModel
  }
})

test('uploaded-task prompt ignores black, white, colored borders and surrounding app UI', () => {
  assert.match(uploadedTaskSystemPrompt, /black bars/)
  assert.match(uploadedTaskSystemPrompt, /white margins/)
  assert.match(uploadedTaskSystemPrompt, /colored backgrounds/)
  assert.match(uploadedTaskSystemPrompt, /mobile gallery controls/)
  assert.match(uploadedTaskSystemPrompt, /browser UI/)
  assert.match(uploadedTaskSystemPrompt, /page counters/)
  assert.match(uploadedTaskSystemPrompt, /unrelated watermarks/)
  assert.match(uploadedTaskSystemPrompt, /locate the actual IELTS writing task region/)
  assert.match(uploadedTaskUserPrompt, /one separate visuals\[\] item per independent visual/)
})

test('uploaded-task recognition sends the signed image in OpenAI multimodal format with stream false', async () => {
  const originalFetch = globalThis.fetch
  const originalWarn = console.warn
  const previousKey = process.env.AI_API_KEY
  const previousBaseUrl = process.env.AI_BASE_URL
  const previousVisionModel = process.env.QWEN_VISION_MODEL
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  process.env.QWEN_VISION_MODEL = 'qwen3.5-plus'
  const requestBodies: Array<Record<string, unknown>> = []
  const warnings: unknown[][] = []
  console.warn = (...args: unknown[]) => warnings.push(args)
  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            taskType: 'task2',
            questionText: 'Some people prefer cities. To what extent do you agree or disagree?',
            detectedQuestionType: 'agree_disagree',
            requirements: ['To what extent do you agree or disagree?'],
            minimumWords: 250,
            suggestedMinutes: 40,
            parseStatus: 'complete',
            uncertainties: []
          })
        },
        finish_reason: 'stop'
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const parsed = await parseUploadedWritingTask({
      signedImageUrl: 'https://storage.example.test/signed/task.png',
      requestId: 'parse-non-stream-test'
    })
    const requestBody = requestBodies[0]
    assert.ok(requestBody)
    assert.equal(parsed.model, 'qwen3.5-plus')
    assert.equal(requestBody.stream, false)
    assert.deepEqual(requestBody.response_format, { type: 'json_object' })
    const messages = requestBody.messages as Array<{ role: string; content: unknown[] }>
    assert.deepEqual(messages.map((message) => message.role), ['system', 'user'])
    assert.deepEqual(messages[1].content[0], {
      type: 'image_url',
      image_url: { url: 'https://storage.example.test/signed/task.png' }
    })
    assert.equal(warnings.some((args) => args[0] === '[ai-stream-invalid]'), false)
  } finally {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    if (previousKey === undefined) delete process.env.AI_API_KEY
    else process.env.AI_API_KEY = previousKey
    if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL
    else process.env.AI_BASE_URL = previousBaseUrl
    if (previousVisionModel === undefined) delete process.env.QWEN_VISION_MODEL
    else process.env.QWEN_VISION_MODEL = previousVisionModel
  }
})

test('explicit image-input rejection is surfaced without model fallback', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { code: 'InvalidParameter', message: 'This model does not support image input.' }
  }), { status: 400, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

  try {
    await assert.rejects(
      () => fetchAiNonStreamingCompletion({
        provider: 'qwen',
        apiKey: 'test-key',
        baseUrl: 'https://example.test/v1',
        model: 'qwen3.5-plus'
      }, [{
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.test/task.png' } }]
      }], {
        maxTokens: 100,
        requestId: 'parse-image-unsupported'
      }),
      (error) => error instanceof AiProviderError && error.code === 'vision_model_image_input_unsupported'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('annotation schema rejects invalid block ids, categories, and missing source text', () => {
  const block = { id: 'block-2-test', text: 'People are increasingly working from home.' }
  const valid = {
    blockId: block.id,
    checkedWholeBlock: true,
    annotations: [{
      blockId: block.id,
      originalText: 'People are',
      occurrence: 1,
      replacement: 'Many people are',
      category: 'grammar',
      severity: 'medium',
      scoreCriterion: 'Grammatical Range and Accuracy',
      explanationZh: '说明',
      impactOnScore: '影响语法准确性',
      suggestion: '修改表达'
    }]
  }

  assert.equal(validateBlockAnnotationResponse(valid, block).success, true)
  assert.equal(validateBlockAnnotationResponse({ ...valid, blockId: 'wrong' }, block).success, false)
  assert.equal(validateBlockAnnotationResponse({
    ...valid,
    annotations: [{ ...valid.annotations[0], originalText: 'not present' }]
  }, block).success, false)
  assert.equal(validateBlockAnnotationResponse({
    ...valid,
    annotations: [{ ...valid.annotations[0], category: 'invented-category' }]
  }, block).success, false)
})

test('Task 1 letter rubric does not require an Academic overview', () => {
  const letterRubric = officialTaskRubric('task1', 'letter')
  assert.match(letterRubric, /Do not require a chart overview/)
  assert.match(letterRubric, /bullet point/)
  assert.doesNotMatch(letterRubric, /main trends, differences or stages/)
})

test('Question bank covers required IELTS task types', () => {
  const task1Types = new Set(task1Questions.map((question) => question.questionType))
  for (const type of ['line_chart', 'bar_chart', 'table', 'map', 'process', 'letter']) {
    assert.equal(task1Types.has(type as keyof typeof QuestionTypeLabels), true)
  }

  const task2Types = new Set(task2Questions.map((question) => question.questionType))
  for (const type of ['opinion', 'discussion', 'advantages_disadvantages', 'problem_solution', 'two_part', 'positive_negative']) {
    assert.equal(task2Types.has(type as keyof typeof QuestionTypeLabels), true)
  }
})

test('Mixed chart normalizes bar + pie aliases into two renderable chart objects', () => {
  const prepared = prepareTask1ChartSpec({
    kind: 'mixed',
    title: 'Retail performance',
    barData: {
      title: 'Revenue by region',
      labels: ['Europe', 'Asia', 'Americas'],
      datasets: [{ label: 'Revenue', data: [80, 95, 110] }],
      unit: '$ million',
      legend: true
    },
    pieChart: {
      title: 'Operating costs',
      labels: ['Staff', 'Property', 'Other'],
      data: [50, 30, 20],
      units: '%',
      legend: true
    }
  }, 'mixed')

  assert.equal(prepared.success, true)
  if (!prepared.success) return
  assert.deepEqual(prepared.data.charts?.map((chart) => chart.chartType), ['bar', 'pie'])
  assert.deepEqual(prepared.data.charts?.[0]?.xAxis?.categories, ['Europe', 'Asia', 'Americas'])
  assert.deepEqual(prepared.data.charts?.[0]?.series?.[0]?.values, [80, 95, 110])
  assert.equal(prepared.data.charts?.[1]?.pieData?.length, 3)
})

test('Mixed chart validates line + table as independent charts', () => {
  const prepared = prepareTask1ChartSpec({
    kind: 'mixed',
    title: 'University data',
    charts: [
      {
        chartType: 'line',
        title: 'Enrolment',
        categories: ['2020', '2022', '2024'],
        series: [{ name: 'Students', data: [1200, 1350, 1480] }],
        units: 'students',
        legend: true
      },
      {
        chartType: 'table',
        title: 'International students',
        columns: ['Faculty', 'Share'],
        rows: [['Business', '32%'], ['Engineering', '27%']],
        units: '%',
        legend: false
      }
    ]
  }, 'mixed')

  assert.equal(prepared.success, true)
  if (!prepared.success) return
  assert.deepEqual(prepared.data.charts?.map((chart) => chart.chartType), ['line', 'table'])
  assert.equal(validateChartSpec(prepared.data, 'mixed').valid, true)
})

test('Legacy bar + line mixed chart migrates to two chart objects and survives JSON round-trip', () => {
  const prepared = prepareTask1ChartSpec({
    kind: 'mixed',
    title: 'Exports',
    xAxis: { categories: ['2020', '2022', '2024'] },
    series: [
      { id: 'volume', name: 'Volume', type: 'bar', values: [40, 52, 61] },
      { id: 'price', name: 'Price', type: 'line', values: [280, 340, 390] }
    ],
    legend: true
  }, 'mixed')

  assert.equal(prepared.success, true)
  if (!prepared.success) return
  const restored = prepareTask1ChartSpec(JSON.parse(JSON.stringify(prepared.data)), 'mixed')
  assert.equal(restored.success, true)
  if (!restored.success) return
  assert.deepEqual(restored.data.charts?.map((chart) => chart.chartType), ['bar', 'line'])
})

test('Mixed chart rejects a single incomplete child chart', () => {
  const prepared = prepareTask1ChartSpec({
    kind: 'mixed',
    title: 'Incomplete',
    charts: [
      {
        chartType: 'bar',
        title: 'Only chart',
        labels: ['A', 'B'],
        data: [1, 2],
        units: '',
        legend: true
      }
    ]
  }, 'mixed')
  assert.equal(prepared.success, false)
})

test('Built-in Mixed Chart fallbacks cover bar + pie, line + table, and bar + line', () => {
  const combinations = new Set<string>()
  for (const question of getFallbackQuestionsByType('mixed_charts')) {
    const prepared = prepareTask1ChartSpec(question.chartSpec, 'mixed')
    assert.equal(prepared.success, true, question.id)
    if (prepared.success) {
      combinations.add(prepared.data.charts?.map((chart) => chart.chartType).join('+') || '')
    }
  }
  assert.equal(combinations.has('bar+pie'), true)
  assert.equal(combinations.has('line+table'), true)
  assert.equal(combinations.has('bar+line'), true)
})

function aiStreamResponse(content: string) {
  const body = [
    `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}`,
    '',
    'data: [DONE]',
    ''
  ].join('\n')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function mixedPromptJson(chartSpec: unknown) {
  return JSON.stringify({
    title: 'Academic Task 1 - Mixed Chart',
    promptLead: 'The charts below show two related sets of retail data in 2024.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    questionType: 'mixed_charts',
    chartSpec
  })
}

function restoreAiEnv(original: { key?: string; baseUrl?: string; model?: string }) {
  if (original.key === undefined) delete process.env.AI_API_KEY
  else process.env.AI_API_KEY = original.key
  if (original.baseUrl === undefined) delete process.env.AI_BASE_URL
  else process.env.AI_BASE_URL = original.baseUrl
  if (original.model === undefined) delete process.env.AI_MODEL
  else process.env.AI_MODEL = original.model
}

test('Mixed Chart 数据不完整时重试一次', async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = {
    key: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL
  }
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  process.env.AI_MODEL = 'test-model'

  const responses = [
    mixedPromptJson({
      kind: 'mixed',
      title: 'Incomplete',
      charts: [{ chartType: 'bar', title: 'Only chart', labels: ['A'], data: [1] }]
    }),
    mixedPromptJson({
      kind: 'mixed',
      title: 'Complete',
      barData: {
        title: 'Revenue',
        labels: ['Europe', 'Asia'],
        datasets: [{ label: 'Revenue', data: [80, 95] }],
        units: '$ million',
        legend: true
      },
      pieChart: {
        title: 'Costs',
        labels: ['Staff', 'Other'],
        data: [65, 35],
        units: '%',
        legend: true
      }
    })
  ]
  let calls = 0
  globalThis.fetch = (async () => aiStreamResponse(responses[calls++] || responses[responses.length - 1])) as typeof fetch

  try {
    const question = await generateWritingPromptWithAi({
      taskType: 'task1',
      selection: {
        task1ChartType: 'mixed_charts',
        task1Subtype: 'bar_pie',
        task2EssayType: 'random',
        task2Topic: 'random'
      }
    })
    assert.equal(calls, 2)
    assert.equal(question.generatedSource, 'ai')
    assert.deepEqual(question.chartSpec?.charts?.map((chart) => chart.chartType), ['bar', 'pie'])
  } finally {
    globalThis.fetch = originalFetch
    restoreAiEnv(originalEnv)
  }
})

test('Mixed Chart 连续两次无效响应后使用备用题目', async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = {
    key: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL
  }
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  process.env.AI_MODEL = 'test-model'

  const incomplete = mixedPromptJson({
    kind: 'mixed',
    title: 'Still incomplete',
    charts: [{ chartType: 'line', title: 'Only chart', labels: ['2024'], data: [10] }]
  })
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return aiStreamResponse(incomplete)
  }) as typeof fetch

  try {
    const question = await generateWritingPromptWithAi({
      taskType: 'task1',
      selection: {
        task1ChartType: 'mixed_charts',
        task1Subtype: 'line_table',
        task2EssayType: 'random',
        task2Topic: 'random'
      }
    })
    assert.equal(calls, 2)
    assert.equal(question.generatedSource, 'local-template')
    assert.equal(prepareTask1ChartSpec(question.chartSpec, 'mixed').success, true)
    assert.deepEqual(question.chartSpec?.charts?.map((chart) => chart.chartType), ['line', 'table'])
  } finally {
    globalThis.fetch = originalFetch
    restoreAiEnv(originalEnv)
  }
})

test('Task 1 chart responses without series fall back to a matching built-in question', async () => {
  const originalFetch = globalThis.fetch
  const originalEnv = {
    key: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL
  }
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_BASE_URL = 'https://example.test/v1'
  process.env.AI_MODEL = 'test-model'

  const incomplete = JSON.stringify({
    title: 'Academic Task 1 - Line Chart',
    promptLead: 'The line chart below shows incomplete transport data for three cities between 2020 and 2024.',
    promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
    questionType: 'line_chart',
    chartSpec: {
      kind: 'line',
      title: 'Incomplete transport data',
      xAxis: { categories: ['2020', '2022', '2024'] }
    }
  })
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return aiStreamResponse(incomplete)
  }) as typeof fetch

  try {
    const question = await generateWritingPromptWithAi({
      taskType: 'task1',
      selection: {
        task1ChartType: 'line_chart',
        task1Subtype: 'random',
        task2EssayType: 'random',
        task2Topic: 'random'
      }
    })
    assert.equal(calls, 2)
    assert.equal(question.generatedSource, 'local-template')
    assert.equal(question.questionType, 'line_chart')
    assert.equal(prepareTask1ChartSpec(question.chartSpec, 'line').success, true)
  } finally {
    globalThis.fetch = originalFetch
    restoreAiEnv(originalEnv)
  }
})
