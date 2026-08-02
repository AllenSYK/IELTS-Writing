import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AiModelSettingsSchema,
  DEFAULT_AI_MODEL_SETTINGS,
  normalizeAiModelSettingsTimestamp,
  ParseableTimestampSchema
} from '@/lib/ai-model-settings'

test('administrator model settings require one model for every AI workload', () => {
  assert.equal(AiModelSettingsSchema.safeParse(DEFAULT_AI_MODEL_SETTINGS).success, true)

  const missingGradingModel = AiModelSettingsSchema.safeParse({
    ...DEFAULT_AI_MODEL_SETTINGS,
    gradingModel: ''
  })
  assert.equal(missingGradingModel.success, false)
})

test('administrator model settings reject insecure remote provider endpoints', () => {
  const insecureRemote = AiModelSettingsSchema.safeParse({
    ...DEFAULT_AI_MODEL_SETTINGS,
    baseUrl: 'http://models.example.com/v1'
  })
  assert.equal(insecureRemote.success, false)

  const localDevelopment = AiModelSettingsSchema.safeParse({
    ...DEFAULT_AI_MODEL_SETTINGS,
    baseUrl: 'http://127.0.0.1:11434/v1'
  })
  assert.equal(localDevelopment.success, true)
})

test('administrator model settings normalize PostgreSQL and ISO timestamps', () => {
  assert.equal(
    normalizeAiModelSettingsTimestamp('2026-08-02 06:35:15.94+00'),
    '2026-08-02T06:35:15.940Z'
  )
  assert.equal(
    normalizeAiModelSettingsTimestamp('2026-08-02T06:35:15.940Z'),
    '2026-08-02T06:35:15.940Z'
  )
})

test('administrator model settings reject invalid or absent timestamps without throwing', () => {
  assert.equal(normalizeAiModelSettingsTimestamp('not-a-date'), null)
  assert.equal(normalizeAiModelSettingsTimestamp(null), null)
  assert.equal(ParseableTimestampSchema.safeParse('not-a-date').success, false)
})

test('administrator model settings accept parseable database timestamps on save', () => {
  assert.equal(ParseableTimestampSchema.safeParse('2026-08-02 06:35:15.94+00').success, true)
  assert.equal(ParseableTimestampSchema.safeParse('2026-08-02T06:35:15.940Z').success, true)
})

test('administrator model settings preserve trimmed custom compatible model names', () => {
  const parsed = AiModelSettingsSchema.parse({
    ...DEFAULT_AI_MODEL_SETTINGS,
    promptModel: '  qwen3.7-plus  ',
    visionFallbackModel: '  qwen3.5-plus  '
  })

  assert.equal(parsed.promptModel, 'qwen3.7-plus')
  assert.equal(parsed.visionFallbackModel, 'qwen3.5-plus')
})
