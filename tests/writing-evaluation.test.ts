import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WritingEvaluationError,
  requestEssayEvaluation,
  type EssayEvaluationRequest
} from '../lib/writing-evaluation'

const request: EssayEvaluationRequest = {
  essay: 'This is a sufficiently long candidate response for API behaviour testing.',
  taskType: 'task2',
  prompt: 'Discuss both views and give your own opinion.',
  questionType: 'discussion_opinion'
}

function evaluationResponse() {
  return {
    overallBand: '6.5',
    bandEstimate: '6.5',
    taskResponse: { score: '6', feedback: '回应任务' },
    coherenceCohesion: { score: '6', feedback: '结构清楚' },
    lexicalResource: { score: '6', feedback: '词汇够用' },
    grammaticalRangeAccuracy: { score: '7', feedback: '语法较准确' },
    criteria: {
      taskResponse: { score: '6', feedback: '回应任务' },
      coherenceCohesion: { score: '6', feedback: '结构清楚' },
      lexicalResource: { score: '6', feedback: '词汇够用' },
      grammaticalRangeAccuracy: { score: '7', feedback: '语法较准确' }
    },
    feedback: ['总体反馈']
  }
}

test('evaluation requests return a normalized evaluation on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json(evaluationResponse())) as typeof fetch

  try {
    const evaluation = await requestEssayEvaluation(request, { timeoutMs: 1_000 })
    assert.equal(evaluation.overallBand, '6.5')
    assert.equal(evaluation.criteria?.taskResponse?.score, '6')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('evaluation requests classify provider rate limits for the UI', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json(
    { error: 'ai_rate_limited', message: '请求过于频繁，请稍后重试。' },
    { status: 429 }
  )) as typeof fetch

  try {
    await assert.rejects(
      requestEssayEvaluation(request, { timeoutMs: 1_000 }),
      (error) => error instanceof WritingEvaluationError && error.kind === 'rate-limit'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('successful HTTP responses with incomplete evaluation data are rejected', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => Response.json({ protected: true })) as typeof fetch

  try {
    await assert.rejects(
      requestEssayEvaluation(request, { timeoutMs: 1_000 }),
      (error) => error instanceof WritingEvaluationError && error.kind === 'invalid-response'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
