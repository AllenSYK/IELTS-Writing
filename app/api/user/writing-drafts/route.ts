import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import {
  DraftErrorMessages,
  ManagedDraftDataSchema,
  normalizeManagedDraftData,
  type DraftDeleteQuota,
  type DraftRecord
} from '@/lib/writing-drafts'
import type { WritingTaskType } from '@/lib/writing-records'

const TaskTypeSchema = z.enum(['task1', 'task2', 'mock'])

const CreateDraftSchema = z.object({
  id: z.string().min(1).max(180),
  requestId: z.string().min(1).max(180),
  taskType: TaskTypeSchema,
  draft: ManagedDraftDataSchema
})

const UpdateDraftSchema = z.object({
  id: z.string().min(1).max(180),
  taskType: TaskTypeSchema,
  draft: ManagedDraftDataSchema
})

const CompleteDraftSchema = z.object({
  id: z.string().min(1).max(180),
  recordId: z.string().min(1).max(180),
  action: z.literal('complete')
})

const KnownErrorCodes = [
  'DRAFT_LIMIT_REACHED_TASK1',
  'DRAFT_LIMIT_REACHED_TASK2',
  'DRAFT_LIMIT_REACHED_FULL_TEST',
  'DAILY_DRAFT_DELETE_LIMIT_REACHED',
  'DRAFT_NOT_FOUND',
  'DRAFT_ACCESS_DENIED',
  'DRAFT_CREATE_FAILED',
  'DRAFT_UPDATE_FAILED',
  'DRAFT_DELETE_FAILED'
] as const

type DraftRow = {
  id: string
  task_type: WritingTaskType
  draft_data: unknown
  created_at: string
  updated_at: string
}

function errorCode(error: unknown, fallback: string) {
  const source = error && typeof error === 'object'
    ? `${'message' in error ? String(error.message) : ''} ${'details' in error ? String(error.details) : ''}`
    : String(error || '')
  return KnownErrorCodes.find((code) => source.includes(code)) || fallback
}

function errorStatus(code: string) {
  if (code.startsWith('DRAFT_LIMIT_REACHED')) return 409
  if (code === 'DAILY_DRAFT_DELETE_LIMIT_REACHED') return 429
  if (code === 'DRAFT_NOT_FOUND') return 404
  if (code === 'DRAFT_ACCESS_DENIED') return 403
  return 500
}

function draftError(code: string, status = errorStatus(code)) {
  return json({
    success: false,
    code,
    message: DraftErrorMessages[code] || '草稿操作失败，请稍后重试。'
  }, { status })
}

function mapDraftRow(row: DraftRow): DraftRecord | null {
  const draftData = normalizeManagedDraftData(row.draft_data, row.task_type)
  if (!draftData || draftData.completed) return null
  return {
    id: row.id,
    taskType: row.task_type,
    draftData,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function normalizeQuota(value: unknown): DraftDeleteQuota {
  const input = value && typeof value === 'object' ? value as Partial<DraftDeleteQuota> : {}
  return {
    timezone: 'Asia/Shanghai',
    dailyLimit: 3,
    used: Math.max(0, Number(input.used) || 0),
    remaining: Math.max(0, Math.min(3, Number(input.remaining) || 0)),
    date: typeof input.date === 'string' ? input.date : ''
  }
}

export async function GET(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, code: 'DRAFT_ACCESS_DENIED', message: '请先登录' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  const supabase = await createSupabaseServerClient()

  if (id) {
    const { data, error } = await supabase
      .from('writing_drafts')
      .select('id, task_type, draft_data, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) return draftError('DRAFT_UPDATE_FAILED')
    return json({
      success: true,
      draft: data ? mapDraftRow(data as DraftRow) : null
    })
  }

  const [{ data, error }, quotaResult] = await Promise.all([
    supabase
      .from('writing_drafts')
      .select('id, task_type, draft_data, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase.rpc('get_writing_draft_delete_quota')
  ])

  if (error || quotaResult.error) return draftError('DRAFT_UPDATE_FAILED')

  const drafts = ((data || []) as DraftRow[])
    .map(mapDraftRow)
    .filter((draft): draft is DraftRecord => Boolean(draft))

  return json({
    success: true,
    drafts,
    quota: normalizeQuota(quotaResult.data)
  })
}

export async function POST(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, code: 'DRAFT_ACCESS_DENIED', message: '请先登录' }, { status: 401 })

  const parsed = CreateDraftSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return draftError('DRAFT_CREATE_FAILED', 400)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('create_writing_draft', {
    p_id: parsed.data.id,
    p_task_type: parsed.data.taskType,
    p_request_id: parsed.data.requestId,
    p_draft_data: parsed.data.draft
  })

  if (error) {
    const code = errorCode(error, 'DRAFT_CREATE_FAILED')
    return draftError(code)
  }

  const now = new Date().toISOString()
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  return json({
    success: true,
    draft: {
      id: typeof result.id === 'string' ? result.id : parsed.data.id,
      taskType: parsed.data.taskType,
      draftData: parsed.data.draft,
      createdAt: typeof result.createdAt === 'string' ? result.createdAt : now,
      updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : now
    } satisfies DraftRecord
  }, { status: result.created === false ? 200 : 201 })
}

export async function PATCH(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, code: 'DRAFT_ACCESS_DENIED', message: '请先登录' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const complete = CompleteDraftSchema.safeParse(body)
  const supabase = await createSupabaseServerClient()

  if (complete.success) {
    const { error } = await supabase.rpc('complete_writing_draft', {
      p_id: complete.data.id,
      p_record_id: complete.data.recordId
    })
    if (error) return draftError(errorCode(error, 'DRAFT_UPDATE_FAILED'))
    return json({ success: true })
  }

  const parsed = UpdateDraftSchema.safeParse(body)
  if (!parsed.success) return draftError('DRAFT_UPDATE_FAILED', 400)

  const { data, error } = await supabase.rpc('update_writing_draft', {
    p_id: parsed.data.id,
    p_task_type: parsed.data.taskType,
    p_draft_data: parsed.data.draft
  })

  if (error) return draftError(errorCode(error, 'DRAFT_UPDATE_FAILED'))
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  return json({
    success: true,
    draft: {
      id: parsed.data.id,
      taskType: parsed.data.taskType,
      draftData: parsed.data.draft,
      createdAt: '',
      updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : new Date().toISOString()
    } satisfies DraftRecord
  })
}

export async function DELETE(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, code: 'DRAFT_ACCESS_DENIED', message: '请先登录' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return draftError('DRAFT_DELETE_FAILED', 400)

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('delete_writing_draft', {
    p_id: id
  })

  if (error) return draftError(errorCode(error, 'DRAFT_DELETE_FAILED'))
  return json({
    success: true,
    quota: normalizeQuota(data)
  })
}
