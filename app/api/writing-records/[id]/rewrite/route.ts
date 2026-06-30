import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { WritingRecordSelect, writingRecordFromRow } from '@/lib/writing-record-persistence'
import { createRecordId } from '@/lib/writing-records'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const { id } = await params
  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: originalRow, error: fetchError } = await service
    .from('writing_records')
    .select(WritingRecordSelect)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError || !originalRow) {
    return json({ success: false, message: 'Original record not found' }, { status: 404 })
  }

  const original = writingRecordFromRow(originalRow as never)
  if (!original) {
    return json({ success: false, message: 'Failed to parse original record' }, { status: 500 })
  }

  const { count: existingRevisions } = await service
    .from('writing_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('revision_of_record_id', id)

  const revisionNumber = (existingRevisions ?? 0) + 2

  const newRecordId = createRecordId()

  const { data: newRow, error: insertError } = await service
    .from('writing_records')
    .insert({
      id: newRecordId,
      user_id: userId,
      task_type: original.taskType,
      title: `${original.title} (第${revisionNumber}版)`,
      prompt: original.prompt,
      original_essay: '',
      evaluation: {},
      annotations: [],
      accepted_changes: [],
      submitted_at: new Date().toISOString(),
      record_data: {
        revisionOfRecordId: id,
        revisionNumber,
        revisionReason: 'feedback_rewrite',
        originalEssay: original.essay,
        originalEvaluation: original.evaluation,
        components: original.components,
        chartSpec: original.chartSpec,
        processSpec: original.processSpec,
        mapSpec: original.mapSpec,
        promptLead: original.promptLead,
        promptDetail: original.promptDetail,
        imageUrl: original.imageUrl,
        questionId: original.questionId,
        questionType: original.questionType,
        questionSource: original.questionSource,
        uploadedTaskId: original.uploadedTaskId
      },
      revision_of_record_id: id,
      revision_number: revisionNumber,
      revision_reason: 'feedback_rewrite'
    })
    .select(WritingRecordSelect)
    .single()

  if (insertError) {
    return json({ success: false, message: insertError.message }, { status: 500 })
  }

  const newRecord = writingRecordFromRow(newRow as never)

  return json({
    success: true,
    record: newRecord,
    revisionNumber,
    originalId: id
  })
}
