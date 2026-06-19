import { z } from 'zod'
import { json } from '@/lib/http'
import { generateEssayDerivative } from '@/lib/ielts-derivatives'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import {
  prepareWritingRecordForServer,
  WritingRecordSelect,
  writingRecordFromRow
} from '@/lib/writing-record-persistence'

const RequestSchema = z.object({
  recordId: z.string().uuid(),
  kind: z.enum(['revised', 'model'])
})

export const maxDuration = 180

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: '请先登录并激活账号' }, { status: check.status })
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ success: false, message: '生成请求格式不正确' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select(WritingRecordSelect)
    .eq('id', parsed.data.recordId)
    .eq('user_id', check.user.id)
    .maybeSingle()

  const record = data ? writingRecordFromRow(data as never) : null
  if (error || !record) {
    return json({ success: false, message: '未找到对应写作记录' }, { status: 404 })
  }

  try {
    const generated = await generateEssayDerivative(record, parsed.data.kind)
    const evaluation = {
      ...record.evaluation,
      ...(parsed.data.kind === 'revised'
        ? {
            improvedEssay: generated.text,
            revisedEssay: generated.text,
            nextSteps: generated.nextSteps,
            suggestions: generated.nextSteps
          }
        : { modelEssay: generated.text }),
      provider: generated.provider,
      model: generated.model
    }
    const updated = { ...record, evaluation }
    const prepared = prepareWritingRecordForServer(check.user.id, updated)
    const { error: updateError } = await supabase
      .from('writing_records')
      .update(prepared.row)
      .eq('id', record.id)
      .eq('user_id', check.user.id)

    if (updateError) throw updateError
    return json({
      success: true,
      text: generated.text,
      nextSteps: generated.nextSteps,
      record: prepared.record
    })
  } catch (error) {
    return json({
      success: false,
      message: error instanceof Error ? error.message : '生成失败，请稍后重试'
    }, { status: 502 })
  }
}
