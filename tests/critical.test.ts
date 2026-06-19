import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { generateWritingPromptWithAi, parseAiEvaluationText } from '../lib/ai'
import { QuestionTypeLabels, task1Questions, task2Questions } from '../lib/ielts-questions'
import { calculateWritingOverall, isExpiredAt, roundToHalfBand } from '../lib/ielts-scoring'
import { countWords, normalizeEvaluation } from '../lib/writing-records'
import { resolveAuthRedirect } from '../lib/auth/route-access'
import {
  getEffectiveBindingStatus,
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '../lib/web-license/admin-license-data'
import { prepareTask1ChartSpec, validateChartSpec } from '../lib/task1-chart-schema'
import { getFallbackQuestionsByType } from '../lib/task1-fallback-questions'
import { readStorageValue } from '../lib/user-storage'

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

test('批改响应解析器接受完整的 Task 2 结构', () => {
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

test('批改标注使用准确的 UTF-16 偏移并标记无法定位的文本', () => {
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

test('批改响应解析器拒绝缺少任务评分项的数据', () => {
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

test('Word count handles punctuation and contractions', () => {
  assert.equal(countWords("It's a well-developed, high-scoring essay."), 5)
})

test('Expiry date parser rejects past licenses', () => {
  assert.equal(isExpiredAt('2026-01-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), true)
  assert.equal(isExpiredAt('2026-12-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), false)
})

test('legacy browser storage values migrate without deleting the original value', () => {
  const values = new Map<string, string>([['aerowrite-writing-records-v1:user:user-a', '[{"id":"record-1"}]']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  } as Storage

  const currentKey = 'ielts-writing-writing-records-v1:user:user-a'
  assert.equal(readStorageValue(storage, currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem(currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem('aerowrite-writing-records-v1:user:user-a'), '[{"id":"record-1"}]')
})

test('grading and question routes expose only the authenticated web flow', async () => {
  const [evaluationRoute, promptRoute] = await Promise.all([
    readFile(new URL('../app/api/ai/evaluate/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/generate-prompt/route.ts', import.meta.url), 'utf8')
  ])

  for (const source of [evaluationRoute, promptRoute]) {
    assert.match(source, /requireActiveWebLicense/)
    assert.doesNotMatch(source, /x-device-id|desktop|licenseToken|LICENSE_SERVER_URL/i)
  }
})

test('settings and support pages use browser services only', async () => {
  const [settingsPage, supportPage] = await Promise.all([
    readFile(new URL('../app/settings/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/support/page.tsx', import.meta.url), 'utf8')
  ])

  for (const source of [settingsPage, supportPage]) {
    assert.doesNotMatch(source, /desktopApp|desktopLicense|desktopUpdater|nativeBridge/i)
  }
  assert.match(settingsPage, /\/api\/license\/status/)
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

test('Admin routes use the dedicated admin login before license routing', () => {
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/licenses',
      isAuthenticated: false
    }),
    '/admin/login'
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/licenses',
      isAuthenticated: true,
      role: 'user',
      licenseActive: false
    }),
    '/admin/login?reason=not_admin'
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/licenses',
      isAuthenticated: true,
      role: 'user',
      licenseActive: true
    }),
    '/admin/login?reason=not_admin'
  )
})

test('Admin login never sends ordinary users into the user activation flow', () => {
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/login',
      isAuthenticated: false
    }),
    null
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/login',
      isAuthenticated: true,
      role: 'user',
      licenseActive: false
    }),
    null
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin/login',
      isAuthenticated: true,
      role: 'admin'
    }),
    '/admin/licenses'
  )
})

test('Admin and ordinary login redirects remain separate', () => {
  assert.equal(
    resolveAuthRedirect({
      pathname: '/admin',
      isAuthenticated: true,
      role: 'admin'
    }),
    '/admin/licenses'
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/dashboard',
      isAuthenticated: true,
      role: 'admin'
    }),
    '/admin/licenses'
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/login',
      isAuthenticated: true,
      role: 'user',
      licenseActive: false
    }),
    '/activate'
  )
  assert.equal(
    resolveAuthRedirect({
      pathname: '/login',
      isAuthenticated: true,
      role: 'user',
      licenseActive: true
    }),
    '/dashboard'
  )
})

test('User Home navigation targets the account center without a client redirect page', async () => {
  const [nextConfig, sidebar, commandPalette, appShell] = await Promise.all([
    readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/interaction-system.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
  ])

  assert.match(nextConfig, /source:\s*['"]\/['"][\s\S]*?destination:\s*['"]\/dashboard['"][\s\S]*?permanent:\s*false/)
  assert.match(sidebar, /id:\s*['"]home['"],\s*href:\s*['"]\/dashboard['"]/)
  assert.match(commandPalette, /id:\s*['"]home['"][\s\S]*?href:\s*['"]\/dashboard['"]/)
  assert.doesNotMatch(appShell, /写作概览/)
})

test('Admin license status distinguishes unused, partial, exhausted, and expired', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 0, max_activations: 3 }, now), 'unused')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 1, max_activations: 3 }, now), 'partial')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 3, max_activations: 3 }, now), 'exhausted')
  assert.equal(
    getEffectiveLicenseStatus({
      status: 'active',
      activation_count: 0,
      max_activations: 3,
      expires_at: '2026-06-17T00:00:00.000Z'
    }, now),
    'expired'
  )
})

test('Admin binding status distinguishes valid, expiring, expired, revoked, and unbound', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'active')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-25T00:00:00.000Z' }, now), 'expiring')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-17T00:00:00.000Z' }, now), 'expired')
  assert.equal(getEffectiveBindingStatus({ status: 'revoked', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'revoked')
  assert.equal(
    getEffectiveBindingStatus({
      status: 'active',
      expires_at: '2026-08-18T00:00:00.000Z',
      license_status: 'disabled'
    }, now),
    'revoked'
  )
  assert.equal(
    getEffectiveBindingStatus({
      status: 'revoked',
      expires_at: '2026-08-18T00:00:00.000Z',
      revoked_reason: UNBOUND_BINDING_REASON
    }, now),
    'unbound'
  )
})
