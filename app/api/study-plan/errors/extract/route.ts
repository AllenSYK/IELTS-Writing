import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { extractErrorsFromRecord, buildNormalizedKey } from '@/lib/error-extraction'
import type { WritingRecord } from '@/lib/writing-record-types'
import { writingRecordFromRow } from '@/lib/writing-record-persistence'

const ExtractSchema = z.object({
  writingRecordId: z.string().uuid()
})

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = ExtractSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: existingOccurrences } = await service
    .from('writing_error_occurrences')
    .select('id')
    .eq('user_id', userId)
    .eq('writing_record_id', body.writingRecordId)
    .limit(1)

  if (existingOccurrences && existingOccurrences.length > 0) {
    return json({ success: true, message: 'Already extracted', extracted: 0 })
  }

  const { data: recordRow, error: recordError } = await service
    .from('writing_records')
    .select('*')
    .eq('id', body.writingRecordId)
    .eq('user_id', userId)
    .maybeSingle()

  if (recordError || !recordRow) {
    return json({ success: false, message: 'Writing record not found' }, { status: 404 })
  }

  let record: WritingRecord
  try {
    const parsed = writingRecordFromRow(recordRow)
    if (!parsed) {
      return json({ success: false, message: 'Failed to parse record' }, { status: 500 })
    }
    record = parsed
  } catch {
    return json({ success: false, message: 'Failed to parse record' }, { status: 500 })
  }

  const extractedErrors = extractErrorsFromRecord(record)

  if (extractedErrors.length === 0) {
    await service
      .from('writing_records')
      .update({ error_extracted_at: new Date().toISOString() })
      .eq('id', body.writingRecordId)
    return json({ success: true, extracted: 0 })
  }

  let created = 0
  for (const err of extractedErrors) {
    const normalizedKey = buildNormalizedKey(err.category, err.title)

    const { data: existing } = await service
      .from('writing_error_patterns')
      .select('id, occurrence_count')
      .eq('user_id', userId)
      .eq('normalized_key', normalizedKey)
      .maybeSingle()

    let patternId: string

    if (existing) {
      patternId = existing.id as string

      const { data: existingOccurrence } = await service
        .from('writing_error_occurrences')
        .select('id')
        .eq('error_pattern_id', patternId)
        .eq('writing_record_id', body.writingRecordId)
        .maybeSingle()

      if (existingOccurrence) {
        continue
      }

      await service
        .from('writing_error_patterns')
        .update({
          occurrence_count: (existing.occurrence_count as number) + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          example_wrong: err.exampleWrong ?? undefined,
          example_correct: err.exampleCorrect ?? undefined
        })
        .eq('id', patternId)
    } else {
      const { data: newPattern } = await service
        .from('writing_error_patterns')
        .insert({
          user_id: userId,
          category: err.category,
          normalized_key: normalizedKey,
          title: err.title,
          description: err.description,
          example_wrong: err.exampleWrong,
          example_correct: err.exampleCorrect,
          occurrence_count: 1,
          status: 'active',
          mastery_level: 0
        })
        .select('id')
        .single()

      if (!newPattern) continue
      patternId = newPattern.id as string
      created++
    }

    await service
      .from('writing_error_occurrences')
      .insert({
        error_pattern_id: patternId,
        user_id: userId,
        writing_record_id: body.writingRecordId,
        sentence_excerpt: err.sentenceExcerpt,
        correction: err.exampleCorrect,
        explanation: err.explanation
      })
  }

  await service
    .from('writing_records')
    .update({ error_extracted_at: new Date().toISOString() })
    .eq('id', body.writingRecordId)

  return json({ success: true, extracted: created, total: extractedErrors.length })
}
