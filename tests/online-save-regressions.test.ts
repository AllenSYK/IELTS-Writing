import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminSettingsSchema } from '../lib/admin/settings-schema'
import { createDraftSaveQueue } from '../lib/writing-draft-save'
import { extractErrorsFromRecord } from '../lib/error-extraction'
import type { WritingRecord } from '../lib/writing-record-types'

const settings = {
  defaultPlan: 'standard', defaultDurationDays: 30, defaultMaxActivations: 1,
  expiringReminderDays: 14, pageSize: 25, dateFormat: 'zh-CN', timezone: 'Asia/Shanghai'
}

test('settings accept exact PostgreSQL version timestamps without losing microseconds', () => {
  for (const expectedUpdatedAt of ['2026-06-18T10:46:53.348107+00:00', '2026-10-25T11:05:00.123456+08:00', '2026-10-25T03:05:00.123Z']) {
    const parsed = AdminSettingsSchema.parse({ ...settings, expectedUpdatedAt })
    assert.equal(parsed.expectedUpdatedAt, expectedUpdatedAt)
  }
  assert.equal(AdminSettingsSchema.parse(settings).expectedUpdatedAt, undefined)
  assert.equal(AdminSettingsSchema.safeParse({ ...settings, expectedUpdatedAt: 'not-a-date' }).success, false)
  assert.equal(AdminSettingsSchema.safeParse({ ...settings, timezone: 'Invalid/Zone' }).success, false)
  assert.equal(AdminSettingsSchema.safeParse({ ...settings, pageSize: 0 }).success, false)
})

test('an explicit save waits for the earlier autosave before writing the latest response', async () => {
  const queue = createDraftSaveQueue()
  const writes: string[] = []
  let release!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const autosave = queue.run(async () => {
    writes.push('old-start')
    await blocked
    writes.push('old-finish')
    return 'saved'
  })
  const exitSave = queue.run(async () => { writes.push('latest-finish'); return 'saved' })
  await Promise.resolve()
  assert.deepEqual(writes, ['old-start'])
  release()
  assert.equal(await autosave, 'saved')
  assert.equal(await exitSave, 'saved')
  assert.deepEqual(writes, ['old-start', 'old-finish', 'latest-finish'])
})

test('a rejected autosave does not swallow the next save or falsely report success', async () => {
  const queue = createDraftSaveQueue()
  const failed = queue.run(async () => { throw new Error('network unavailable') })
  const retry = queue.run(async () => 'saved')
  await assert.rejects(failed, /network unavailable/)
  assert.equal(await retry, 'saved')
  assert.equal(await queue.run(async () => 'offline'), 'offline')
})

test('one correction is collected once across annotation formats with a specific Chinese label', () => {
  const record: WritingRecord = {
    id: 'record-test', deviceId: 'test', taskType: 'task1', title: 'Map', prompt: '', essay: '',
    submittedAt: '2026-10-25T00:00:00Z', durationSeconds: 0, wordCount: 0,
    evaluation: { overallBand: '5.5', bandEstimate: '5.5', feedback: [],
    annotations: [{ id: 'a1', start: 0, end: 20, category: 'vocabulary', severity: 'low', scoreCriterion: 'Lexical Resource', impactOnScore: '', suggestion: '', originalText: 'on the northern part', replacement: 'in the northern part', explanationZh: '介词搭配不当' }],
    sentenceErrors: [
      { category: 'lexical', errorType: 'collocation', original: 'on the northern part', correction: 'in the northern part', explanation: 'Incorrect preposition', chineseExplanation: '介词搭配不当' },
      { category: 'grammar', original: 'maps compares', correction: 'maps compare', explanation: 'Subject-verb agreement error' },
      { category: 'grammar', original: 'both side', correction: 'both sides', explanation: 'Noun number error' }
    ],
    sentenceAnnotations: [{ category: 'lexical', errorType: 'collocation', original: 'on the northern part', correction: 'in the northern part', explanation: 'Incorrect preposition' }]
  } }
  const errors = extractErrorsFromRecord(record)
  assert.equal(errors.length, 3)
  assert.deepEqual(errors.map(({ category, title }) => ({ category, title })), [
    { category: 'collocation', title: '搭配' },
    { category: 'subject_verb_agreement', title: '主谓一致' },
    { category: 'singular_plural', title: '单复数' }
  ])
})
