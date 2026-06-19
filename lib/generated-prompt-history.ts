import { buildPrompt, type WritingQuestion } from '@/lib/ielts-questions'
import type { WritingTaskType } from '@/lib/writing-records'
import type { PromptSelection } from '@/lib/writing-options'
import { DefaultUserProfile, loadUserProfile } from '@/lib/user-profile'
import { userScopedStorageKey } from '@/lib/user-storage'

export type GeneratedPromptSource = 'ai' | 'local-template' | 'static-bank'

export type GeneratedPromptHistoryEntry = {
  promptId: string
  userProfileId: string
  taskType: Exclude<WritingTaskType, 'mock'>
  chartType?: string
  essayType?: string
  topic?: string
  questionText: string
  questionHash: string
  keywords: string[]
  generatedAt: string
  usedAt: string
  completed: boolean
  source: GeneratedPromptSource
}

export type PromptDuplicateResult = {
  duplicate: boolean
  reason?: 'exact' | 'similar'
  similarity?: number
  matched?: GeneratedPromptHistoryEntry
}

export const GeneratedPromptHistoryStorageKey = 'aerowrite-generated-prompt-history-v1'

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g
const NUMBER_PATTERN = /\b\d+(?:[.,]\d+)?\b/g
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'from',
  'by',
  'with',
  'between',
  'below',
  'shows',
  'show',
  'some',
  'people',
  'think',
  'believe',
  'should',
  'what',
  'why',
  'how',
  'extent',
  'agree',
  'disagree',
  'discuss',
  'give',
  'opinion',
  'summarise',
  'information',
  'relevant',
  'main',
  'features'
])

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function normalizePromptText(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/[，。；：！？]/g, ' ')
    .replace(YEAR_PATTERN, '<year>')
    .replace(NUMBER_PATTERN, '<number>')
    .replace(/\b(?:london|toronto|singapore|sydney|berlin|canada|spain|japan|brazil|india|germany|china|australia|uk|usa)\b/g, '<place>')
    .replace(/\s*([,.;:!?()/+-])\s*/g, '$1')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function promptHash(text: string) {
  return stableHash(normalizePromptText(text))
}

export function promptKeywords(text: string) {
  const normalized = normalizePromptText(text)
  return Array.from(
    new Set(
      normalized
        .split(/[^a-z0-9<>-]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 2 && !STOP_WORDS.has(item))
    )
  ).slice(0, 28)
}

export function jaccardSimilarity(a: string[], b: string[]) {
  if (a.length === 0 && b.length === 0) return 1
  const left = new Set(a)
  const right = new Set(b)
  let intersection = 0
  left.forEach((item) => {
    if (right.has(item)) intersection += 1
  })
  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}

export function currentPromptProfileId(userId: string) {
  if (typeof window === 'undefined') return 'server'
  const profile = loadUserProfile(userId)
  const normalized = profile || DefaultUserProfile
  return stableHash([
    userId,
    normalized.fullName.trim().toLowerCase(),
    normalized.englishNickname.trim().toLowerCase(),
    normalized.targetOverall,
    normalized.task1Target,
    normalized.task2Target
  ].join('|'))
}

function readHistory(userId: string): GeneratedPromptHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(userScopedStorageKey(GeneratedPromptHistoryStorageKey, userId)) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is GeneratedPromptHistoryEntry => {
      return Boolean(
        item &&
        typeof item === 'object' &&
        typeof (item as GeneratedPromptHistoryEntry).promptId === 'string' &&
        typeof (item as GeneratedPromptHistoryEntry).userProfileId === 'string' &&
        ((item as GeneratedPromptHistoryEntry).taskType === 'task1' || (item as GeneratedPromptHistoryEntry).taskType === 'task2') &&
        typeof (item as GeneratedPromptHistoryEntry).questionText === 'string' &&
        typeof (item as GeneratedPromptHistoryEntry).questionHash === 'string'
      )
    })
  } catch {
    return []
  }
}

function writeHistory(userId: string, entries: GeneratedPromptHistoryEntry[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(userScopedStorageKey(GeneratedPromptHistoryStorageKey, userId), JSON.stringify(entries.slice(0, 500)))
}

export function loadGeneratedPromptHistory(userId: string, userProfileId = currentPromptProfileId(userId)) {
  return readHistory(userId)
    .filter((entry) => entry.userProfileId === userProfileId)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
}

export function buildExcludePromptSummaries(taskType: Exclude<WritingTaskType, 'mock'>, userId: string, userProfileId = currentPromptProfileId(userId), limit = 20) {
  return loadGeneratedPromptHistory(userId, userProfileId)
    .filter((entry) => entry.taskType === taskType)
    .slice(0, limit)
    .map((entry) => ({
      taskType: entry.taskType,
      chartType: entry.chartType,
      essayType: entry.essayType,
      topic: entry.topic,
      questionHash: entry.questionHash,
      keywords: entry.keywords.slice(0, 12),
      questionText: entry.questionText.slice(0, 360)
    }))
}

export function findDuplicatePrompt(
  questionText: string,
  options: {
    taskType: Exclude<WritingTaskType, 'mock'>
    userId: string
    userProfileId?: string
    chartType?: string
    essayType?: string
    topic?: string
  }
): PromptDuplicateResult {
  const userProfileId = options.userProfileId || currentPromptProfileId(options.userId)
  const hash = promptHash(questionText)
  const keywords = promptKeywords(questionText)
  for (const entry of loadGeneratedPromptHistory(options.userId, userProfileId)) {
    if (entry.taskType !== options.taskType) continue
    if (entry.questionHash === hash) return { duplicate: true, reason: 'exact', similarity: 1, matched: entry }
    const similarity = jaccardSimilarity(keywords, entry.keywords)
    const sameType =
      (options.chartType && entry.chartType === options.chartType) ||
      (options.essayType && entry.essayType === options.essayType) ||
      (options.topic && entry.topic === options.topic)
    if (similarity >= 0.85 || (similarity >= 0.7 && sameType)) {
      return { duplicate: true, reason: 'similar', similarity, matched: entry }
    }
  }
  return { duplicate: false }
}

export function recordGeneratedPrompt(
  question: WritingQuestion,
  selection: PromptSelection,
  source: GeneratedPromptSource,
  userId: string,
  userProfileId = currentPromptProfileId(userId)
) {
  const questionText = buildPrompt(question)
  const entry: GeneratedPromptHistoryEntry = {
    promptId: question.id,
    userProfileId,
    taskType: question.taskType,
    chartType: question.taskType === 'task1' ? selection.task1ChartType : undefined,
    essayType: question.taskType === 'task2' ? selection.task2EssayType : undefined,
    topic: question.taskType === 'task2' ? selection.task2Topic : undefined,
    questionText,
    questionHash: promptHash(questionText),
    keywords: promptKeywords(questionText),
    generatedAt: new Date().toISOString(),
    usedAt: new Date().toISOString(),
    completed: false,
    source
  }
  const remaining = readHistory(userId).filter((item) => !(item.userProfileId === userProfileId && item.promptId === question.id))
  writeHistory(userId, [entry, ...remaining])
  return entry
}

export function markGeneratedPromptCompleted(promptId: string, userId: string, userProfileId = currentPromptProfileId(userId)) {
  const entries = readHistory(userId).map((entry) => {
    if (entry.userProfileId === userProfileId && entry.promptId === promptId) {
      return { ...entry, completed: true }
    }
    return entry
  })
  writeHistory(userId, entries)
}
