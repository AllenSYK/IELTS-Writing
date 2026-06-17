import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { parseAiEvaluationText } from '../lib/ai'
import { QuestionTypeLabels, task1Questions, task2Questions } from '../lib/ielts-questions'
import { calculateWritingOverall, isExpiredAt, roundToHalfBand } from '../lib/ielts-scoring'
import { isValidPublicKey } from '../lib/license/token'
import { countWords, normalizeEvaluation } from '../lib/writing-records'

test('IELTS band rounding uses half-band steps', () => {
  assert.equal(roundToHalfBand(6.24), 6)
  assert.equal(roundToHalfBand(6.25), 6.5)
  assert.equal(roundToHalfBand(6.74), 6.5)
  assert.equal(roundToHalfBand(6.75), 7)
})

test('Writing mock score weights Task 2 about twice Task 1', () => {
  assert.equal(calculateWritingOverall(6, 7), 6.5)
  assert.equal(calculateWritingOverall(7, 6), 6.5)
  assert.equal(calculateWritingOverall(5.5, 7.5), 7)
})

test('AI JSON parser accepts required Task 2 structure', () => {
  const parsed = parseAiEvaluationText(
    JSON.stringify({
      overallBand: '7.0',
      taskResponse: { score: '7.0', feedback: 'clear position' },
      coherenceCohesion: { score: '7.0', feedback: 'logical' },
      lexicalResource: { score: '7.0', feedback: 'range is adequate' },
      grammaticalRangeAccuracy: { score: '6.5', feedback: 'some errors' },
      summary: '整体回应清楚。',
      strengths: ['position is clear'],
      weaknesses: ['examples need more detail'],
      annotations: []
    }),
    'task2'
  )
  assert.equal(parsed.overallBand, '7')
  assert.equal(parsed.criteria?.taskResponse?.score, '7.0')
  assert.equal(parsed.summary, '整体回应清楚。')
})

test('AI annotations use exact UTF-16 offsets and mark unresolved mismatches', () => {
  const essay = 'Many people is interested in study abroad. Many people also think it is expencive.'
  const parsed = parseAiEvaluationText(
    JSON.stringify({
      overallBand: '6.0',
      taskResponse: { score: '6.0', feedback: 'position is present' },
      coherenceCohesion: { score: '6.0', feedback: 'basic progression' },
      lexicalResource: { score: '5.5', feedback: 'some word choice errors' },
      grammaticalRangeAccuracy: { score: '5.5', feedback: 'agreement errors' },
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

test('AI JSON parser rejects missing task-specific criterion', () => {
  assert.throws(() =>
    parseAiEvaluationText(
      JSON.stringify({
        overallBand: '7.0',
        coherenceCohesion: { score: '7.0', feedback: 'logical' },
        lexicalResource: { score: '7.0', feedback: 'range is adequate' },
        grammaticalRangeAccuracy: { score: '6.5', feedback: 'some errors' },
        summary: '整体回应清楚。',
        strengths: [],
        weaknesses: [],
        annotations: []
      }),
      'task1'
    )
  )
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

test('Word count handles punctuation and contractions', () => {
  assert.equal(countWords("It's a well-developed, high-scoring essay."), 5)
})

test('Expiry date parser rejects past licenses', () => {
  assert.equal(isExpiredAt('2026-01-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), true)
  assert.equal(isExpiredAt('2026-12-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), false)
})

test('License verifier accepts bare SPKI base64 public keys', () => {
  const { publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  assert.equal(isValidPublicKey(publicKey.toString('base64')), true)
})

test('Stored legacy evaluations normalize into the new result shape', () => {
  const normalized = normalizeEvaluation({
    bandEstimate: '6.5',
    criteria: { taskAchievement: { score: '6.0', feedback: 'overview is limited' } },
    overallFeedback: '旧记录评价。',
    sentenceErrors: [],
    suggestions: ['写清 overview'],
    feedback: ['旧记录评价。']
  })
  assert.equal(normalized?.overallBand, '6.5')
  assert.equal(normalized?.summary, '旧记录评价。')
  assert.deepEqual(normalized?.nextSteps, [])
  assert.deepEqual(normalized?.suggestions, ['写清 overview'])
})
