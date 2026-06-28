import { z } from 'zod'
import {
  DefaultPromptSelection,
  normalizeTask1ChartType,
  normalizeTask1Subtype,
  normalizeTask2EssayType,
  normalizeTask2Topic,
  type PromptSelection
} from '@/lib/writing-options'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type { WritingTaskType } from '@/lib/writing-records'
import { userScopedStorageKey } from '@/lib/user-storage'

export const DraftLimits: Record<WritingTaskType, number> = {
  task1: 5,
  task2: 5,
  mock: 3
}

export const DraftLimitErrorCodes: Record<WritingTaskType, string> = {
  task1: 'DRAFT_LIMIT_REACHED_TASK1',
  task2: 'DRAFT_LIMIT_REACHED_TASK2',
  mock: 'DRAFT_LIMIT_REACHED_FULL_TEST'
}

export const DraftErrorMessages: Record<string, string> = {
  DRAFT_LIMIT_REACHED_TASK1: 'Task 1 草稿已达到 5 份上限，请先继续或删除一份已有草稿。',
  DRAFT_LIMIT_REACHED_TASK2: 'Task 2 草稿已达到 5 份上限，请先继续或删除一份已有草稿。',
  DRAFT_LIMIT_REACHED_FULL_TEST: '完整测试草稿已达到 3 份上限，请先继续或删除一份已有草稿。',
  DAILY_DRAFT_DELETE_LIMIT_REACHED: '今日草稿删除次数已用完，请明日再试。',
  DRAFT_NOT_FOUND: '这份草稿不存在或已处理。',
  DRAFT_ACCESS_DENIED: '你没有权限访问这份草稿。',
  DRAFT_CREATE_FAILED: '草稿创建失败，请稍后重试。',
  DRAFT_UPDATE_FAILED: '草稿保存失败，请稍后重试。',
  DRAFT_DELETE_FAILED: '草稿删除失败，请稍后重试。'
}

const PromptSelectionSchema = z.object({
  task1ChartType: z.string().transform(normalizeTask1ChartType),
  task1Subtype: z.string().transform(normalizeTask1Subtype),
  task2EssayType: z.string().transform(normalizeTask2EssayType),
  task2Topic: z.string().transform(normalizeTask2Topic)
})

export const DraftTaskSchema = z.object({
  essay: z.string(),
  updatedAt: z.string(),
  wordCount: z.number().nonnegative(),
  questionId: z.string().optional(),
  chartSpec: z.record(z.unknown()).optional(),
  processSpec: z.record(z.unknown()).optional(),
  mapSpec: z.record(z.unknown()).optional(),
  imageUrl: z.string().optional(),
  promptLead: z.string().optional(),
  promptDetail: z.string().optional(),
  questionType: z.string().optional(),
  trainingType: z.string().optional(),
  title: z.string().optional(),
  topic: z.string().optional(),
  generatedSource: z.enum(['ai', 'local-template', 'static-bank', 'user_upload']).optional(),
  structuredData: z.record(z.unknown()).optional()
})

export type DraftTask = z.infer<typeof DraftTaskSchema>

const SingleDraftSchema = z.object({
  version: z.literal(2),
  kind: z.literal('single'),
  selection: PromptSelectionSchema,
  remainingSeconds: z.number().nonnegative(),
  task: DraftTaskSchema,
  completed: z.boolean().optional(),
  completedAt: z.string().optional()
})

const FullTestDraftSchema = z.object({
  version: z.literal(2),
  kind: z.literal('full_test'),
  selection: PromptSelectionSchema,
  activeTask: z.enum(['task1', 'task2']),
  remainingSeconds: z.number().nonnegative(),
  task1: DraftTaskSchema,
  task2: DraftTaskSchema,
  completed: z.boolean().optional(),
  completedAt: z.string().optional()
})

export const ManagedDraftDataSchema = z.union([SingleDraftSchema, FullTestDraftSchema])
export type ManagedDraftData = z.infer<typeof ManagedDraftDataSchema>
export type SingleDraftData = z.infer<typeof SingleDraftSchema>
export type FullTestDraftData = z.infer<typeof FullTestDraftSchema>

export type DraftRecord = {
  id: string
  taskType: WritingTaskType
  draftData: ManagedDraftData
  createdAt: string
  updatedAt: string
}

export type DraftDeleteQuota = {
  timezone: 'Asia/Shanghai'
  dailyLimit: 8
  used: number
  remaining: number
  date: string
}

type DraftApiErrorPayload = {
  success?: boolean
  code?: string
  message?: string
}

export class DraftApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'DraftApiError'
    this.code = code
    this.status = status
  }
}

function normalizedSelection(value: z.infer<typeof PromptSelectionSchema> | PromptSelection): PromptSelection {
  return {
    task1ChartType: normalizeTask1ChartType(value.task1ChartType),
    task1Subtype: normalizeTask1Subtype(value.task1Subtype),
    task2EssayType: normalizeTask2EssayType(value.task2EssayType),
    task2Topic: normalizeTask2Topic(value.task2Topic)
  }
}

export function normalizeManagedDraftData(value: unknown, taskType?: WritingTaskType): ManagedDraftData | null {
  const parsed = ManagedDraftDataSchema.safeParse(value)
  if (parsed.success) {
    return {
      ...parsed.data,
      selection: normalizedSelection(parsed.data.selection)
    } as ManagedDraftData
  }

  const legacy = DraftTaskSchema.safeParse(value)
  if (!legacy.success || !taskType || taskType === 'mock') return null
  return {
    version: 2,
    kind: 'single',
    selection: DefaultPromptSelection,
    remainingSeconds: taskType === 'task1' ? 20 * 60 : 40 * 60,
    task: legacy.data
  }
}

export function emptyDraftTask(now = new Date().toISOString()): DraftTask {
  return {
    essay: '',
    updatedAt: now,
    wordCount: 0
  }
}

export function initialManagedDraft(
  mode: WritingTaskType,
  selection: PromptSelection = DefaultPromptSelection,
  now = new Date().toISOString()
): ManagedDraftData {
  if (mode === 'mock') {
    return {
      version: 2,
      kind: 'full_test',
      selection: normalizedSelection(selection),
      activeTask: 'task1',
      remainingSeconds: 60 * 60,
      task1: emptyDraftTask(now),
      task2: emptyDraftTask(now)
    }
  }

  return {
    version: 2,
    kind: 'single',
    selection: normalizedSelection(selection),
    remainingSeconds: mode === 'task1' ? 20 * 60 : 40 * 60,
    task: emptyDraftTask(now)
  }
}

export function draftTaskFromQuestion(
  essay: string,
  question: WritingQuestion | null,
  wordCount: number,
  updatedAt = new Date().toISOString()
): DraftTask {
  return {
    essay,
    updatedAt,
    wordCount: Math.max(0, wordCount),
    questionId: question?.id,
    chartSpec: question?.chartSpec as Record<string, unknown> | undefined,
    processSpec: question?.processSpec as Record<string, unknown> | undefined,
    mapSpec: question?.mapSpec as Record<string, unknown> | undefined,
    imageUrl: question?.image,
    promptLead: question?.promptLead,
    promptDetail: question?.promptDetail,
    questionType: question?.questionType,
    trainingType: question?.trainingType,
    title: question?.title,
    topic: question?.topic,
    generatedSource: question?.generatedSource,
    structuredData: question?.structuredData
  }
}

export function draftLocalStorageKey(userId: string, draftId: string) {
  return userScopedStorageKey(`ielts-writing-managed-draft-${draftId}`, userId)
}

export function writeLocalManagedDraft(userId: string, draftId: string, draftData: ManagedDraftData) {
  window.localStorage.setItem(draftLocalStorageKey(userId, draftId), JSON.stringify(draftData))
}

export function readLocalManagedDraft(userId: string, draftId: string) {
  const raw = window.localStorage.getItem(draftLocalStorageKey(userId, draftId))
  if (!raw) return null
  try {
    return normalizeManagedDraftData(JSON.parse(raw))
  } catch {
    return null
  }
}

export function removeLocalManagedDraft(userId: string, draftId: string) {
  window.localStorage.removeItem(draftLocalStorageKey(userId, draftId))
}

async function parseDraftResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as DraftApiErrorPayload & T
  if (!response.ok) {
    const code = payload.code || 'DRAFT_UPDATE_FAILED'
    throw new DraftApiError(code, payload.message || DraftErrorMessages[code] || '草稿操作失败。', response.status)
  }
  return payload
}

export function createDraftRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function createManagedDraft(
  mode: WritingTaskType,
  selection: PromptSelection,
  requestId = createDraftRequestId()
) {
  const id = `draft-${requestId}`
  const response = await fetch('/api/user/writing-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      requestId,
      taskType: mode,
      draft: initialManagedDraft(mode, selection)
    })
  })
  return parseDraftResponse<{ success: true; draft: DraftRecord }>(response)
}

export async function fetchManagedDraft(userId: string, draftId: string) {
  const local = readLocalManagedDraft(userId, draftId)
  if (!window.navigator.onLine) return local
  try {
    const response = await fetch(`/api/user/writing-drafts?id=${encodeURIComponent(draftId)}`, {
      cache: 'no-store'
    })
    const payload = await parseDraftResponse<{ success: true; draft: DraftRecord | null }>(response)
    const remote = payload.draft?.draftData ?? null
    if (!remote) return local
    const remoteUpdatedAt = payload.draft?.updatedAt ? new Date(payload.draft.updatedAt).getTime() : 0
    const localUpdatedAt = local
      ? new Date(local.kind === 'full_test'
        ? [local.task1.updatedAt, local.task2.updatedAt].sort().at(-1) || ''
        : local.task.updatedAt).getTime()
      : 0
    const selected = local && localUpdatedAt > remoteUpdatedAt ? local : remote
    writeLocalManagedDraft(userId, draftId, selected)
    return selected
  } catch {
    return local
  }
}

export async function listManagedDrafts() {
  const response = await fetch('/api/user/writing-drafts', { cache: 'no-store' })
  return parseDraftResponse<{
    success: true
    drafts: DraftRecord[]
    quota: DraftDeleteQuota
  }>(response)
}

export type DraftListItem = {
  id: string
  taskType: WritingTaskType
  createdAt: string
  updatedAt: string
}

export async function listDraftsLightweight(): Promise<DraftListItem[]> {
  try {
    const response = await fetch('/api/user/writing-drafts/list', { cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { success?: boolean; drafts?: DraftListItem[] }
    if (!response.ok || !data.success) return []
    return data.drafts ?? []
  } catch {
    return []
  }
}

export async function fetchDraftDeleteQuota(): Promise<DraftDeleteQuota> {
  const emptyQuota: DraftDeleteQuota = {     timezone: 'Asia/Shanghai',
    dailyLimit: 8,
    used: 0,
    remaining: 8,
    date: '' }
  try {
    const response = await fetch('/api/user/writing-drafts/quota', { cache: 'no-store' })
    const data = await response.json().catch(() => ({})) as { success?: boolean; quota?: DraftDeleteQuota }
    if (!response.ok || !data.success) return emptyQuota
    return data.quota ?? emptyQuota
  } catch {
    return emptyQuota
  }
}

export async function saveManagedDraft(
  userId: string,
  draftId: string,
  taskType: WritingTaskType,
  draft: ManagedDraftData,
  options?: { keepalive?: boolean }
) {
  writeLocalManagedDraft(userId, draftId, draft)
  if (!window.navigator.onLine) return { success: false as const, offline: true as const }
  const response = await fetch('/api/user/writing-drafts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: draftId, taskType, draft }),
    keepalive: options?.keepalive
  })
  const payload = await parseDraftResponse<{ success: true; draft: DraftRecord }>(response)
  return { ...payload, offline: false as const }
}

export async function completeManagedDraft(userId: string, draftId: string, recordId: string) {
  const response = await fetch('/api/user/writing-drafts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: draftId, recordId, action: 'complete' })
  })
  const payload = await parseDraftResponse<{ success: true }>(response)
  removeLocalManagedDraft(userId, draftId)
  return payload
}

export async function deleteManagedDraft(userId: string, draftId: string) {
  const response = await fetch(`/api/user/writing-drafts?id=${encodeURIComponent(draftId)}`, {
    method: 'DELETE'
  })
  const payload = await parseDraftResponse<{
    success: true
    quota: DraftDeleteQuota
  }>(response)
  removeLocalManagedDraft(userId, draftId)
  return payload
}

export function draftDisplayTitle(record: DraftRecord) {
  if (record.draftData.kind === 'full_test') {
    return record.draftData.task1.title || record.draftData.task2.title || '完整测试草稿'
  }
  return record.draftData.task.title || (record.taskType === 'task1' ? 'Task 1 草稿' : 'Task 2 草稿')
}

export function draftTotalWords(record: DraftRecord) {
  return record.draftData.kind === 'full_test'
    ? record.draftData.task1.wordCount + record.draftData.task2.wordCount
    : record.draftData.task.wordCount
}

export function draftRemainingSeconds(record: DraftRecord) {
  return Math.max(0, record.draftData.remainingSeconds)
}
