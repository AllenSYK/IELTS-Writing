import { z } from 'zod'
import { calculateEssayOverallBand, formatBandNumber } from '@/lib/ielts-scoring'
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
import {
  Task1ChartSpecSchema,
  normalizeTask1ChartSpec,
  prepareTask1ChartSpec,
  type Task1ChartKind
} from '@/lib/task1-chart-schema'
import { getFallbackQuestionsByType } from '@/lib/task1-fallback-questions'

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

export type EssayTextBlock = {
  index: number
  text: string
  baseOffset: number
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
  if (stage !== 'error') return
  const elapsed = Date.now() - log.requestStartAt
  console.error('[ai-evaluate]', {
    requestId: log.requestId,
    stage,
    taskType: log.taskType,
    model: log.model,
    provider: log.provider,
    phase: log.phase,
    elapsedMs: elapsed,
    retryCount: log.retryCount,
    error: typeof extra?.error === 'string' ? extra.error : 'unknown'
  })
}

function logJsonParseDetails(log: PerformanceLog, rawText: string, error?: Error) {
  const textLength = rawText.length
  const containsMarkdown = /```(?:json|JSON)?\s*[\s\S]*?\s*```/.test(rawText) || rawText.includes('```')
  const wasTruncated = rawText.length > 0 && !rawText.trimEnd().endsWith('}')

  log.containsMarkdown = containsMarkdown
  log.wasTruncated = wasTruncated
  log.responseChars = textLength

  if (error) {
    const errorPosition = extractJsonErrorPosition(error.message)
    log.jsonParseErrorPosition = errorPosition
    console.warn('[ai-json-invalid]', {
      requestId: log.requestId,
      model: log.model,
      responseChars: textLength,
      containsMarkdown,
      wasTruncated,
      parseErrorPosition: errorPosition
    })
  }
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
const MAX_COMPLETION_TOKENS_SCORING = 3200
const MAX_COMPLETION_TOKENS_ANNOTATION = 6500
const MAX_COMPLETION_TOKENS_REWRITE = 5200
const MAX_COMPLETION_TOKENS_DETAILED = 4000
const GRADING_VERSION = 'official-rubric-v2'
const ANNOTATION_VERSION = 2
const MAX_ANNOTATION_BLOCK_CHARS = 1800

const ScoreSchema = z.union([z.string(), z.number()]).transform((value, context) => {
  if (typeof value === 'string' && !value.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Score cannot be empty.' })
    return z.NEVER
  }
  const numeric = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Score must be an integer from 0 to 9.' })
    return z.NEVER
  }
  return String(numeric)
})

const CriterionSchema = z.object({
  score: ScoreSchema,
  feedback: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  whyNotHigher: z.string().optional()
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

const LegacyEssayAnnotationSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  start: z.number().int().optional(),
  end: z.number().int().optional(),
  originalText: z.string().min(1).default(''),
  replacement: z.string().min(1).optional(),
  category: AnnotationCategorySchema,
  severity: z.enum(['low', 'medium', 'high']),
  scoreCriterion: ScoreCriterionSchema,
  explanationZh: z.string().min(1),
  explanationEn: z.string().optional(),
  impactOnScore: z.string().default(''),
  suggestion: z.string().min(1)
})

const AiScoringSchema = z.object({
  overallBand: z.union([z.string(), z.number()]).optional(),
  taskAchievement: CriterionSchema.optional(),
  taskResponse: CriterionSchema.optional(),
  coherenceCohesion: CriterionSchema,
  lexicalResource: CriterionSchema,
  grammaticalRangeAccuracy: CriterionSchema,
  summary: z.string().min(1),
  strengths: z.array(z.string()).max(3),
  weaknesses: z.array(z.string()).max(3),
  annotations: z.array(LegacyEssayAnnotationSchema).default([])
})

const BlockAnnotationSchema = z.object({
  originalText: z.string().min(1),
  occurrence: z.coerce.number().int().default(1).transform((value) => Math.max(1, value)),
  replacement: z.string().min(1).optional(),
  category: AnnotationCategorySchema,
  severity: z.enum(['low', 'medium', 'high']),
  scoreCriterion: ScoreCriterionSchema,
  explanationZh: z.string().min(1),
  explanationEn: z.string().optional(),
  impactOnScore: z.string().default(''),
  suggestion: z.string().min(1)
})

const BlockAnnotationResponseSchema = z.object({
  annotations: z.array(BlockAnnotationSchema).default([]),
  checkedWholeBlock: z.boolean()
})

const RewriteResponseSchema = z.object({
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
  chartSpec: Task1ChartSpecSchema.optional(),
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

const TaskResponseRubric = `TASK RESPONSE
Band 9: Fully and deeply addresses every part of the task. Presents a clear, fully developed position. Ideas are directly relevant, fully extended and convincingly supported. Content lapses are extremely rare.
Band 8: Sufficiently addresses every part of the task. Presents a clear and well-developed position. Main ideas are relevant, extended and supported, with only occasional minor omissions or weaknesses.
Band 7: Addresses the main parts of the task. Presents a clear position throughout. Main ideas are relevant and generally developed, although some support may be general, incomplete or insufficiently precise.
Band 6: Addresses the main parts of the task, but some parts may receive more attention than others. Presents a relevant position, although conclusions may be unclear, repetitive or insufficiently developed. Main ideas are relevant but some are inadequately developed or supported.
Band 5: Addresses the task only partially. A position is present but may be unclear or insufficiently developed. Ideas are limited, repetitive or insufficiently supported, and some material may be irrelevant.
Band 4: Responds to the task only minimally or inappropriately. A position is difficult to identify. Main ideas are unclear, repetitive, insufficiently relevant or poorly supported.
Band 3: Does not adequately address the task or significantly misunderstands it. No clear position is identifiable. Very few ideas are presented and they are largely irrelevant or undeveloped.
Band 2: Barely responds to the task. No identifiable position. May present one or two undeveloped and largely irrelevant ideas.
Band 1: Content is almost entirely unrelated to the task.
Band 0: No answer, the response is not written in English, or the response is demonstrably fully memorised.`

const TaskAchievementRubric = `TASK ACHIEVEMENT — ACADEMIC
Band 9: Fully satisfies all task requirements. Selects and clearly presents all key features. Provides a precise overview. Comparisons are accurate, relevant and fully supported by appropriate data. Content lapses are extremely rare.
Band 8: Covers all task requirements sufficiently. Selects and presents the key features clearly. Provides a clear overview. Important comparisons and data are accurate, with only minor omissions.
Band 7: Covers the requirements of the task. Presents a clear overview. Identifies the main trends, differences or stages, but some details may be insufficiently developed or less precise.
Band 6: Addresses the task requirements and provides a relevant overview, although it may be incomplete or mechanical. Key features are identified, but some may be insufficiently highlighted, inaccurately supported or mixed with unnecessary detail.
Band 5: Generally addresses the task but may not cover all key features. The overview may be unclear, incomplete or absent. Important details may be omitted, inaccurate or presented as a list without effective comparison.
Band 4: Attempts the task but covers few key features. There may be no clear overview. Information may be inaccurate, irrelevant, repetitive or poorly organised.
Band 3: Fails to address the task adequately. Key features are largely missing or misunderstood. The response may consist mainly of inaccurate or irrelevant details.
Band 2: Barely responds to the task. Very little relevant information is presented.
Band 1: The response is almost entirely unrelated to the visual information.
Band 0: No answer, the response is not written in English, or the response is demonstrably fully memorised.`

const LetterTaskAchievementRubric = `TASK ACHIEVEMENT — GENERAL TRAINING LETTER
Assess how clearly the purpose of the letter is stated, whether every bullet point is covered and sufficiently developed, whether tone and register suit the recipient and situation, whether letter conventions are appropriate, and whether important requirements are omitted or irrelevant material is included.
Band 9 means every requirement is fully and naturally satisfied with a consistently appropriate tone. Band 8 allows only minor omissions. Band 7 covers all main requirements clearly with generally appropriate tone. Band 6 addresses the main requirements but development or tone may be uneven. Band 5 is partial, underdeveloped or inconsistently appropriate. Band 4 is minimal or frequently inappropriate. Band 3 substantially misunderstands or omits the task. Band 2 barely responds. Band 1 is almost entirely unrelated. Band 0 is no answer, not English, or demonstrably fully memorised. Do not require a chart overview for a letter.`

const CoherenceRubric = `COHERENCE AND COHESION
Band 9: Information and ideas progress effortlessly and logically. Cohesive devices are used naturally and unobtrusively. Paragraphing is skilfully managed.
Band 8: Information and ideas are logically sequenced and clearly progressed. Cohesion is well managed. Paragraphing is sufficient and appropriate, with only occasional minor lapses.
Band 7: Information and ideas are logically organised with clear progression. A range of cohesive devices is used flexibly, although there may be occasional overuse, underuse or misuse. Paragraphing is generally effective.
Band 6: The response is generally coherent with an overall progression. Cohesive devices are used with some effectiveness but may be mechanical, repetitive, inaccurate or omitted. Paragraph focus or organisation may occasionally be unclear.
Band 5: Some organisation is evident, but overall progression is not consistently clear. Relationships between ideas are understandable but not smooth. Cohesive devices may be limited, repetitive or inaccurate. Paragraphing may be inadequate.
Band 4: Ideas are present but not arranged coherently. There is no clear progression. Relationships between ideas are often unclear. Basic cohesive devices are repetitive or inaccurate, and paragraphing is weak.
Band 3: There is little logical organisation. Ideas are difficult to connect. Cohesive devices are very limited or frequently inaccurate.
Band 2: There is very little control of organisation or cohesion.
Band 1: The response does not communicate a coherent message.
Band 0: No answer.`

const LexicalRubric = `LEXICAL RESOURCE
Band 9: Uses a very wide range of vocabulary with full flexibility, precision and naturalness. Collocation and register are controlled skilfully. Spelling and word-formation errors are extremely rare.
Band 8: Uses a wide vocabulary resource fluently and flexibly to convey precise meanings. Less common vocabulary and collocation are handled skilfully. Occasional inaccuracies do not reduce clarity.
Band 7: Uses sufficient vocabulary to allow flexibility and some precision. Uses some less common vocabulary and shows awareness of style and collocation. A small number of word-choice, spelling or word-formation errors remain.
Band 6: Uses an adequate range of vocabulary for the task. Meaning is generally clear, although range or precision may be limited. Attempts at less common vocabulary may cause inaccuracies. Errors rarely prevent communication.
Band 5: Uses a limited but minimally adequate vocabulary. Repetition and simplification are noticeable. Word-choice, spelling or word-formation errors may cause some difficulty for the reader.
Band 4: Uses mainly basic and repetitive vocabulary, which may be inappropriate for the task. Formulaic language may be overused. Word-choice and word-formation errors sometimes distort meaning.
Band 3: Uses a very limited vocabulary. Spelling and word-formation errors seriously restrict communication.
Band 2: Uses an extremely limited vocabulary with very little control.
Band 1: Uses only isolated words.
Band 0: No answer.`

const GrammarRubric = `GRAMMATICAL RANGE AND ACCURACY
Band 9: Uses a wide range of sentence structures with full flexibility and accuracy. Grammar and punctuation are controlled extremely well. Errors are extremely rare and do not affect communication.
Band 8: Uses a wide range of structures flexibly and accurately. Most sentences are error-free. Occasional errors are non-systematic and have almost no effect on communication.
Band 7: Uses a variety of complex structures with reasonable flexibility and accuracy. Error-free sentences are frequent. A small number of grammatical errors remain but do not impede understanding.
Band 6: Uses a mix of simple and complex sentence forms, but flexibility is limited. Complex structures are less accurate than simple structures. Grammar and punctuation errors occur, but they rarely prevent understanding.
Band 5: Uses a limited and repetitive range of structures. Attempts complex sentences but these are often inaccurate. Simple sentences are usually more accurate. Errors may cause some difficulty for the reader.
Band 4: Uses a very limited range of structures, mainly simple sentences. Subordination is limited. Errors are frequent and may distort meaning. Punctuation control is weak.
Band 3: Attempts sentence forms, but grammar and punctuation errors predominate and frequently distort meaning.
Band 2: Cannot use sentence forms correctly except in memorised or formulaic expressions.
Band 1: Cannot produce functional sentence structures.
Band 0: No answer.`

const ScoringSystemPrompt = `You are a strict, evidence-based IELTS Writing examiner.

Use the supplied condensed IELTS Writing Public Band Descriptors.

SCORING RULES:
1. Assess the response only against the actual task and the four IELTS criteria.
2. Judge every criterion independently.
3. Do not inflate a score merely because the response sounds fluent.
4. Do not reduce a score merely because the candidate expresses an unusual opinion.
5. Award the highest descriptor band that is consistently supported by the response.
6. Do not award a higher band when an important limiting feature from a lower band is clearly present.
7. Criterion scores must be integers from 0 to 9.
8. Do not calculate or return the final overall band. The server calculates it.
9. Feedback must be written in Simplified Chinese.
10. Evidence quoted from the candidate response must remain in English.
11. For each criterion, explain why the awarded band is justified.
12. For each criterion, provide specific evidence from the response.
13. For each criterion, explain why the next higher band was not awarded.
14. Do not score by counting errors alone.
15. Consider range, frequency, severity, clarity and effect on communication.
16. Do not treat a merely optional stylistic improvement as a definite error.
17. Return valid JSON only.
18. Do not use markdown.
19. Do not wrap the response in code fences.
20. The response must start with { and end with }.`

const AnnotationSystemPrompt = `You are an exhaustive IELTS Writing error annotator.

Inspect the supplied text block from beginning to end.

Identify every distinct, defensible language error or scoring problem, including grammar, spelling, punctuation, word choice, word formation, collocation, sentence structure, unclear expression, repetition that damages quality, cohesion, coherence, and task response or task achievement.

RULES:
1. There is no requested numerical limit on annotations.
2. Do not stop after finding several obvious errors.
3. Check every sentence and every relevant phrase.
4. Annotate each distinct issue once.
5. Do not mark a merely optional stylistic preference as an error.
6. Copy originalText exactly from the supplied text block.
7. Never paraphrase originalText.
8. Give a concrete replacement whenever a local correction is possible.
9. For paragraph-level logic or task problems, replacement may be omitted, but the suggestion must be actionable.
10. Explanations must be concise and written in Simplified Chinese.
11. Original quotations and replacements must remain in English.
12. Return valid JSON only.
13. Do not use markdown.
14. Do not use code fences.
15. Set checkedWholeBlock to true only after checking the complete supplied block.`

export function officialTaskRubric(
  taskType: Exclude<WritingTaskType, 'mock'>,
  questionType?: string
) {
  if (taskType === 'task2') return TaskResponseRubric
  return questionType === 'letter' ? LetterTaskAchievementRubric : TaskAchievementRubric
}

function buildScoringPrompt(input: EssayEvaluationInput) {
  const criterionKey = input.taskType === 'task1' ? 'taskAchievement' : 'taskResponse'
  return [
    `taskType: ${input.taskType}`,
    `questionType: ${input.questionType || 'unspecified'}`,
    'Complete task:',
    input.prompt || 'No separate task prompt was supplied.',
    '',
    'Condensed official descriptors:',
    officialTaskRubric(input.taskType, input.questionType),
    CoherenceRubric,
    LexicalRubric,
    GrammarRubric,
    '',
    `Score these four criteria independently: ${criterionKey}, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy.`,
    'Each criterion score must be an integer from 0 to 9. Do not return overallBand.',
    `Return JSON with ${criterionKey}, coherenceCohesion, lexicalResource, grammaticalRangeAccuracy, summary, strengths, and weaknesses.`,
    'Each criterion must contain score, feedback, evidence, and whyNotHigher. JSON only.',
    `Required shape: {"${criterionKey}":{"score":6,"feedback":"中文说明","evidence":["candidate quotation"],"whyNotHigher":"中文说明"},"coherenceCohesion":{"score":6,"feedback":"中文说明","evidence":[],"whyNotHigher":"中文说明"},"lexicalResource":{"score":6,"feedback":"中文说明","evidence":[],"whyNotHigher":"中文说明"},"grammaticalRangeAccuracy":{"score":6,"feedback":"中文说明","evidence":[],"whyNotHigher":"中文说明"},"summary":"中文总体评价","strengths":[],"weaknesses":[]}`,
    '',
    'Candidate response:',
    input.essay
  ].join('\n')
}

function buildAnnotationPrompt(input: EssayEvaluationInput, block: EssayTextBlock) {
  return [
    `taskType: ${input.taskType}`,
    `questionType: ${input.questionType || 'unspecified'}`,
    'Complete task:',
    input.prompt || 'No separate task prompt was supplied.',
    '',
    'Complete candidate response for context:',
    input.essay,
    '',
    `Current block index: ${block.index}`,
    'Inspect only the current block below, from beginning to end. There is no annotation limit.',
    'originalText and occurrence must refer only to this current block. Do not return start or end offsets.',
    'Return JSON only with annotations and checkedWholeBlock.',
    'Required shape: {"annotations":[{"originalText":"exact block text","occurrence":1,"replacement":"corrected text","category":"grammar","severity":"medium","scoreCriterion":"Grammatical Range and Accuracy","explanationZh":"中文解释","explanationEn":"optional","impactOnScore":"中文影响","suggestion":"中文建议"}],"checkedWholeBlock":true}',
    '',
    'Current block:',
    block.text
  ].join('\n')
}

function buildRewritePrompt(input: EssayEvaluationInput, scoring: AiScoringResult, annotations: EssayAnnotation[]) {
  const maxImprovedWords = Math.ceil(input.essay.split(/\s+/).filter(Boolean).length * 1.15)
  const task1ModelLength = input.questionType === 'letter' ? 'a natural IELTS letter length' : '170-210 words'
  const mainIssues = annotations.slice(0, 40).map((annotation) => ({
    text: annotation.originalText,
    category: annotation.category,
    explanation: annotation.explanationZh
  }))
  return [
    'Generate an improved essay, a model essay, and concrete next steps from the task, candidate response, official scores, and main issues.',
    'The improvedEssay must preserve the candidate’s position and main ideas while improving organisation, vocabulary, and grammar.',
    `Keep improvedEssay within about ${maxImprovedWords} words unless the original is clearly below the minimum length.`,
    `The modelEssay must fully answer the task and be ${input.taskType === 'task1' ? task1ModelLength : '250-290 words'}.`,
    'Return at most four specific nextSteps based on actual weaknesses.',
    'Do not return annotations or correctedEssay. Return JSON only without markdown.',
    'Required shape: {"improvedEssay":"...","modelEssay":"...","nextSteps":["..."]}',
    '',
    `taskType: ${input.taskType}`,
    `questionType: ${input.questionType || 'unspecified'}`,
    'Complete task:',
    input.prompt || 'No separate task prompt was supplied.',
    'Candidate response:',
    input.essay,
    'Official criterion scoring:',
    JSON.stringify(scoring),
    'Main detected issues:',
    JSON.stringify(mainIssues)
  ].join('\n')
}

function essayHash(essay: string): string {
  let hash = 2166136261
  for (let i = 0; i < essay.length; i++) {
    hash ^= essay.charCodeAt(i)
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

export function getEvaluationCacheKey({
  essay,
  taskType,
  prompt,
  promptVersion,
  model,
  phase = 'full',
  gradingVersion = GRADING_VERSION
}: {
  essay: string
  taskType: string
  prompt?: string
  promptVersion?: string
  model?: string
  phase?: string
  gradingVersion?: string
}): string {
  const eHash = essayHash(essay)
  const pHash = prompt ? essayHash(prompt) : 'no-prompt'
  const pvHash = promptVersion ? essayHash(promptVersion) : 'v1'
  const mHash = model ? essayHash(model) : 'default'
  return `${eHash}:${taskType}:${pHash}:${pvHash}:${mHash}:${phase}:${gradingVersion}`
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
      chartType === 'mixed_charts' ? '- A mixed chart MUST contain chartSpec.charts with exactly two independently renderable chart objects. Each object must include chartType, title, units, legend, and all data required by that chart type.' : '',
      chartType === 'mixed_charts' ? '- Use canonical fields only: xAxis.categories, series[].values, pieData, and tableData. Do not use barData, pieChart, labels, datasets, or series[].data.' : '',
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
        const mixedCharts = task1Subtype === 'line_table'
          ? [
              {
                chartType: 'line',
                title: 'Total University Enrolment',
                xAxis: { label: 'Year', categories: ['2018', '2020', '2022', '2024'] },
                yAxis: { label: 'Students', unit: 'thousands' },
                series: [
                  { id: 'enrolment', name: 'Total enrolment', type: 'line', values: [1280, 1360, 1490, 1580] }
                ],
                units: 'thousands',
                legend: true
              },
              {
                chartType: 'table',
                title: 'International Students by Faculty (2024)',
                tableData: {
                  columns: ['Faculty', 'International students'],
                  rows: [['Business', '31%'], ['Engineering', '27%'], ['Arts', '19%']]
                },
                units: '%',
                legend: false
              }
            ]
          : task1Subtype === 'bar_pie' || task1Subtype === 'two_pies'
            ? [
                {
                  chartType: task1Subtype === 'two_pies' ? 'pie' : 'bar',
                  title: task1Subtype === 'two_pies' ? 'Energy Sources in 2015' : 'Revenue by Region',
                  ...(task1Subtype === 'two_pies'
                    ? {
                        pieData: [
                          { label: 'Gas', value: 40 },
                          { label: 'Renewables', value: 25 },
                          { label: 'Coal', value: 20 },
                          { label: 'Other', value: 15 }
                        ]
                      }
                    : {
                        xAxis: { label: 'Region', categories: ['North America', 'Europe', 'Asia'] },
                        yAxis: { label: 'Revenue', unit: '$ million' },
                        series: [
                          { id: 'revenue', name: 'Revenue', type: 'bar', values: [128, 96, 112] }
                        ]
                      }),
                  units: task1Subtype === 'two_pies' ? '%' : '$ million',
                  legend: true
                },
                {
                  chartType: 'pie',
                  title: task1Subtype === 'two_pies' ? 'Energy Sources in 2025' : 'Operating Costs',
                  pieData: [
                    { label: 'Staff', value: 38 },
                    { label: 'Property', value: 24 },
                    { label: 'Marketing', value: 18 },
                    { label: 'Other', value: 20 }
                  ],
                  units: '%',
                  legend: true
                }
              ]
            : [
                {
                  chartType: 'bar',
                  title: 'Annual Revenue',
                  xAxis: { label: 'Year', categories: ['2018', '2020', '2022', '2024'] },
                  yAxis: { label: 'Revenue', unit: '$ million' },
                  series: [
                    { id: 'revenue', name: 'Revenue', type: 'bar', values: [45, 48, 78, 105] }
                  ],
                  units: '$ million',
                  legend: true
                },
                {
                  chartType: 'line',
                  title: 'Annual Growth Rate',
                  xAxis: { label: 'Year', categories: ['2018', '2020', '2022', '2024'] },
                  yAxis: { label: 'Growth rate', unit: '%' },
                  series: [
                    { id: 'growth', name: 'Growth rate', type: 'line', values: [8, -8, 20, 14] }
                  ],
                  units: '%',
                  legend: true
                }
              ]
        exampleJson = {
          title: 'Academic Task 1 - Mixed Chart',
          promptLead: 'The charts below show two related sets of data for the same topic.',
          promptDetail: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
          questionType: 'mixed_charts',
          chartSpec: {
            kind: 'mixed',
            title: 'Two Related Data Sets',
            charts: mixedCharts,
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
      '批改结果格式异常，作文已保留。你可以重新批改。',
      undefined,
      'ai_json_parse_error'
    )
  }
}

function sanitizeJsonText(text: string): string {
  let result = text.trim()

  result = result.replace(/^\uFEFF/, '')

  result = stripMarkdownCodeFences(result)

  result = result.replace(/^[^{[]*([{[])/, '$1')

  result = result.replace(/,\s*([}\]])/g, '$1')

  result = result.replace(/[\u201C\u201D]/g, '"')
  result = result.replace(/[\u2018\u2019]/g, "'")

  result = result.replace(/(?<=": ")[^"]*?\n[^"]*?(?=")/g, (match) => {
    return match.replace(/\n/g, '\\n')
  })

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
  }

  let repaired = text

  repaired = repaired.replace(/,\s*([}\]])/g, '$1')

  repaired = repaired.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')

  repaired = repaired.replace(/'/g, '"')

  repaired = repaired.replace(/:\s*undefined/g, ': null')

  repaired = repaired.replace(/:\s*NaN/g, ': null')
  repaired = repaired.replace(/:\s*Infinity/g, ': null')
  repaired = repaired.replace(/:\s*-Infinity/g, ': null')

  repaired = repaired.replace(/\/\/.*$/gm, '')
  repaired = repaired.replace(/\/\*[\s\S]*?\*\//g, '')

  try {
    return JSON.parse(repaired)
  } catch {
  }

  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  if (openBraces > closeBraces) {
    repaired = repaired + '}'.repeat(openBraces - closeBraces)
    try {
      return JSON.parse(repaired)
    } catch {
    }
  }

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

function splitLongBlock(text: string, baseOffset: number) {
  const blocks: Array<{ text: string; baseOffset: number }> = []
  let localOffset = 0

  while (text.length - localOffset > MAX_ANNOTATION_BLOCK_CHARS) {
    const limit = localOffset + MAX_ANNOTATION_BLOCK_CHARS
    const searchStart = localOffset + Math.floor(MAX_ANNOTATION_BLOCK_CHARS * 0.55)
    const window = text.slice(searchStart, limit)
    const boundaryMatches = [...window.matchAll(/[.!?](?:["')\]]+)?\s+|\n+/g)]
    const boundary = boundaryMatches.length > 0
      ? searchStart + (boundaryMatches.at(-1)?.index ?? 0) + (boundaryMatches.at(-1)?.[0].length ?? 0)
      : limit
    const end = Math.max(localOffset + 1, boundary)
    blocks.push({ text: text.slice(localOffset, end), baseOffset: baseOffset + localOffset })
    localOffset = end
  }

  if (localOffset < text.length) {
    blocks.push({ text: text.slice(localOffset), baseOffset: baseOffset + localOffset })
  }
  return blocks
}

export function splitEssayIntoBlocks(essay: string): EssayTextBlock[] {
  if (!essay) return []
  const paragraphSegments: Array<{ text: string; baseOffset: number }> = []
  const separator = /(?:\r?\n[ \t]*){2,}/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = separator.exec(essay)) !== null) {
    const end = match.index + match[0].length
    paragraphSegments.push({ text: essay.slice(cursor, end), baseOffset: cursor })
    cursor = end
  }
  if (cursor < essay.length) paragraphSegments.push({ text: essay.slice(cursor), baseOffset: cursor })
  if (paragraphSegments.length === 0) paragraphSegments.push({ text: essay, baseOffset: 0 })

  const blocks = paragraphSegments.flatMap((segment) =>
    segment.text.length > MAX_ANNOTATION_BLOCK_CHARS
      ? splitLongBlock(segment.text, segment.baseOffset)
      : [segment]
  )

  return blocks.map((block, index) => ({ ...block, index }))
}

function findOccurrence(text: string, originalText: string, occurrence: number) {
  let localStart = -1
  let searchFrom = 0
  for (let index = 0; index < occurrence; index += 1) {
    localStart = text.indexOf(originalText, searchFrom)
    if (localStart === -1) return -1
    searchFrom = localStart + Math.max(1, originalText.length)
  }
  return localStart
}

export function locateBlockAnnotation(
  rawAnnotation: z.infer<typeof BlockAnnotationSchema>,
  block: EssayTextBlock,
  taskType: Exclude<WritingTaskType, 'mock'>
): EssayAnnotation {
  const occurrence = Math.max(1, rawAnnotation.occurrence || 1)
  const localStart = findOccurrence(block.text, rawAnnotation.originalText, occurrence)
  const start = localStart === -1 ? -1 : block.baseOffset + localStart
  const end = start === -1 ? -1 : start + rawAnnotation.originalText.length
  const unresolved = localStart === -1
  const stableKey = [
    unresolved ? `block-${block.index}` : `${start}:${end}`,
    rawAnnotation.category,
    rawAnnotation.originalText,
    rawAnnotation.replacement || ''
  ].join('|')

  return {
    id: `ann-${Math.abs(hashText(stableKey))}`,
    start,
    end,
    originalText: rawAnnotation.originalText,
    replacement: rawAnnotation.replacement,
    category: rawAnnotation.category as EssayAnnotationCategory,
    severity: rawAnnotation.severity,
    scoreCriterion: normalizeScoreCriterionForTask(rawAnnotation.scoreCriterion, taskType),
    explanationZh: rawAnnotation.explanationZh,
    explanationEn: rawAnnotation.explanationEn,
    impactOnScore: rawAnnotation.impactOnScore,
    suggestion: rawAnnotation.suggestion,
    unresolved,
    blockIndex: block.index
  }
}

function normalizeReplacement(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() || ''
}

const severityRank = { high: 3, medium: 2, low: 1 } as const

export function dedupeAndSortAnnotations(annotations: EssayAnnotation[]) {
  const seen = new Set<string>()
  return annotations
    .filter((annotation) => {
      const key = annotation.unresolved
        ? `unresolved:${annotation.blockIndex ?? -1}:${annotation.originalText}:${annotation.category}:${normalizeReplacement(annotation.replacement)}`
        : `resolved:${annotation.start}:${annotation.end}:${annotation.category}:${normalizeReplacement(annotation.replacement)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      if (Boolean(a.unresolved) !== Boolean(b.unresolved)) return a.unresolved ? 1 : -1
      if (!a.unresolved && !b.unresolved) {
        if (a.start !== b.start) return a.start - b.start
        if (a.end !== b.end) return a.end - b.end
        const severity = severityRank[b.severity] - severityRank[a.severity]
        if (severity !== 0) return severity
      }
      return (a.blockIndex ?? 0) - (b.blockIndex ?? 0)
    })
}

function overlaps(a: Pick<EssayAnnotation, 'start' | 'end'>, b: Pick<EssayAnnotation, 'start' | 'end'>) {
  return a.start < b.end && b.start < a.end
}

function correctionPriority(a: EssayAnnotation, b: EssayAnnotation) {
  const severity = severityRank[b.severity] - severityRank[a.severity]
  if (severity !== 0) return severity
  const length = (b.end - b.start) - (a.end - a.start)
  if (length !== 0) return length
  return a.start - b.start
}

export function selectApplicableCorrections(essay: string, annotations: EssayAnnotation[]) {
  const candidates = annotations
    .filter((annotation) =>
      Boolean(annotation.replacement) &&
      isExactAnnotationMatch(essay, annotation.start, annotation.end, annotation.originalText)
    )
    .slice()
    .sort(correctionPriority)
  const selected: EssayAnnotation[] = []

  for (const candidate of candidates) {
    if (!selected.some((annotation) => overlaps(annotation, candidate))) selected.push(candidate)
  }
  return selected
}

export function buildCorrectedEssay(essay: string, annotations: EssayAnnotation[]) {
  return selectApplicableCorrections(essay, annotations)
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, annotation) => `${text.slice(0, annotation.start)}${annotation.replacement}${text.slice(annotation.end)}`,
      essay
    )
}

function normalizeLegacyAnnotationPositions(
  annotations: z.infer<typeof LegacyEssayAnnotationSchema>[],
  essay: string,
  taskType: Exclude<WritingTaskType, 'mock'>
) {
  return annotations.map((annotation, index): EssayAnnotation => {
    const proposedStart = annotation.start ?? -1
    const proposedEnd = annotation.end ?? -1
    const resolved = isExactAnnotationMatch(essay, proposedStart, proposedEnd, annotation.originalText)
    const start = resolved ? proposedStart : -1
    const end = resolved ? proposedEnd : -1
    const stableKey = `${start}:${end}:${annotation.category}:${annotation.originalText}:${annotation.replacement || ''}`
    return {
      id: annotation.id?.trim() || `ann-${Math.abs(hashText(stableKey))}-${index}`,
      start,
      end,
      originalText: annotation.originalText,
      replacement: annotation.replacement,
      category: annotation.category,
      severity: annotation.severity,
      scoreCriterion: normalizeScoreCriterionForTask(annotation.scoreCriterion, taskType),
      explanationZh: annotation.explanationZh,
      explanationEn: annotation.explanationEn,
      impactOnScore: annotation.impactOnScore,
      suggestion: annotation.suggestion,
      unresolved: !resolved
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
  scoringResult: AiScoringResult,
  annotations: EssayAnnotation[],
  rewriteResult: AiRewriteResult | null,
  annotationWarnings: string[],
  provider: string,
  model: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  essay: string
): EssayEvaluation {
  const firstCriterion = taskType === 'task1' ? scoringResult.taskAchievement : scoringResult.taskResponse
  const firstCriterionKey = taskType === 'task1' ? 'taskAchievement' : 'taskResponse'
  const criteria: Partial<Record<CriterionKey, CriterionScore>> = {
    [firstCriterionKey]: firstCriterion,
    coherenceCohesion: scoringResult.coherenceCohesion,
    lexicalResource: scoringResult.lexicalResource,
    grammaticalRangeAccuracy: scoringResult.grammaticalRangeAccuracy
  }
  const overall = calculateEssayOverallBand([
    firstCriterion?.score,
    scoringResult.coherenceCohesion.score,
    scoringResult.lexicalResource.score,
    scoringResult.grammaticalRangeAccuracy.score
  ])
  if (overall === null) {
    throw new AiProviderError('AI 返回的四项评分不完整，无法计算总分。', undefined, 'ai_scoring_incomplete')
  }
  const roundedOverall = formatBandNumber(overall)
  const sentenceErrors = annotations.map(sentenceErrorFromAnnotation)

  return {
    overallBand: roundedOverall,
    bandEstimate: roundedOverall,
    taskAchievement: scoringResult.taskAchievement,
    taskResponse: scoringResult.taskResponse,
    coherenceCohesion: scoringResult.coherenceCohesion,
    lexicalResource: scoringResult.lexicalResource,
    grammaticalRangeAccuracy: scoringResult.grammaticalRangeAccuracy,
    criteria,
    summary: scoringResult.summary,
    overallFeedback: scoringResult.summary,
    strengths: scoringResult.strengths,
    weaknesses: scoringResult.weaknesses,
    annotations,
    annotationVersion: ANNOTATION_VERSION,
    sentenceAnnotations: sentenceErrors,
    sentenceErrors,
    suggestions: rewriteResult?.nextSteps || [],
    correctedEssay: buildCorrectedEssay(essay, annotations),
    improvedEssay: rewriteResult?.improvedEssay || '',
    revisedEssay: rewriteResult?.improvedEssay || '',
    modelEssay: rewriteResult?.modelEssay || '',
    nextSteps: rewriteResult?.nextSteps || [],
    annotationWarnings,
    feedback: [scoringResult.summary, ...scoringResult.weaknesses].filter(Boolean),
    provider,
    model
  }
}

function normalizeQuickEvaluation(
  scoringResult: AiScoringResult,
  provider: string,
  model: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  essay: string
): EssayEvaluation {
  const legacyAnnotations = normalizeLegacyAnnotationPositions(scoringResult.annotations, essay, taskType)
  const result = normalizeEvaluation(
    scoringResult,
    dedupeAndSortAnnotations(legacyAnnotations),
    null,
    [],
    provider,
    model,
    taskType,
    essay
  )
  return scoringResult.annotations.length > 0 ? result : { ...result, correctedEssay: '' }
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

function validateScoringResult(value: unknown, taskType: Exclude<WritingTaskType, 'mock'>) {
  const normalized = normalizeEvaluationObject(value)
  const parsed = AiScoringSchema.safeParse(normalized)
  if (!parsed.success) {
    console.error('[ai-scoring-schema]', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code
    })))
    throw new AiProviderError('AI 返回的正式评分格式不正确。', undefined, 'ai_scoring_schema_error')
  }
  if (taskType === 'task1' && !parsed.data.taskAchievement) {
    throw new AiProviderError('AI 返回缺少 Task Achievement 评分。', undefined, 'ai_scoring_incomplete')
  }
  if (taskType === 'task2' && !parsed.data.taskResponse) {
    throw new AiProviderError('AI 返回缺少 Task Response 评分。', undefined, 'ai_scoring_incomplete')
  }
  return parsed.data
}

function validateBlockAnnotations(value: unknown) {
  const parsed = BlockAnnotationResponseSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[ai-annotation-schema]', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code
    })))
    throw new AiProviderError('AI 返回的文本块批注格式不正确。', undefined, 'ai_annotation_schema_error')
  }
  if (!parsed.data.checkedWholeBlock) {
    throw new AiProviderError('AI 未确认完成当前文本块检查。', undefined, 'ai_annotation_incomplete')
  }
  return parsed.data
}

function validateRewriteResult(value: unknown) {
  const parsed = RewriteResponseSchema.safeParse(value)
  if (!parsed.success) {
    console.error('[ai-rewrite-schema]', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      code: issue.code
    })))
    throw new AiProviderError('AI 返回的提升版本格式不正确。', undefined, 'ai_rewrite_schema_error')
  }
  return parsed.data
}

export type AiScoringResult = z.infer<typeof AiScoringSchema>
export type AiRewriteResult = z.infer<typeof RewriteResponseSchema>

async function requestJsonStage<T>(
  config: AiConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
  validate: (value: unknown) => T,
  perfLog?: PerformanceLog
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const requestMessages = attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user' as const,
              content: 'The previous attempt failed or did not pass server validation. Return one corrected valid JSON object only. Do not include markdown or commentary.'
            }
          ]
      const text = await fetchCompletion(config, requestMessages, maxTokens, perfLog, {
        responseFormat: { type: 'json_object' }
      })
      return validate(parseJsonObject(text, perfLog))
    } catch (error) {
      if (attempt === 1) throw error
      if (perfLog) {
        perfLog.retryCount += 1
        perfLog.retryReason = error instanceof Error ? error.message : 'invalid JSON'
      }
    }
  }

  throw new AiProviderError('AI 阶段请求失败。', undefined, 'ai_stage_failed')
}

export function parseAiEvaluationText(
  text: string,
  taskType: Exclude<WritingTaskType, 'mock'>,
  provider = 'test',
  model = 'test-model',
  essay = ''
) {
  const parsed = parseJsonObject(text)
  const scoringResult = validateScoringResult(parsed, taskType)
  return normalizeQuickEvaluation(scoringResult, provider, model, taskType, essay)
}

export async function evaluateEssayWithAi(input: EssayEvaluationInput): Promise<EssayEvaluation> {
  const config = getAiConfig()
  const phase = input.phase || 'full'
  const cacheKey = getEvaluationCacheKey({
    essay: input.essay,
    taskType: input.taskType,
    prompt: input.prompt,
    promptVersion: input.promptVersion,
    model: config.model,
    phase
  })

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
    const scoringMessages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: ScoringSystemPrompt
      },
      {
        role: 'user',
        content: buildScoringPrompt(input)
      }
    ]

    logPerf(perfLog, 'scoring-phase-start')
    const rawScoringResult = await requestJsonStage(
      config,
      scoringMessages,
      MAX_COMPLETION_TOKENS_SCORING,
      (value) => validateScoringResult(value, input.taskType),
      perfLog
    )
    const scoringResult: AiScoringResult = { ...rawScoringResult, annotations: [] }
    logPerf(perfLog, 'scoring-phase-complete')

    if (phase === 'quick') {
      const result = normalizeQuickEvaluation(scoringResult, config.provider, config.model, input.taskType, input.essay)
      setCachedEvaluation(cacheKey, result)
      perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
      logPerf(perfLog, 'done', { phase: 'quick' })
      return result
    }

    const blocks = splitEssayIntoBlocks(input.essay)
    const locatedAnnotations: EssayAnnotation[] = []
    const annotationWarnings: string[] = []

    for (const block of blocks) {
      if (!block.text.trim()) continue
      const blockPerfLog = { ...perfLog, phase: `annotation-block-${block.index}` }
      try {
        const response = await requestJsonStage(
          config,
          [
            { role: 'system', content: AnnotationSystemPrompt },
            { role: 'user', content: buildAnnotationPrompt(input, block) }
          ],
          MAX_COMPLETION_TOKENS_ANNOTATION,
          validateBlockAnnotations,
          blockPerfLog
        )
        locatedAnnotations.push(
          ...response.annotations.map((annotation) => locateBlockAnnotation(annotation, block, input.taskType))
        )
      } catch (error) {
        const message = `第 ${block.index + 1} 个文本块检查失败：${error instanceof Error ? error.message : '未知错误'}`
        annotationWarnings.push(message)
        console.warn('[ai-annotation-block]', {
          requestId: perfLog.requestId,
          blockIndex: block.index,
          error: error instanceof Error ? error.message : 'unknown'
        })
      }
    }

    const annotations = dedupeAndSortAnnotations(locatedAnnotations)
    let rewriteResult: AiRewriteResult | null = null
    try {
      rewriteResult = await requestJsonStage(
        config,
        [
          {
            role: 'system',
            content: 'You improve IELTS essays and write model answers. Return valid JSON only. Preserve the candidate’s core position in improvedEssay. Do not return correctedEssay or annotations.'
          },
          { role: 'user', content: buildRewritePrompt(input, scoringResult, annotations) }
        ],
        MAX_COMPLETION_TOKENS_REWRITE,
        validateRewriteResult,
        { ...perfLog, phase: 'rewrite' }
      )
    } catch (error) {
      const message = `提升版与范文生成失败：${error instanceof Error ? error.message : '未知错误'}`
      annotationWarnings.push(message)
      console.warn('[ai-rewrite]', {
        requestId: perfLog.requestId,
        error: error instanceof Error ? error.message : 'unknown'
      })
    }

    const result = normalizeEvaluation(
      scoringResult,
      annotations,
      rewriteResult,
      annotationWarnings,
      config.provider,
      config.model,
      input.taskType,
      input.essay
    )
    setCachedEvaluation(cacheKey, result)
    perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
    perfLog.annotationCount = annotations.length
    logPerf(perfLog, 'done', { phase })
    return result
  } catch (error) {
    perfLog.totalDurationMs = Date.now() - perfLog.requestStartAt
    logPerf(perfLog, 'error', { error: error instanceof Error ? error.message : 'unknown' })
    throw error
  }
}

function normalizeAiPromptResponse(raw: unknown, taskType: string): unknown {
  if (!isObject(raw) || taskType !== 'task1') return raw

  const result: Record<string, unknown> = { ...raw }
  const kindMap: Record<string, Task1ChartKind> = {
    line_graph: 'line',
    line_chart: 'line',
    bar_chart: 'bar',
    pie_chart: 'pie',
    table: 'table',
    mixed_charts: 'mixed'
  }
  const expectedKind = typeof result.questionType === 'string' ? kindMap[result.questionType] : undefined

  if (!result.chartSpec && isObject(result.chartData)) {
    result.chartSpec = result.chartData
    delete result.chartData
  }

  if (!result.chartSpec && expectedKind === 'mixed') {
    const mixedAliases = ['charts', 'barChart', 'barData', 'pieChart', 'pieData', 'lineChart', 'lineData', 'tableChart', 'tableData']
    const hasMixedData = mixedAliases.some((key) => result[key] !== undefined)
    if (hasMixedData) {
      result.chartSpec = {
        kind: 'mixed',
        title: typeof result.chartTitle === 'string'
          ? result.chartTitle
          : typeof result.title === 'string'
            ? result.title
            : 'Mixed charts',
        ...Object.fromEntries(mixedAliases.filter((key) => result[key] !== undefined).map((key) => [key, result[key]]))
      }
    }
  }

  if (isObject(result.chartSpec)) {
    const spec: Record<string, unknown> = { ...result.chartSpec }
    if (!spec.kind && expectedKind) spec.kind = expectedKind
    const normalized = normalizeTask1ChartSpec(spec, expectedKind)
    result.chartSpec = normalized || spec
  }

  return result
}

function chartKindForQuestionType(questionType: string): Task1ChartKind | undefined {
  const map: Record<string, Task1ChartKind> = {
    line_graph: 'line',
    line_chart: 'line',
    bar_chart: 'bar',
    pie_chart: 'pie',
    table: 'table',
    mixed_charts: 'mixed'
  }
  return map[questionType]
}

function parseAndValidateGeneratedPrompt(text: string, input: PromptGenerationInput, requestId: string) {
  const rawParsed = parseJsonObject(text)
  const normalizedRaw = normalizeAiPromptResponse(rawParsed, input.taskType)
  const parsed = AiPromptSchema.safeParse(normalizedRaw)

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    console.warn(`[task1-gen] requestId=${requestId} schemaErrors=${details}`)
    throw new AiProviderError(`AI provider response did not match the expected prompt format: ${details}`, undefined, 'ai_prompt_schema_error')
  }

  const data = parsed.data
  const expectedTask1 = input.selection.task1ChartType
  const expectedTask2 = input.selection.task2EssayType

  if (input.taskType === 'task1' && expectedTask1 !== 'random' && data.questionType !== expectedTask1) {
    throw new AiProviderError('AI生成的 Task 1 题型与用户选择不一致。', undefined, 'ai_prompt_type_mismatch')
  }
  if (input.taskType === 'task2' && expectedTask2 !== 'random' && data.questionType !== expectedTask2) {
    throw new AiProviderError('AI生成的 Task 2 题型与用户选择不一致。', undefined, 'ai_prompt_type_mismatch')
  }

  if (input.taskType === 'task1') {
    const expectedKind = chartKindForQuestionType(data.questionType)
    const isProcessType = data.questionType === 'process'
    const isMapType = ['map', 'floor_plan', 'before_after'].includes(data.questionType)

    if (expectedKind) {
      if (!data.chartSpec) {
        throw new AiProviderError('AI返回缺少图表数据。', undefined, 'ai_missing_chart_spec')
      }
      const prepared = prepareTask1ChartSpec(data.chartSpec, expectedKind)
      if (!prepared.success) {
        throw new AiProviderError(
          `AI返回的图表数据不完整：${prepared.errors.join('; ')}`,
          undefined,
          'ai_prompt_visual_schema_error'
        )
      }
      data.chartSpec = prepared.data
    }
    if (isProcessType && !data.processSpec) {
      throw new AiProviderError('AI返回缺少流程图数据。', undefined, 'ai_missing_process_spec')
    }
    if (isMapType && !data.mapSpec) {
      throw new AiProviderError('AI返回缺少地图数据。', undefined, 'ai_missing_map_spec')
    }
  }

  return data
}

function mixedFallbackQuestion(input: PromptGenerationInput, requestId: string): WritingQuestion {
  const fallbackIdBySubtype: Record<string, string> = {
    bar_pie: 'fb-mixed-bar-pie-retail',
    line_table: 'fb-mixed-line-table-enrollment',
    two_pies: 'fb-mixed-bar-pie-retail',
    multi_year: 'fb-mixed-bar-line-exports',
    multi_category: 'fb-mixed-bar-pie-retail',
    random: 'fb-mixed-bar-line-exports'
  }
  const candidates = getFallbackQuestionsByType('mixed_charts')
  const preferredId = fallbackIdBySubtype[input.selection.task1Subtype] || fallbackIdBySubtype.random
  const fallback = candidates.find((item) => item.id === preferredId) || candidates[0]
  const prepared = prepareTask1ChartSpec(fallback?.chartSpec, 'mixed')

  if (!fallback || !prepared.success) {
    throw new AiProviderError('内置 Mixed Chart 备用数据校验失败。', undefined, 'mixed_chart_fallback_invalid')
  }

  console.warn(`[task1-gen] requestId=${requestId} fallbackUsed=true rendererSelected=mixed_charts fallbackId=${fallback.id}`)
  return {
    id: `fallback-${fallback.id}-${Date.now().toString(36)}`,
    taskType: 'task1',
    title: fallback.title,
    promptLead: fallback.prompt,
    promptDetail: fallback.instructions,
    durationMinutes: 20,
    wordTarget: 150,
    questionType: 'mixed_charts',
    trainingType: 'academic',
    generatedSource: 'local-template',
    chartSpec: prepared.data
  }
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

  let text = ''
  let data: z.infer<typeof AiPromptSchema> | null = null
  let lastValidationError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt === 0) {
      text = await fetchCompletion(config, messages, MAX_COMPLETION_TOKENS_DETAILED, undefined, {
        responseFormat: { type: 'json_object' }
      })
    } else {
      const reason = lastValidationError instanceof Error ? lastValidationError.message : 'incomplete visual data'
      text = await fetchCompletion(config, [
        ...messages,
        {
          role: 'user',
          content: [
            'Your previous JSON failed server validation.',
            `Validation error: ${reason}`,
            'Regenerate the complete question once. Return JSON only.',
            'For mixed_charts, chartSpec.charts must contain exactly two complete, independently renderable chart objects.',
            `Previous response: ${text.slice(0, 1800)}`
          ].join('\n')
        }
      ], MAX_COMPLETION_TOKENS_DETAILED, undefined, {
        responseFormat: { type: 'json_object' }
      })
    }

    try {
      data = parseAndValidateGeneratedPrompt(text, input, requestId)
      break
    } catch (error) {
      lastValidationError = error
      console.warn(`[task1-gen] requestId=${requestId} attempt=${attempt + 1} validationFailed=${error instanceof Error ? error.message : 'unknown'}`)
    }
  }

  if (!data) {
    const isMixedRequest = input.taskType === 'task1' && (
      input.selection.task1ChartType === 'mixed_charts' ||
      /"questionType"\s*:\s*"mixed_charts"/.test(text)
    )
    if (isMixedRequest) return mixedFallbackQuestion(input, requestId)
    throw lastValidationError instanceof Error
      ? lastValidationError
      : new AiProviderError('AI题目生成失败。', undefined, 'ai_prompt_schema_error')
  }

  const questionType = data.questionType
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

  return question
}
