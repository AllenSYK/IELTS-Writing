import { z } from 'zod'
import { formatBandNumber, parseBand } from '@/lib/ielts-scoring'
import type {
  CriterionKey,
  CriterionScore,
  EssayAnnotation,
  EssayAnnotationCategory,
  EssayEvaluation,
  EssayScoreCriterion,
  SentenceError,
  SentenceErrorCategory,
  WritingTaskType
} from '@/lib/writing-records'
import type { WritingQuestion } from '@/lib/ielts-questions'
import {
  Task1ChartLabels,
  Task2EssayLabels,
  Task2TopicLabels,
  type PromptSelection
} from '@/lib/writing-options'

type AiConfig = {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

type EssayEvaluationInput = {
  essay: string
  taskType: Exclude<WritingTaskType, 'mock'>
  prompt?: string
  questionType?: string
  phase?: 'quick' | 'detailed' | 'full'
  promptVersion?: string
}

export type PromptGenerationInput = {
  taskType: Exclude<WritingTaskType, 'mock'>
  selection: PromptSelection
  excludePromptSummaries?: Array<{
    taskType?: string
    chartType?: string
    essayType?: string
    topic?: string
    questionHash?: string
    keywords?: string[]
    questionText?: string
  }>
}

type PerformanceLog = {
  requestId: string
  taskType: string
  wordCount: number
  model: string
  provider: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  requestStartAt: number
  firstByteAt?: number
  providerCompletedAt?: number
  parseCompletedAt?: number
  saveCompletedAt?: number
  renderCompletedAt?: number
  providerDurationMs?: number
  parseDurationMs?: number
  saveDurationMs?: number
  totalDurationMs?: number
  retryCount: number
  retryReason?: string
  finishReason?: string
  cacheHit: boolean
  duplicateRequestBlocked?: boolean
  phase?: string
  containsMarkdown?: boolean
  wasTruncated?: boolean
  jsonParseErrorPosition?: string
  jsonFixed?: boolean
  responseChars?: number
  annotationCount?: number
}

function createPerfLog(essay: string, taskType: string, model: string, provider: string, phase?: string): PerformanceLog {
  const requestId = `eval-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length
  return {
    requestId,
    taskType,
    wordCount,
    model,
    provider,
    requestStartAt: Date.now(),
    retryCount: 0,
    cacheHit: false,
    phase: phase || 'full'
  }
}

function logPerf(log: PerformanceLog, stage: string, extra?: Record<string, unknown>) {
  const elapsed = Date.now() - log.requestStartAt
  const parts = [
    `[ai-evaluate]`,
    `requestId=${log.requestId}`,
    `stage=${stage}`,
    `taskType=${log.taskType}`,
    `wordCount=${log.wordCount}`,
    `model=${log.model}`,
    `provider=${log.provider}`,
    `phase=${log.phase}`,
    `elapsedMs=${elapsed}`
  ]
  if (log.promptTokens !== undefined) parts.push(`promptTokens=${log.promptTokens}`)
  if (log.completionTokens !== undefined) parts.push(`completionTokens=${log.completionTokens}`)
  if (log.totalTokens !== undefined) parts.push(`totalTokens=${log.totalTokens}`)
  if (log.firstByteAt) parts.push(`firstByteMs=${log.firstByteAt - log.requestStartAt}`)
  if (log.providerDurationMs !== undefined) parts.push(`providerDurationMs=${log.providerDurationMs}`)
  if (log.parseDurationMs !== undefined) parts.push(`parseDurationMs=${log.parseDurationMs}`)
  if (log.saveDurationMs !== undefined) parts.push(`saveDurationMs=${log.saveDurationMs}`)
  if (log.totalDurationMs !== undefined) parts.push(`totalDurationMs=${log.totalDurationMs}`)
  if (log.retryCount > 0) parts.push(`retryCount=${log.retryCount}`)
  if (log.retryReason) parts.push(`retryReason=${log.retryReason}`)
  if (log.finishReason) parts.push(`finishReason=${log.finishReason}`)
  if (log.cacheHit) parts.push(`cacheHit=true`)
  if (log.duplicateRequestBlocked) parts.push(`duplicateRequestBlocked=true`)
  if (log.containsMarkdown !== undefined) parts.push(`containsMarkdown=${log.containsMarkdown}`)
  if (log.wasTruncated !== undefined) parts.push(`wasTruncated=${log.wasTruncated}`)
  if (log.jsonParseErrorPosition) parts.push(`jsonParseErrorPosition=${log.jsonParseErrorPosition}`)
  if (log.jsonFixed !== undefined) parts.push(`jsonFixed=${log.jsonFixed}`)
  if (log.responseChars !== undefined) parts.push(`responseChars=${log.responseChars}`)
  if (log.annotationCount !== undefined) parts.push(`annotationCount=${log.annotationCount}`)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      parts.push(`${k}=${v}`)
    }
  }
  console.info(parts.join(' '))
}

function logJsonParseDetails(log: PerformanceLog, rawText: string, error?: Error) {
  const textLength = rawText.length
  const first100 = rawText.slice(0, 100)
  const last100 = rawText.slice(-100)
  const containsMarkdown = /```(?:json|JSON)?\s*[\s\S]*?\s*```/.test(rawText) || rawText.includes('```')
  const wasTruncated = rawText.length > 0 && !rawText.trimEnd().endsWith('}')

  log.containsMarkdown = containsMarkdown
  log.wasTruncated = wasTruncated
  log.responseChars = textLength

  const details = [
    `[ai-json-details]`,
    `requestId=${log.requestId}`,
    `model=${log.model}`,
    `responseChars=${textLength}`,
    `first100=${JSON.stringify(first100)}`,
    `last100=${JSON.stringify(last100)}`,
    `containsMarkdown=${containsMarkdown}`,
    `wasTruncated=${wasTruncated}`
  ]

  if (error) {
    const errorPosition = extractJsonErrorPosition(error.message)
    log.jsonParseErrorPosition = errorPosition
    details.push(`parseErrorPosition=${errorPosition}`)
  }

  console.warn(details.join(' '))
}

function extractJsonErrorPosition(errorMessage: string): string {
  const positionMatch = errorMessage.match(/position\s+(\d+)/i)
  if (positionMatch) return `pos=${positionMatch[1]}`
  const lineMatch = errorMessage.match(/line\s+(\d+)/i)
  if (lineMatch) return `line=${lineMatch[1]}`
  return 'unknown'
}

const ProviderDefaults: Record<string, Pick<AiConfig, 'baseUrl' | 'model'>> = {
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  }
}
const DEFAULT_AI_TIMEOUT_MS = 240000
const MAX_COMPLETION_TOKENS_QUICK = 2000
const MAX_COMPLETION_TOKENS_DETAILED = 4000

const ScoreSchema = z.union([z.string(), z.number()]).transform((value) => String(value))

const CriterionSchema = z.object({
  score: ScoreSchema,
  feedback: z.string().default('')
})

const SentenceErrorSchema = z.object({
  original: z.string().min(1),
  correction: z.string().min(1).optional(),
  suggested: z.string().min(1).optional(),
  explanation: z.string().min(1),
  chineseExplanation: z.string().optional(),
  errorType: z.string().optional(),
  sentence: z.string().optional(),
  category: z.enum(['grammar', 'lexical', 'cohesion', 'task', 'other']).default('other')
})

const AnnotationCategorySchema = z.enum([
  'grammar',
  'spelling',
  'vocabulary',
  'collocation',
  'coherence',
  'cohesion',
  'task-response',
  'punctuation',
  'sentence-structure',
  'style',
  'repetition',
  'unclear-expression'
])

const ScoreCriterionSchema = z.enum([
  'Task Achievement',
  'Task Response',
  'Coherence and Cohesion',
  'Lexical Resource',
  'Grammatical Range and Accuracy'
])

const EssayAnnotationSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  start: z.number().int(),
  end: z.number().int(),
  originalText: z.string().min(1).default(''),
  replacement: z.string().min(1).optional(),
  category: AnnotationCategorySchema,
  severity: z.enum(['low', 'medium', 'high']),
  scoreCriterion: ScoreCriterionSchema,
  explanationZh: z.string().min(1).max(80),
  explanationEn: z.string().optional(),
  impactOnScore: z.string().max(60).default(''),
  suggestion: z.string().min(1).max(60)
})

const AiQuickEvaluationSchema = z.object({
  overallBand: ScoreSchema,
  taskAchievement: CriterionSchema.optional(),
  taskResponse: CriterionSchema.optional(),
  coherenceCohesion: CriterionSchema,
  lexicalResource: CriterionSchema,
  grammaticalRangeAccuracy: CriterionSchema,
  summary: z.string().max(120),
  strengths: z.array(z.string()).max(3),
  weaknesses: z.array(z.string()).max(3),
  annotations: z.array(EssayAnnotationSchema).max(6).default([])
})

const AiDetailedEvaluationSchema = z.object({
  annotations: z.array(EssayAnnotationSchema).max(12).default([]),
  sentenceAnnotations: z.array(SentenceErrorSchema).default([]),
  correctedEssay: z.string().default(''),
  improvedEssay: z.string().default(''),
  modelEssay: z.string().default(''),
  nextSteps: z.array(z.string()).max(4).default([])
})

const AiPromptSchema = z.object({
  title: z.string().min(4).max(120),
  promptLead: z.string().min(20).max(1000),
  promptDetail: z.string().min(8).max(1000),
  questionType: z.string().min(2).max(80),
  topic: z.string().max(80).optional(),
  chartSpec: z.object({
    kind: z.enum(['line', 'bar', 'pie', 'table', 'mixed']),
    title: z.string(),
    subtitle: z.string().optional(),
    xAxis: z.object({
      label: z.string().optional(),
      categories: z.array(z.string()).min(1)
    }).optional(),
    yAxis: z.object({
      label: z.string().optional(),
      unit: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional()
    }).optional(),
    series: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['line', 'bar']).optional(),
      values: z.array(z.number())
    })).optional(),
    pieData: z.array(z.object({
      label: z.string(),
      value: z.number()
    })).optional(),
    tableData: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number()])))
    }).optional(),
    legend: z.boolean().optional(),
    source: z.string().optional()
  }).optional(),
  processSpec: z.object({
    title: z.string(),
    stages: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional()
    })).min(2)
  }).optional(),
  mapSpec: z.object({
    title: z.string(),
    beforeLabel: z.string().default('Before'),
    afterLabel: z.string().default('After'),
    features: z.array(z.object({
      id: z.string(),
      label: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      change: z.enum(['added', 'removed', 'modified', 'unchanged']).optional(),
      description: z.string().optional()
    })).min(1)
  }).optional(),
  structuredData: z.record(z.unknown()).optional()
})

export class AiConfigurationError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Missing AI configuration: ${missing.join(', ')}`)
    this.name = 'AiConfigurationError'
    this.missing = missing
  }
}

export class AiProviderError extends Error {
  readonly status?: number
  readonly code: string

  constructor(message: string, status?: number, code = 'ai_provider_failed') {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
    this.code = code
  }
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
}

function getAiConfig(): AiConfig {
  const provider = env('AI_PROVIDER') || 'qwen'
  const defaults = ProviderDefaults[provider.toLowerCase()]
  const apiKey = env('AI_API_KEY')
  const baseUrl = env('AI_BASE_URL') || defaults?.baseUrl || ''
  const model = env('AI_MODEL') || defaults?.model || ''
  const missing = [
    !apiKey ? 'AI_API_KEY' : '',
    !baseUrl ? 'AI_BASE_URL' : '',
    !model ? 'AI_MODEL' : ''
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new AiConfigurationError(missing)
  }

  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    model
  }
}

function taskName(taskType: WritingTaskType) {
  if (taskType === 'task1') return 'IELTS Academic Writing Task 1'
  if (taskType === 'task2') return 'IELTS Academic Writing Task 2'
  return 'IELTS Writing'
}

function buildQuickEvaluationPrompt(input: EssayEvaluationInput) {
  const { essay, taskType, prompt, questionType } = input
  const firstCriterion = taskType === 'task1' ? 'taskAchievement' : 'taskResponse'

  const parts: string[] = [
    `Quick IELTS ${taskType.toUpperCase()} assessment. Chinese feedback, English quotes.`,
    `Criteria: ${firstCriterion}, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy.`,
    `Annotations: max 6, explanationZh<=60chars, suggestion<=50chars. summary<=100chars. strengths<=3, weaknesses<=3.`,
    `Each annotation MUST have: start, end, originalText (exact text from essay), category, severity, scoreCriterion, explanationZh, impactOnScore (how it affects score), suggestion.`,
    `start/end are UTF-16 indexes. essay.slice(start,end)==originalText.`,
    `Category: grammar|spelling|vocabulary|collocation|coherence|cohesion|task-response|punctuation|sentence-structure|style|repetition|unclear-expression.`,
    `Severity: low|medium|high. scoreCriterion: Task ${taskType === 'task1' ? 'Achievement' : 'Response'}|Coherence and Cohesion|Lexical Resource|Grammatical Range and Accuracy.`,
  ]

  if (prompt) {
    parts.push(`Prompt: ${prompt}`)
  }
  if (questionType) {
    parts.push(`Type: ${questionType}`)
  }

  parts.push('Essay:', essay)

  return parts.join('\n')
}

function buildDetailedEvaluationPrompt(input: EssayEvaluationInput, quickResult: AiQuickEvaluation) {
  const { essay, taskType, prompt, questionType } = input
  const maxWordCount = Math.ceil(essay.split(/\s+/).length * 1.15)
  const existingIssues = quickResult.annotations.map((a) => ({ text: a.originalText, cat: a.category }))

  const parts: string[] = [
    `Detailed IELTS ${taskType.toUpperCase()} analysis. Chinese feedback, English quotes.`,
    `Add remaining annotations (max 12 total). Do NOT repeat: ${JSON.stringify(existingIssues)}.`,
    `explanationZh<=60chars, suggestion<=50chars.`,
    `Provide: sentenceAnnotations, correctedEssay, improvedEssay (max ${maxWordCount} words), modelEssay (${taskType === 'task1' ? '170-210' : '250-290'} words), nextSteps (max 4).`,
    `sentenceAnnotations.category: grammar|lexical|cohesion|task|other.`,
  ]

  if (prompt) {
    parts.push(`Prompt: ${prompt}`)
  }
  if (questionType) {
    parts.push(`Type: ${questionType}`)
  }

  parts.push('Essay:', essay)

  return parts.join('\n')
}

function inputPromptBlock(taskType: WritingTaskType, prompt?: string, questionType?: string) {
  const lines = ['Question context:']
  lines.push(`Task type: ${taskType}`)
  if (questionType) lines.push(`Question subtype: ${questionType}`)
  if (prompt) lines.push(`Prompt: ${prompt}`)
  return lines.join('\n')
}

function essayHash(essay: string): string {
  const normalized = essay.trim().replace(/\s+/g, ' ').toLowerCase()
  let hash = 2166136261
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

type CachedEvaluation = {
  result: EssayEvaluation
  timestamp: number
}

const evaluationCache = new Map<string, CachedEvaluation>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function getCacheKey(essay: string, taskType: string, prompt?: string, promptVersion?: string, model?: string): string {
  const eHash = essayHash(essay)
  const pHash = prompt ? essayHash(prompt) : 'no-prompt'
  const pvHash = promptVersion ? essayHash(promptVersion) : 'v1'
  const mHash = model ? essayHash(model) : 'default'
  return `${eHash}:${taskType}:${pHash}:${pvHash}:${mHash}`
}

function getCachedEvaluation(cacheKey: string): EssayEvaluation | null {
  const cached = evaluationCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    evaluationCache.delete(cacheKey)
    return null
  }
  return cached.result
}

function setCachedEvaluation(cacheKey: string, result: EssayEvaluation) {
  evaluationCache.set(cacheKey, { result, timestamp: Date.now() })
  if (evaluationCache.size > 100) {
    const oldestKey = evaluationCache.keys().next().value
    if (oldestKey) evaluationCache.delete(oldestKey)
  }
}

function buildPromptGenerationPrompt(input: PromptGenerationInput) {
  const { taskType, selection, excludePromptSummaries = [] } = input
  const task1Type = selection.task1ChartType === 'random' ? 'random' : `${selection.task1ChartType} (${Task1ChartLabels[selection.task1ChartType]})`
  const task1Subtype = selection.task1Subtype === 'random' ? 'random' : selection.task1Subtype
  const task2Type = selection.task2EssayType === 'random' ? 'random' : `${selection.task2EssayType} (${Task2EssayLabels[selection.task2EssayType]})`
  const task2Topic = selection.task2Topic === 'random' ? 'random' : `${selection.task2Topic} (${Task2TopicLabels[selection.task2Topic]})`

  if (taskType === 'task1') {
    const chartType = selection.task1ChartType
    const isChartType = ['line_chart', 'bar_chart', 'pie_chart', 'table', 'mixed_charts'].includes(chartType)
    const isProcessType = chartType === 'process'
    const isMapType = ['map', 'floor_plan', 'before_after'].includes(chartType)

    const taskRules = [
      'Generate exactly one IELTS Academic Writing Task 1 question.',
      `Requested chart type: ${task1Type}.`,
      `Requested subtype: ${task1Subtype}.`,
      'If a concrete chart type is requested, the questionType in JSON must match it exactly.',
      'Do not return a map when a chart is requested, and do not return a chart when map/process/floor_plan is requested.',
      '',
      'CRITICAL: You MUST include structured visual data in your response.',
      isChartType ? '- For chart types (line_chart, bar_chart, pie_chart, table, mixed_charts), include "chartSpec" with complete data.' : '',
      isProcessType ? '- For process diagrams, include "processSpec" with stages.' : '',
      isMapType ? '- For maps and floor plans, include "mapSpec" with features and positions.' : '',
      '',
      'Return only valid JSON. Do not wrap JSON in markdown. Do not add any text before or after the JSON.',
      'Avoid repeating any previous prompt below.',
      'Use realistic IELTS wording. Keep the prompt in English.'
    ].filter(Boolean)

    let exampleJson: Record<string, unknown>
    if (isChartType) {
      if (chartType === 'line_chart') {
        exampleJson = {
          title: 'Academic Task 1 - Line Chart',
          promptLead: 'The line graph below shows the percentage of employees working from home in four industries between 2018 and 2024.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'line_chart',
          chartSpec: {
            kind: 'line',
            title: 'Remote Work by Industry (2018-2024)',
            xAxis: { label: 'Year', categories: ['2018', '2020', '2022', '2024'] },
            yAxis: { label: 'Percentage', unit: '%' },
            series: [
              { id: 'tech', name: 'Technology', values: [18, 34, 52, 48] },
              { id: 'finance', name: 'Finance', values: [12, 28, 41, 39] }
            ],
            legend: true
          }
        }
      } else if (chartType === 'bar_chart') {
        exampleJson = {
          title: 'Academic Task 1 - Bar Chart',
          promptLead: 'The bar chart below shows government expenditure on education and healthcare in five countries in 2020.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'bar_chart',
          chartSpec: {
            kind: 'bar',
            title: 'Government Expenditure (2020)',
            subtitle: 'Percentage of GDP',
            xAxis: { label: 'Country', categories: ['USA', 'UK', 'Germany', 'Japan', 'Brazil'] },
            yAxis: { label: 'Expenditure', unit: '% of GDP' },
            series: [
              { id: 'education', name: 'Education', values: [5.4, 5.2, 4.6, 3.4, 6.1] },
              { id: 'healthcare', name: 'Healthcare', values: [16.8, 10.2, 11.7, 10.9, 9.6] }
            ],
            legend: true
          }
        }
      } else if (chartType === 'pie_chart') {
        exampleJson = {
          title: 'Academic Task 1 - Pie Chart',
          promptLead: 'The pie charts below show the main sources of energy production in a country in 2025.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'pie_chart',
          chartSpec: {
            kind: 'pie',
            title: 'Energy Production Sources (2025)',
            pieData: [
              { label: 'Natural Gas', value: 35 },
              { label: 'Renewables', value: 28 },
              { label: 'Nuclear', value: 18 },
              { label: 'Coal', value: 12 },
              { label: 'Oil', value: 7 }
            ],
            legend: true
          }
        }
      } else if (chartType === 'table') {
        exampleJson = {
          title: 'Academic Task 1 - Table',
          promptLead: 'The table below shows the average cost of living in five major cities in 2024.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'table',
          chartSpec: {
            kind: 'table',
            title: 'Average Monthly Cost of Living (2024)',
            tableData: {
              columns: ['City', 'Rent', 'Groceries', 'Transport', 'Total'],
              rows: [
                ['Singapore', 2200, 450, 120, 2770],
                ['London', 2000, 380, 180, 2560],
                ['New York', 2800, 420, 130, 3350]
              ]
            }
          }
        }
      } else {
        exampleJson = {
          title: 'Academic Task 1 - Mixed Chart',
          promptLead: 'The charts below show the revenue and growth rate of a retail company from 2018 to 2024.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'mixed_charts',
          chartSpec: {
            kind: 'mixed',
            title: 'Retail Company Performance (2018-2024)',
            xAxis: { label: 'Year', categories: ['2018', '2019', '2020', '2021', '2022', '2023', '2024'] },
            series: [
              { id: 'revenue', name: 'Revenue ($M)', type: 'bar', values: [45, 52, 48, 65, 78, 92, 105] },
              { id: 'growth', name: 'Growth Rate (%)', type: 'line', values: [8, 15, -8, 35, 20, 18, 14] }
            ],
            legend: true
          }
        }
      }
    } else if (isProcessType) {
      exampleJson = {
        title: 'Academic Task 1 - Process Diagram',
        promptLead: 'The diagram below illustrates how rainwater is collected and treated for household use.',
        promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
        questionType: 'process',
        processSpec: {
          title: 'Rainwater Treatment Process',
          stages: [
            { id: 'collect', label: 'Collection', description: 'Rainwater collected from rooftops' },
            { id: 'filter', label: 'Filtration', description: 'Water passes through filters' },
            { id: 'store', label: 'Storage', description: 'Water stored in tanks' },
            { id: 'treat', label: 'Treatment', description: 'UV purification applied' },
            { id: 'supply', label: 'Supply', description: 'Clean water delivered to homes' }
          ]
        }
      }
    } else {
      exampleJson = {
        title: 'Academic Task 1 - Map',
        promptLead: 'The maps below show changes to a small harbour area between 2005 and 2025.',
        promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
        questionType: 'map',
        mapSpec: {
          title: 'Harbour Area Development (2005 vs 2025)',
          beforeLabel: '2005',
          afterLabel: '2025',
          features: [
            { id: 'dock', label: 'Main Dock', position: { x: 30, y: 40 }, change: 'unchanged', description: 'Original dock retained' },
            { id: 'warehouse', label: 'Old Warehouse', position: { x: 60, y: 30 }, change: 'removed', description: 'Demolished' },
            { id: 'apartments', label: 'New Apartments', position: { x: 60, y: 30 }, change: 'added', description: 'Built on warehouse site' }
          ]
        }
      }
    }

    return [
      ...taskRules,
      'Use this exact JSON shape:',
      JSON.stringify(exampleJson, null, 2),
      'Recent prompt history to avoid:',
      JSON.stringify(excludePromptSummaries.slice(0, 20), null, 2)
    ].join('\n')
  }

  const taskRules = [
    'Generate exactly one IELTS Academic Writing Task 2 question.',
    `Requested essay type: ${task2Type}.`,
    `Requested topic: ${task2Topic}.`,
    'If a concrete essay type or topic is requested, the prompt must clearly match it.'
  ]

  return [
    ...taskRules,
    'Return only valid JSON. Do not wrap JSON in markdown.',
    'Avoid repeating any previous prompt below. Do not merely change years, cities, countries, labels, or numbers to make a duplicate look new.',
    'Use realistic IELTS wording. Keep the prompt in English.',
    'Use this exact JSON shape:',
    JSON.stringify(
      {
        title: 'Task 2 - Problem / Solution',
        promptLead: '...',
        promptDetail: '...',
        questionType: selection.task2EssayType,
        topic: selection.task2Topic,
        structuredData: {}
      },
      null,
      2
    ),
    'Recent prompt history to avoid:',
    JSON.stringify(excludePromptSummaries.slice(0, 20), null, 2)
  ].join('\n')
}

function extractAssistantText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    throw new AiProviderError('AI provider returned an invalid response.')
  }

  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices)) {
    throw new AiProviderError('AI provider response did not include choices.')
  }

  const firstChoice = choices[0]
  if (!firstChoice || typeof firstChoice !== 'object') {
    throw new AiProviderError('AI provider response did not include a completion.')
  }

  const message = (firstChoice as { message?: unknown }).message
  if (!message || typeof message !== 'object') {
    throw new AiProviderError('AI provider response did not include a message.')
  }

  const content = (message as { content?: unknown }).content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AiProviderError('AI provider response did not include text content.')
  }

  return content.trim()
}

function parseJsonObject(text: string, perfLog?: PerformanceLog) {
  const cleaned = sanitizeJsonText(text)

  try {
    const result = JSON.parse(cleaned)
    if (perfLog) perfLog.jsonFixed = false
    return result as unknown
  } catch (firstError) {
    if (perfLog) logJsonParseDetails(perfLog, text, firstError instanceof Error ? firstError : undefined)

    const extracted = extractJsonFromText(cleaned)
    if (extracted) {
      try {
        const result = JSON.parse(extracted)
        if (perfLog) perfLog.jsonFixed = true
        return result as unknown
      } catch {
        const fixed = attemptJsonRepair(extracted)
        if (fixed !== null) {
          if (perfLog) perfLog.jsonFixed = true
          return fixed as unknown
        }
      }
    }

    throw new AiProviderError(
      'AI返回格式异常，作文已保留。你可以重新批改。',
      undefined,
      'ai_json_parse_error'
    )
  }
}

function sanitizeJsonText(text: string): string {
  let result = text.trim()

  // Remove BOM
  result = result.replace(/^\uFEFF/, '')

  // Strip markdown code fences
  result = stripMarkdownCodeFences(result)

  // Remove text before first { or [
  result = result.replace(/^[^{[]*([{[])/, '$1')

  // Remove trailing commas
  result = result.replace(/,\s*([}\]])/g, '$1')

  // Replace smart quotes
  result = result.replace(/[\u201C\u201D]/g, '"')
  result = result.replace(/[\u2018\u2019]/g, "'")

  // Fix unescaped newlines in strings
  result = result.replace(/(?<=": ")[^"]*?\n[^"]*?(?=")/g, (match) => {
    return match.replace(/\n/g, '\\n')
  })

  // Remove control characters except \n, \r, \t
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  return result
}

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/)
  return (fenced ? fenced[1] : trimmed).trim()
}

function extractJsonFromText(text: string): string | null {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }

  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1)
  }

  return null
}

function attemptJsonRepair(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    // continue with repair attempts
  }

  let repaired = text

  // Remove trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')

  // Add quotes to unquoted keys
  repaired = repaired.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')

  // Replace single quotes with double quotes
  repaired = repaired.replace(/'/g, '"')

  // Replace undefined with null
  repaired = repaired.replace(/:\s*undefined/g, ': null')

  // Fix common JSON errors
  repaired = repaired.replace(/:\s*NaN/g, ': null')
  repaired = repaired.replace(/:\s*Infinity/g, ': null')
  repaired = repaired.replace(/:\s*-Infinity/g, ': null')

  // Remove comments
  repaired = repaired.replace(/\/\/.*$/gm, '')
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '')

  try {
    return JSON.parse(repaired)
  } catch {
    // Try more aggressive repair
  }

  // Try to fix missing closing braces
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  if (openBraces > closeBraces) {
    repaired = repaired + '}'.repeat(openBraces - closeBraces)
    try {
      return JSON.parse(repaired)
    } catch {
      // continue
    }
  }

  // Try to fix missing closing brackets
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/]/g) || []).length
  if (openBrackets > closeBrackets) {
    repaired = repaired + ']'.repeat(openBrackets - closeBrackets)
    try {
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }

  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAnnotation(annotation: Record<string, unknown>): Record<string, unknown> {
  return {
    ...annotation,
    originalText: annotation.originalText ?? annotation.text ?? annotation.word ?? '',
    impactOnScore: annotation.impactOnScore ?? annotation.impact ?? annotation.effect ?? '',
    suggestion: annotation.suggestion ?? annotation.correction ?? annotation.fix ?? ''
  }
}

function normalizeEvaluationObject(value: unknown) {
  if (!isObject(value)) return value
  const criteria: Partial<Record<CriterionKey, unknown>> = isObject(value.criteria) ? { ...value.criteria } : {}
  const legacyKeys: CriterionKey[] = [
    'taskAchievement',
    'taskResponse',
    'coherenceCohesion',
    'lexicalResource',
    'grammaticalRangeAccuracy'
  ]

  for (const key of legacyKeys) {
    if (!criteria[key] && isObject(value[key])) {
      criteria[key] = value[key]
    }
  }

  const strengths = Array.isArray(value.strengths) ? value.strengths
    : Array.isArray(value.merits) ? value.merits
    : Array.isArray(value.advantages) ? value.advantages
    : []

  const weaknesses = Array.isArray(value.weaknesses) ? value.weaknesses
    : Array.isArray(value.weakness) ? value.weakness
    : Array.isArray(value.drawbacks) ? value.drawbacks
    : Array.isArray(value.areas_for_improvement) ? value.areas_for_improvement
    : Array.isArray(value.improvements) ? value.improvements
    : []

  const rawAnnotations = Array.isArray(value.annotations) ? value.annotations : []
  const annotations = rawAnnotations.map((ann) => isObject(ann) ? normalizeAnnotation(ann) : ann)

  return {
    ...value,
    taskAchievement: value.taskAchievement ?? criteria.taskAchievement,
    taskResponse: value.taskResponse ?? criteria.taskResponse,
    coherenceCohesion: value.coherenceCohesion ?? criteria.coherenceCohesion,
    lexicalResource: value.lexicalResource ?? criteria.lexicalResource,
    grammaticalRangeAccuracy: value.grammaticalRangeAccuracy ?? criteria.grammaticalRangeAccuracy,
    overallBand: value.overallBand ?? value.bandEstimate ?? value.band ?? value.score,
    summary: value.summary ?? value.overallFeedback ?? value.feedback ?? value.overall_comment ?? '',
    strengths,
    weaknesses,
    annotations,
    sentenceAnnotations: value.sentenceAnnotations ?? value.sentenceErrors,
    improvedEssay: value.improvedEssay ?? value.revisedEssay,
    nextSteps: value.nextSteps ?? value.suggestions
  }
}

function annotationId(index: number, annotation: z.infer<typeof EssayAnnotationSchema>) {
  if (annotation.id?.trim()) return annotation.id.trim()
  return `ann-${index + 1}-${Math.abs(hashText(`${annotation.start}:${annotation.end}:${annotation.originalText}`))}`
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return hash
}

function isExactAnnotationMatch(essay: string, start: number, end: number, originalText: string) {
  return start >= 0 && end > start && end <= essay.length && essay.slice(start, end) === originalText
}

function findNearbyMatch(essay: string, originalText: string, proposedStart: number) {
  if (!originalText || proposedStart < 0 || proposedStart > essay.length) return null
  const radius = 240
  const windowStart = Math.max(0, proposedStart - radius)
  const windowEnd = Math.min(essay.length, proposedStart + originalText.length + radius)
  const windowText = essay.slice(windowStart, windowEnd)
  const matches: number[] = []
  let cursor = windowText.indexOf(originalText)
  while (cursor !== -1) {
    matches.push(windowStart + cursor)
    cursor = windowText.indexOf(originalText, cursor + Math.max(1, originalText.length))
  }
  if (matches.length === 0) return null
  const start = matches.sort((a, b) => Math.abs(a - proposedStart) - Math.abs(b - proposedStart))[0]
  return { start, end: start + originalText.length }
}

function normalizeAnnotationPositions(
  annotations: z.infer<typeof EssayAnnotationSchema>[],
  essay: string,
  taskType: Exclude<WritingTaskType, 'mock'>
): EssayAnnotation[] {
  return annotations.map((annotation, index) => {
    let start = annotation.start
    let end = annotation.end
    let unresolved = false

    if (!isExactAnnotationMatch(essay, start, end, annotation.originalText)) {
      const nearby = findNearbyMatch(essay, annotation.originalText, start)
      if (nearby && isExactAnnotationMatch(essay, nearby.start, nearby.end, annotation.originalText)) {
        start = nearby.start
        end = nearby.end
      } else {
        start = -1
        end = -1
        unresolved = true
      }
    }

    return {
      id: annotationId(index, annotation),
      start,
      end,
      originalText: annotation.originalText,
      replacement: annotation.replacement,
      category: annotation.category as EssayAnnotationCategory,
      severity: annotation.severity,
      scoreCriterion: normalizeScoreCriterionForTask(annotation.scoreCriterion, taskType),
      explanationZh: annotation.explanationZh,
      explanationEn: annotation.explanationEn,
      impactOnScore: annotation.impactOnScore,
      suggestion: annotation.suggestion,
      unresolved
    }
  })
}

function normalizeScoreCriterionForTask(
  criterion: z.infer<typeof ScoreCriterionSchema>,
  taskType: Exclude<WritingTaskType, 'mock'>
): EssayScoreCriterion {
  if (criterion === 'Task Achievement' && taskType === 'task2') return 'Task Response'
  if (criterion === 'Task Response' && taskType === 'task1') return 'Task Achievement'
  return criterion
}

function sentenceCategoryFromAnnotation(category: EssayAnnotationCategory): SentenceErrorCategory {
  if (category === 'vocabulary' || category === 'collocation' || category === 'style' || category === 'repetition') return 'lexical'
  if (category === 'coherence' || category === 'cohesion' || category === 'unclear-expression') return 'cohesion'
  if (category === 'task-response') return 'task'
  return 'grammar'
}

function sentenceErrorFromAnnotation(annotation: EssayAnnotation): SentenceError {
  return {
    original: annotation.originalText,
    correction: annotation.replacement || annotation.originalText,
    explanation: annotation.explanationEn || annotation.explanationZh,
    chineseExplanation: annotation.explanationZh,
    category: sentenceCategoryFromAnnotation(annotation.category),
    errorType: annotation.category
  }
}

function normalizeEvaluation(
  quickResult: AiQuickEvaluation,
  detailedResult: AiDetailedEvaluation | null,
  provider: string,
  model: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  essay: string
): EssayEvaluation {
  const firstCriterion = taskType === 'task1' ? quickResult.taskAchievement : quickResult.taskResponse
  const firstCriterionKey = taskType === 'task1' ? 'taskAchievement' : 'taskResponse'
  const criteria: Partial<Record<CriterionKey, CriterionScore>> = {
    [firstCriterionKey]: firstCriterion,
    coherenceCohesion: quickResult.coherenceCohesion,
    lexicalResource: quickResult.lexicalResource,
    grammaticalRangeAccuracy: quickResult.grammaticalRangeAccuracy
  }

  const allAnnotations = [
    ...quickResult.annotations,
    ...(detailedResult?.annotations || [])
  ]
  const annotations = normalizeAnnotationPositions(allAnnotations, essay, taskType)
  const annotationSentenceErrors = annotations
    .filter((annotation) => !annotation.unresolved)
    .map(sentenceErrorFromAnnotation)

  const sentenceErrors: SentenceError[] = detailedResult?.sentenceAnnotations && detailedResult.sentenceAnnotations.length > 0
    ? detailedResult.sentenceAnnotations.map((annotation) => ({
        original: annotation.original,
        correction: annotation.correction || annotation.suggested || annotation.original,
        explanation: annotation.explanation,
        chineseExplanation: annotation.chineseExplanation || annotation.explanation,
        category: annotation.category,
        errorType: annotation.errorType || annotation.category,
        sentence: annotation.sentence
      }))
    : annotationSentenceErrors

  const roundedOverall = formatBandNumber(parseBand(quickResult.overallBand))

  return {
    overallBand: roundedOverall,
    bandEstimate: roundedOverall,
    taskAchievement: quickResult.taskAchievement,
    taskResponse: quickResult.taskResponse,
    coherenceCohesion: quickResult.coherenceCohesion,
    lexicalResource: quickResult.lexicalResource,
    grammaticalRangeAccuracy: quickResult.grammaticalRangeAccuracy,
    criteria,
    summary: quickResult.summary,
    overallFeedback: quickResult.summary,
    strengths: quickResult.strengths,
    weaknesses: quickResult.weaknesses,
    annotations,
    annotationVersion: 1,
    sentenceAnnotations: sentenceErrors,
    sentenceErrors,
    suggestions: detailedResult?.nextSteps || [],
    correctedEssay: detailedResult?.correctedEssay || '',
    improvedEssay: detailedResult?.improvedEssay || '',
    revisedEssay: detailedResult?.improvedEssay || '',
    modelEssay: detailedResult?.modelEssay || '',
    nextSteps: detailedResult?.nextSteps || [],
    feedback: [quickResult.summary, ...quickResult.weaknesses].filter(Boolean),
    provider,
    model
  }
}

function normalizeQuickEvaluation(
  quickResult: AiQuickEvaluation,
  provider: string,
  model: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  essay: string
): EssayEvaluation {
  return normalizeEvaluation(quickResult, null, provider, model, taskType, essay)
}

async function fetchCompletion(
  config: AiConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number = MAX_COMPLETION_TOKENS_DETAILED,
  perfLog?: PerformanceLog,
  options?: { responseFormat?: { type: string } }
): Promise<string> {
  const controller = new AbortController()
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS)
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AI_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs)
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    enable_thinking: false,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true
  }

  if (options?.responseFormat) {
    payload.response_format = options.responseFormat
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw httpProviderError(response.status)
    }

    if (!response.body) {
      throw new AiProviderError('AI 服务未返回流式响应。', undefined, 'ai_no_stream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let firstByteRecorded = false
    let buffer = ''
    let finishReason: string | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (!firstByteRecorded && perfLog) {
        perfLog.firstByteAt = Date.now()
        firstByteRecorded = true
        logPerf(perfLog, 'first-byte')
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (typeof delta === 'string') {
            fullContent += delta
          }
          const chunkFinishReason = parsed.choices?.[0]?.finish_reason
          if (chunkFinishReason && !finishReason) {
            finishReason = chunkFinishReason
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (perfLog) {
      perfLog.providerCompletedAt = Date.now()
      perfLog.providerDurationMs = perfLog.providerCompletedAt - perfLog.requestStartAt
      perfLog.responseChars = fullContent.length
      perfLog.finishReason = finishReason
      if (finishReason === 'length') {
        perfLog.wasTruncated = true
      }
      logPerf(perfLog, 'stream-complete')
    }

    if (!fullContent.trim()) {
      throw new AiProviderError('AI 服务返回空内容。', undefined, 'ai_empty_response')
    }

    return fullContent.trim()
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('AI服务响应时间过长，本次批改已停止。作文已保留，可直接重新批改。', undefined, 'ai_request_timeout')
    }
    if (error instanceof TypeError) {
      throw new AiProviderError('网络错误：无法连接 AI 服务，请检查网络或 AI_BASE_URL。', undefined, 'ai_network_error')
    }
    throw new AiProviderError('AI 请求失败：请稍后重试。', undefined, 'ai_provider_failed')
  } finally {
    clearTimeout(timeoutId)
  }
}

function httpProviderError(status: number) {
  if (status === 401) {
    return new AiProviderError('API Key错误：请检查 AI_API_KEY。', status, 'ai_api_key_invalid')
  }
  if (status === 404) {
    return new AiProviderError('模型或接口地址错误：请检查 AI_MODEL 和 AI_BASE_URL。', status, 'ai_model_or_endpoint_invalid')
  }
  if (status === 429) {
    return new AiProviderError('请求过于频繁，请稍后重试。', status, 'ai_rate_limited')
  }
  if (status >= 500) {
    return new AiProviderError(`AI 服务暂时不可用 (HTTP ${status})，请稍后重试。`, status, 'ai_server_error')
  }
  return new AiProviderError(`AI 服务返回 HTTP ${status} 错误。`, status, 'ai_http_error')
}

function validateQuickEvaluation(value: unknown, taskType: Exclude<WritingTaskType, 'mock'>) {
  const normalized = normalizeEvaluationObject(value)
  const parsed = AiQuickEvaluationSchema.safeParse(normalized)
  if (!parsed.success) {
    console.error('[ai-quick] Validation failed. Input:', JSON.stringify(value, null, 2))
    console.error('[ai-quick] Normalized:', JSON.stringify(normalized, null, 2))
    console.error('[ai-quick] Errors:', JSON.stringify(parsed.error.errors, null, 2))
    throw new AiProviderError('AI 返回的快速评分格式不正确。', undefined, 'ai_quick_schema_error')
  }
  if (taskType === 'task1' && !parsed.data.taskAchievement) {
    throw new AiProviderError('AI 返回缺少 Task Achievement 评分。')
  }
  if (taskType === 'task2' && !parsed.data.taskResponse) {
    throw new AiProviderError('AI 返回缺少 Task Response 评分。')
  }
  return parsed.data
}

function validateDetailedEvaluation(value: unknown) {
  const normalized = normalizeEvaluationObject(value)
  const parsed = AiDetailedEvaluationSchema.safeParse(normalized)
  if (!parsed.success) {
    console.error('[ai-detailed] Validation failed. Input:', JSON.stringify(value, null, 2))
    console.error('[ai-detailed] Normalized:', JSON.stringify(normalized, null, 2))
    console.error('[ai-detailed] Errors:', JSON.stringify(parsed.error.errors, null, 2))
    throw new AiProviderError('AI 返回的详细分析格式不正确。', undefined, 'ai_detailed_schema_error')
  }
  return parsed.data
}

export type AiQuickEvaluation = z.infer<typeof AiQuickEvaluationSchema>
export type AiDetailedEvaluation = z.infer<typeof AiDetailedEvaluationSchema>

export function parseAiEvaluationText(
  text: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  provider = 'test',
  model = 'test-model',
  essay = ''
) {
  const parsed = parseJsonObject(text)
  const quickResult = validateQuickEvaluation(parsed, taskType)
  return normalizeQuickEvaluation(quickResult, provider, model, taskType, essay)
}

export async function evaluateEssayWithAi(input: EssayEvaluationInput): Promise<EssayEvaluation> {
  const config = getAiConfig()
  const cacheKey = getCacheKey(input.essay, input.taskType, input.prompt, input.promptVersion, config.model)
  const phase = input.phase || 'full'

  const cached = getCachedEvaluation(cacheKey)
  if (cached) {
    const perfLog = createPerfLog(input.essay, input.taskType, config.model, config.provider, phase)
    perfLog.cacheHit = true
    perfLog.totalDurationMs = 0
    logPerf(perfLog, 'cache-hit')
    return { ...cached, _cacheHit: true } as EssayEvaluation
  }

  const perfLog = createPerfLog(input.essay, input.taskType, config.model, config.provider, phase)
  logPerf(perfLog, 'start')

  try {
    const quickMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: `You are a certified IELTS writing examiner. Return valid JSON only. No markdown, no code fences, no explanations. Response must start with { and end with }.

Required JSON structure:
{
  "overallBand": "6.5",
  "${input.taskType === 'task1' ? 'taskAchievement' : 'taskResponse'}": {"score": "6.0", "feedback": "..."},
  "coherenceCohesion": {"score": "6.5", "feedback": "..."},
  "lexicalResource": {"score": "6.0", "feedback": "..."},
  "grammaticalRangeAccuracy": {"score": "6.5", "feedback": "..."},
  "summary": "brief summary in Chinese",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "annotations": [...]
}`
      },
      {
        role: 'user',
        content: buildQuickEvaluationPrompt(input)
      }
    ]

    logPerf(perfLog, 'quick-phase-start')
    let quickText = await fetchCompletion(config, quickMessages, MAX_COMPLETION_TOKENS_QUICK, perfLog, {
      responseFormat: { type: 'json_object' }
    })

    let quickParsed: unknown
    try {
      const parseStart = Date.now()
      quickParsed = parseJsonObject(quickText, perfLog)
      const quickResult = validateQuickEvaluation(quickParsed, input.taskType)
      perfLog.parseCompletedAt = Date.now()
      perfLog.parseDurationMs = perfLog.parseCompletedAt - parseStart
      perfLog.annotationCount = quickResult.annotations.length
      logPerf(perfLog, 'quick-phase-complete')

      if (phase === 'quick') {
        const result = normalizeQuickEvaluation(quickResult, config.provider, config.model, input.taskType, input.essay)
        perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
        logPerf(perfLog, 'done', { phase: 'quick' })
        return result
      }

      const detailedMessages: Array<{ role: 'system' | 'user'; content: string }> = [
        {
          role: 'system',
          content: 'You are a certified IELTS writing examiner. Return valid JSON only. No markdown, no code fences, no explanations. Response must start with { and end with }.'
        },
        {
          role: 'user',
          content: buildDetailedEvaluationPrompt(input, quickResult)
        }
      ]

      logPerf(perfLog, 'detailed-phase-start')
      const detailedPerfLog = { ...perfLog, phase: 'detailed' as const }
      let detailedText = await fetchCompletion(config, detailedMessages, MAX_COMPLETION_TOKENS_DETAILED, detailedPerfLog, {
        responseFormat: { type: 'json_object' }
      })

      try {
        const detailedParseStart = Date.now()
        const detailedParsed = parseJsonObject(detailedText, detailedPerfLog)
        const detailedResult = validateDetailedEvaluation(detailedParsed)
        detailedPerfLog.parseCompletedAt = Date.now()
        detailedPerfLog.parseDurationMs = (detailedPerfLog.parseCompletedAt - detailedParseStart)

        const saveStart = Date.now()
        const result = normalizeEvaluation(quickResult, detailedResult, config.provider, config.model, input.taskType, input.essay)
        setCachedEvaluation(cacheKey, result)
        perfLog.saveCompletedAt = Date.now()
        perfLog.saveDurationMs = perfLog.saveCompletedAt - saveStart

        perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
        perfLog.annotationCount = result.annotations?.length || 0
        logPerf(perfLog, 'done', { phase: 'full', cached: true })
        return result
      } catch (detailedError) {
        console.warn('[ai-evaluate] Detailed phase failed, using quick result only:', detailedError)
        const result = normalizeQuickEvaluation(quickResult, config.provider, config.model, input.taskType, input.essay)
        setCachedEvaluation(cacheKey, result)
        perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
        logPerf(perfLog, 'done', { phase: 'quick-fallback' })
        return result
      }
    } catch (firstError) {
      if (!(firstError instanceof AiProviderError)) throw firstError

      perfLog.retryCount = 1
      perfLog.retryReason = firstError.message
      logPerf(perfLog, 'retry')

      quickText = await fetchCompletion(config, [
        ...quickMessages,
        {
          role: 'user',
          content: 'Your previous response was invalid JSON. Return corrected valid JSON only.\n\nPrevious:\n' + quickText.slice(0, 200)
        }
      ], MAX_COMPLETION_TOKENS_QUICK, perfLog, {
        responseFormat: { type: 'json_object' }
      })

      const retriedParsed = parseJsonObject(quickText, perfLog)
      const quickResult = validateQuickEvaluation(retriedParsed, input.taskType)
      const result = normalizeQuickEvaluation(quickResult, config.provider, config.model, input.taskType, input.essay)
      setCachedEvaluation(cacheKey, result)
      perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
      logPerf(perfLog, 'done', { phase: 'quick-retry' })
      return result
    }
  } catch (error) {
    perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
    logPerf(perfLog, 'error', { error: error instanceof Error ? error.message : 'unknown' })
    throw error
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAiPromptResponse(raw: any, taskType: string): any {
  if (!raw || typeof raw !== 'object' || taskType !== 'task1') return raw

  const result = { ...raw }

  // Handle chartData -> chartSpec rename
  if (!result.chartSpec && result.chartData && typeof result.chartData === 'object') {
    result.chartSpec = result.chartData
    delete result.chartData
  }

  if (result.chartSpec && typeof result.chartSpec === 'object') {
    const spec = { ...result.chartSpec }

    // Infer kind from questionType if missing
    if (!spec.kind && result.questionType) {
      const kindMap: Record<string, string> = {
        line_chart: 'line',
        bar_chart: 'bar',
        pie_chart: 'pie',
        table: 'table',
        mixed_charts: 'mixed'
      }
      spec.kind = kindMap[result.questionType]
    }

    // Move top-level categories to xAxis.categories
    if (spec.categories && !spec.xAxis) {
      spec.xAxis = { categories: spec.categories }
      delete spec.categories
    }

    // Normalize series: rename data -> values, generate id from name
    if (Array.isArray(spec.series)) {
      spec.series = spec.series.map((s: Record<string, unknown>, index: number) => {
        const series = { ...s }
        // Handle label -> name rename
        if (!series.name && series.label) {
          series.name = series.label
          delete series.label
        }
        if (!series.id && series.name) {
          series.id = String(series.name).toLowerCase().replace(/[^a-z0-9]+/g, '_') || `series_${index}`
        }
        if (!series.values && Array.isArray(series.data)) {
          series.values = series.data
          delete series.data
        }
        return series
      })
    }

    // Convert series to pieData for pie charts
    if (spec.kind === 'pie' && Array.isArray(spec.series) && !spec.pieData) {
      const categories = spec.xAxis?.categories ?? []
      const firstSeries = spec.series[0]
      if (firstSeries && Array.isArray(firstSeries.values)) {
        spec.pieData = firstSeries.values.map((value: number, i: number) => ({
          label: categories[i] || `Category ${i + 1}`,
          value
        }))
        // Merge additional series values if multiple pie series
        if (spec.series.length > 1) {
          for (let s = 1; s < spec.series.length; s++) {
            const series = spec.series[s]
            if (Array.isArray(series.values)) {
              series.values.forEach((value: number, i: number) => {
                const label = series.name || `Series ${s + 1}`
                spec.pieData.push({ label: `${label} - ${categories[i] || i + 1}`, value })
              })
            }
          }
        }
        delete spec.series
      }
    }

    result.chartSpec = spec
  }

  return result
}

export async function generateWritingPromptWithAi(input: PromptGenerationInput): Promise<WritingQuestion> {
  const config = getAiConfig()
  const requestId = `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content: 'You create authentic IELTS Writing prompts. Return machine-readable JSON only and follow requested task constraints exactly. Do not wrap JSON in markdown code blocks.'
    },
    {
      role: 'user',
      content: buildPromptGenerationPrompt(input)
    }
  ]

  console.info(`[task1-gen] requestId=${requestId} taskType=${input.taskType} selectedTask1Type=${input.selection.task1ChartType} resolvedTask1Type=${input.selection.task1ChartType === 'random' ? 'random' : input.selection.task1ChartType}`)

  const text = await fetchCompletion(config, messages, MAX_COMPLETION_TOKENS_DETAILED, undefined, {
    responseFormat: { type: 'json_object' }
  })
  console.info(`[task1-gen] requestId=${requestId} rawResponse length=${text.length} preview=${text.substring(0, 500)}`)

  const rawParsed = parseJsonObject(text)
  const normalizedRaw = normalizeAiPromptResponse(rawParsed, input.taskType)
  const parsed = AiPromptSchema.safeParse(normalizedRaw)

  if (!parsed.success) {
    console.warn(`[task1-gen] requestId=${requestId} schemaErrors=${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    console.warn(`[task1-gen] requestId=${requestId} parsed object:`, JSON.stringify(parseJsonObject(text), null, 2).substring(0, 1000))
    throw new AiProviderError('AI provider response did not match the expected prompt format.', undefined, 'ai_prompt_schema_error')
  }

  const data = parsed.data
  const questionType = data.questionType
  const expectedTask1 = input.selection.task1ChartType
  const expectedTask2 = input.selection.task2EssayType

  if (input.taskType === 'task1' && expectedTask1 !== 'random' && questionType !== expectedTask1) {
    console.warn(`[task1-gen] requestId=${requestId} typeMismatch expected=${expectedTask1} got=${questionType}`)
    throw new AiProviderError('AI生成的 Task 1 题型与用户选择不一致。', undefined, 'ai_prompt_type_mismatch')
  }
  if (input.taskType === 'task2' && expectedTask2 !== 'random' && questionType !== expectedTask2) {
    throw new AiProviderError('AI生成的 Task 2 题型与用户选择不一致。', undefined, 'ai_prompt_type_mismatch')
  }

  const rawResponseHasChartSpec = Boolean(data.chartSpec)
  const chartKind = data.chartSpec?.kind ?? 'none'
  const categoryCount = data.chartSpec?.xAxis?.categories?.length ?? 0
  const seriesCount = data.chartSpec?.series?.length ?? 0
  const dataPointCount = data.chartSpec?.series?.reduce((sum, s) => sum + s.values.length, 0) ?? 0

  console.info(`[task1-gen] requestId=${requestId} rawResponseHasChartSpec=${rawResponseHasChartSpec} chartKind=${chartKind} categoryCount=${categoryCount} seriesCount=${seriesCount} dataPointCount=${dataPointCount}`)

  if (input.taskType === 'task1') {
    const isChartType = ['line_graph', 'bar_chart', 'pie_chart', 'table', 'mixed_charts'].includes(questionType)
    const isProcessType = questionType === 'process'
    const isMapType = ['map', 'floor_plan', 'before_after'].includes(questionType)

    if (isChartType && !data.chartSpec) {
      console.warn(`[task1-gen] requestId=${requestId} missingChartSpec for ${questionType}`)
      throw new AiProviderError('AI返回缺少图表数据。', undefined, 'ai_missing_chart_spec')
    }
    if (isProcessType && !data.processSpec) {
      console.warn(`[task1-gen] requestId=${requestId} missingProcessSpec`)
      throw new AiProviderError('AI返回缺少流程图数据。', undefined, 'ai_missing_process_spec')
    }
    if (isMapType && !data.mapSpec) {
      console.warn(`[task1-gen] requestId=${requestId} missingMapSpec`)
      throw new AiProviderError('AI返回缺少地图数据。', undefined, 'ai_missing_map_spec')
    }
  }

  const now = Date.now().toString(36)
  const question: WritingQuestion = {
    id: `ai-${input.taskType}-${questionType}-${now}`,
    taskType: input.taskType,
    title: data.title,
    promptLead: data.promptLead,
    promptDetail: data.promptDetail,
    durationMinutes: input.taskType === 'task1' ? 20 : 40,
    wordTarget: input.taskType === 'task1' ? 150 : 250,
    questionType,
    topic: data.topic,
    generatedSource: 'ai',
    trainingType: input.taskType === 'task1' ? 'academic' : undefined,
    structuredData: data.structuredData,
    chartSpec: data.chartSpec,
    processSpec: data.processSpec,
    mapSpec: data.mapSpec
  } as WritingQuestion

  console.info(`[task1-gen] requestId=${requestId} fallbackUsed=false rendererSelected=${questionType}`)
  return question
}
