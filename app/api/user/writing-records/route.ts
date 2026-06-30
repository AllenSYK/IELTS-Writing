import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import {
  prepareWritingRecordForServer,
  WritingRecordSelect,
  writingRecordFromRow
} from '@/lib/writing-record-persistence'
import { parseStoredWritingRecord } from '@/lib/writing-records'
import { validateMapSchemaStrict, MapSchemaValidationError } from '@/lib/validators/mapSchema'
import { measureGradingStage } from '@/lib/grading-performance'

/**
 * Validate any mapSpec fields within a writing record at the API write boundary.
 */
function validateRecordMapSpecs(record: unknown): { ok: true } | { ok: false; message: string } {
  if (!record || typeof record !== 'object') return { ok: true }
  const r = record as Record<string, unknown>

  // Check top-level mapSpec
  if (r.mapSpec && typeof r.mapSpec === 'object') {
    try {
      validateMapSchemaStrict(r.mapSpec)
    } catch (err) {
      const code = err instanceof MapSchemaValidationError ? err.code : 'INVALID_MAP_SCHEMA'
      return { ok: false, message: `Record contains invalid map schema: ${code}` }
    }
  }

  // Check components.task1.mapSpec and components.task2.mapSpec
  const components = r.components
  if (components && typeof components === 'object') {
    for (const key of ['task1', 'task2']) {
      const comp = (components as Record<string, unknown>)[key]
      if (!comp || typeof comp !== 'object') continue
      const c = comp as Record<string, unknown>
      if (!c.mapSpec || typeof c.mapSpec !== 'object') continue
      try {
        validateMapSchemaStrict(c.mapSpec)
      } catch (err) {
        const code = err instanceof MapSchemaValidationError ? err.code : 'INVALID_MAP_SCHEMA'
        return { ok: false, message: `Record component ${key} contains invalid map schema: ${code}` }
      }
    }
  }

  return { ok: true }
}

const SaveRecordSchema = z.object({
  record: z.unknown()
})

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select(WritingRecordSelect)
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  if (error) {
    return json({ success: false, message: '历史记录读取失败' }, { status: 500 })
  }

  return json({
    success: true,
    records: (data ?? []).map((row) => writingRecordFromRow(row as never)).filter(Boolean)
  })
}

export async function POST(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const parsed = SaveRecordSchema.safeParse(await request.json().catch(() => null))
  const record = parsed.success ? parseStoredWritingRecord(parsed.data.record) : null
  if (!record) {
    return json({ success: false, message: '写作记录格式不正确' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  let prepared = prepareWritingRecordForServer(user.id, record)

  // Validate mapSpec in record data at write boundary
  const mapValidation = validateRecordMapSpecs(prepared.record)
  if (!mapValidation.ok) {
    return json({ success: false, code: 'INVALID_MAP_SCHEMA', message: mapValidation.message }, { status: 400 })
  }

  if (prepared.record.requestId) {
    const { data: existing, error: lookupError } = await supabase
      .from('writing_records')
      .select('id')
      .eq('user_id', user.id)
      .eq('request_id', prepared.record.requestId)
      .maybeSingle()

    if (lookupError) {
      return json({ success: false, message: '写作记录保存失败' }, { status: 500 })
    }

    if (existing?.id && existing.id !== prepared.record.id) {
      prepared = prepareWritingRecordForServer(user.id, {
        ...prepared.record,
        id: existing.id
      })
    }
  }

  const { record: normalized, row } = prepared
  const { data, error } = await measureGradingStage({
    requestId: normalized.requestId || normalized.id,
    model: normalized.evaluation.model || 'unknown',
    stage: 'writing-record-storage',
    run: async () => {
      return await supabase
        .from('writing_records')
        .upsert(row, { onConflict: 'id' })
        .select(WritingRecordSelect)
        .single()
    }
  })

  if (error) {
    return json({ success: false, message: '写作记录保存失败' }, { status: 500 })
  }

  const savedRecord = writingRecordFromRow(data as never) || normalized

  fetch(`${new URL(request.url).origin}/api/study-plan/errors/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writingRecordId: savedRecord.id })
  }).catch(() => {})

  return json({
    success: true,
    record: savedRecord
  })
}
