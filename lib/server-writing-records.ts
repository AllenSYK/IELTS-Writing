import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WritingRecordSelect,
  writingRecordFromRow
} from '@/lib/writing-record-persistence'
import type { WritingRecord } from '@/lib/writing-record-types'

export async function loadFullWritingRecordsForUser(
  service: SupabaseClient,
  userId: string,
  limit = 100
): Promise<WritingRecord[]> {
  const { data, error } = await service
    .from('writing_records')
    .select(WritingRecordSelect)
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? [])
    .map((row) => writingRecordFromRow(row as never))
    .filter((record): record is WritingRecord => Boolean(record))
}
