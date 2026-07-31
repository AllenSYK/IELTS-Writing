import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AiModelSettingsSchema,
  DEFAULT_AI_MODEL_SETTINGS
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
