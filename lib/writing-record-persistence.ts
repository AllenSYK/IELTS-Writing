import {
  createRecordId,
  normalizeWritingRecord,
  parseStoredWritingRecord,
  type WritingRecord
} from '@/lib/writing-records'

type WritingRecordRow = {
  id: string
  user_id: string
  task_type: WritingRecord['taskType']
  title: string
  prompt: string | null
  original_essay: string
  corrected_essay: string | null
  improved_essay: string | null
  model_essay: string | null
  evaluation: unknown
  annotations: unknown
  accepted_changes: unknown
  annotation_version: number
  submitted_at: string
  record_data: unknown
  request_id: string | null
  processing_status: string
  failed_block_ids: string[]
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function prepareWritingRecordForServer(userId: string, record: WritingRecord) {
  const normalized = normalizeWritingRecord({
    ...record,
    id: isUuid(record.id) ? record.id : createRecordId(),
    ownerUserId: userId
  })
  const failedBlockIds = (normalized.evaluation.annotationWarnings ?? [])
    .map((warning) => warning.match(/blockId[：:]\s*([^\s，。]+)/)?.[1])
    .filter((value): value is string => Boolean(value))
  const processingStatus = failedBlockIds.length > 0 ? 'partial' : 'complete'

  return {
    record: normalized,
    row: {
      id: normalized.id,
      user_id: userId,
      task_type: normalized.taskType,
      title: normalized.title,
      prompt: normalized.prompt,
      original_essay: normalized.originalEssay || normalized.essay,
      corrected_essay: normalized.evaluation.correctedEssay || null,
      improved_essay: normalized.evaluation.improvedEssay || normalized.evaluation.revisedEssay || null,
      model_essay: normalized.evaluation.modelEssay || null,
      evaluation: normalized.evaluation,
      annotations: normalized.evaluation.annotations || [],
      accepted_changes: normalized.acceptedChanges || [],
      annotation_version: normalized.annotationVersion || normalized.evaluation.annotationVersion || 1,
      submitted_at: normalized.submittedAt,
      record_data: normalized,
      request_id: normalized.requestId || normalized.id,
      processing_status: processingStatus,
      failed_block_ids: failedBlockIds
    }
  }
}

export function writingRecordFromRow(row: WritingRecordRow) {
  const stored = parseStoredWritingRecord(row.record_data)
  if (stored) {
    return normalizeWritingRecord({
      ...stored,
      id: row.id,
      ownerUserId: row.user_id
    })
  }

  return parseStoredWritingRecord({
    id: row.id,
    ownerUserId: row.user_id,
    deviceId: 'server',
    taskType: row.task_type,
    title: row.title,
    prompt: row.prompt || '',
    essay: row.original_essay,
    originalEssay: row.original_essay,
    submittedAt: row.submitted_at,
    durationSeconds: 0,
    wordCount: row.original_essay.trim().split(/\s+/).filter(Boolean).length,
    evaluation: {
      ...(typeof row.evaluation === 'object' && row.evaluation ? row.evaluation : {}),
      annotations: row.annotations,
      correctedEssay: row.corrected_essay || '',
      improvedEssay: row.improved_essay || '',
      revisedEssay: row.improved_essay || '',
      modelEssay: row.model_essay || ''
    },
    acceptedChanges: row.accepted_changes,
    annotationVersion: row.annotation_version
  })
}

export const WritingRecordSelect = [
  'id',
  'user_id',
  'task_type',
  'title',
  'prompt',
  'original_essay',
  'corrected_essay',
  'improved_essay',
  'model_essay',
  'evaluation',
  'annotations',
  'accepted_changes',
  'annotation_version',
  'submitted_at',
  'record_data',
  'request_id',
  'processing_status',
  'failed_block_ids'
].join(', ')
