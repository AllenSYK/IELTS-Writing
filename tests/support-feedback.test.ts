import assert from 'node:assert/strict'
import test from 'node:test'
import { SupportFeedbackSchema, supportFeedbackFieldErrors } from '../lib/support-feedback-schema'

const valid = { category: '界面显示问题', subject: '布局问题', message: '学习规划日历和任务卡片在小屏幕上显示拥挤。' }

test('feedback trims content and accepts an empty optional contact email', () => {
  const result = SupportFeedbackSchema.parse({ ...valid, subject: '  布局问题  ', contactEmail: '   ' })
  assert.equal(result.subject, '布局问题')
  assert.equal(result.contactEmail, '')
  assert.equal(SupportFeedbackSchema.parse({ ...valid, contactEmail: ' person@example.com ' }).contactEmail, 'person@example.com')
})

test('feedback reports the exact invalid field with an actionable message', () => {
  const parsed = SupportFeedbackSchema.safeParse({ ...valid, contactEmail: '邮箱', message: '   太短   ' })
  assert.equal(parsed.success, false)
  if (!parsed.success) {
    const fields = supportFeedbackFieldErrors(parsed.error)
    assert.match(fields.contactEmail!, /有效的联系邮箱/)
    assert.match(fields.message!, /至少填写 10/)
    assert.equal(fields.subject, undefined)
  }
})

test('whitespace cannot satisfy feedback minimum lengths', () => {
  assert.equal(SupportFeedbackSchema.safeParse({ ...valid, subject: '     ' }).success, false)
  assert.equal(SupportFeedbackSchema.safeParse({ ...valid, message: '         问题 ' }).success, false)
})

test('long diagnostic metadata does not block otherwise valid feedback', () => {
  const result = SupportFeedbackSchema.parse({ ...valid, diagnostics: {
    appVersion: 'v'.repeat(100), platform: 'p'.repeat(200), osVersion: 'a'.repeat(900), recentErrorCode: 'e'.repeat(300)
  } })
  assert.equal(result.diagnostics?.appVersion.length, 80)
  assert.equal(result.diagnostics?.platform.length, 120)
  assert.equal(result.diagnostics?.osVersion.length, 500)
  assert.equal(result.diagnostics?.recentErrorCode.length, 160)
})

test('feedback respects diagnostic opt out and bounds the user message', () => {
  assert.equal(SupportFeedbackSchema.parse({ ...valid, includeDiagnostics: false }).diagnostics, undefined)
  assert.equal(SupportFeedbackSchema.safeParse({ ...valid, message: '文'.repeat(5000) }).success, true)
  assert.equal(SupportFeedbackSchema.safeParse({ ...valid, message: '文'.repeat(5001) }).success, false)
})
