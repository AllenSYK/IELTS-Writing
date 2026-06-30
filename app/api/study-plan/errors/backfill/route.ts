import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { extractErrorsFromRecord, buildNormalizedKey } from '@/lib/error-extraction'
import { writingRecordFromRow } from '@/lib/writing-record-persistence'

const BATCH_SIZE = 3

export async function POST() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { count: totalRecords } = await service
    .from('writing_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { count: extractedRecords } = await service
    .from('writing_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('error_extracted_at', 'is', null)

  const totalEligible = totalRecords ?? 0
  const alreadyExtracted = extractedRecords ?? 0

  const { data: unextractedRows, error: fetchError } = await service
    .from('writing_records')
    .select('id, user_id, task_type, title, prompt, original_essay, corrected_essay, improved_essay, evaluation, annotations, accepted_changes, submitted_at, record_data, error_extracted_at')
    .eq('user_id', userId)
    .is('error_extracted_at', null)
    .order('submitted_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchError) {
    return json({ success: false, message: fetchError.message }, { status: 500 })
  }

  if (!unextractedRows || unextractedRows.length === 0) {
    return json({
      success: true,
      totalEligible,
      processed: 0,
      remaining: 0,
      failed: 0,
      message: 'No records to process'
    })
  }

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const row of unextractedRows) {
    try {
      const record = writingRecordFromRow(row as never)
      if (!record) {
        failed++
        errors.push(`${row.id}: Failed to parse record`)
        continue
      }

      const extractedErrors = extractErrorsFromRecord(record)

      if (extractedErrors.length === 0) {
        await service
          .from('writing_records')
          .update({ error_extracted_at: new Date().toISOString() })
          .eq('id', row.id)
        processed++
        continue
      }

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
            .eq('writing_record_id', row.id)
            .maybeSingle()

          if (existingOccurrence) {
            continue
          }

          await service
            .from('writing_error_patterns')
            .update({
              occurrence_count: (existing.occurrence_count as number) + 1,
              last_seen_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
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

          if (!newPattern) {
            failed++
            errors.push(`${row.id}: Failed to create pattern`)
            continue
          }
          patternId = newPattern.id as string
        }

        await service
          .from('writing_error_occurrences')
          .insert({
            error_pattern_id: patternId,
            user_id: userId,
            writing_record_id: row.id,
            sentence_excerpt: err.sentenceExcerpt,
            correction: err.exampleCorrect,
            explanation: err.explanation
          })
      }

      await service
        .from('writing_records')
        .update({ error_extracted_at: new Date().toISOString() })
        .eq('id', row.id)

      processed++
    } catch (err) {
      failed++
      errors.push(`${row.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)

      await service
        .from('writing_records')
        .update({ error_extracted_at: new Date().toISOString() })
        .eq('id', row.id)
    }
  }

  const remaining = totalEligible - alreadyExtracted - processed

  return json({
    success: true,
    totalEligible,
    processed,
    remaining: Math.max(0, remaining),
    failed,
    errors: errors.length > 0 ? errors : undefined
  })
}
