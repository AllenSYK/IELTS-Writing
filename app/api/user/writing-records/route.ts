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
import { measureGradingStage } from '@/lib/grading-performance'

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

  return json({
    success: true,
    record: writingRecordFromRow(data as never) || normalized
  })
}
