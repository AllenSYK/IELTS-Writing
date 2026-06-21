import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import type { WritingRecordListItem } from '@/lib/writing-records'

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('writing_records')
    .select([
      'id',
      'task_type',
      'title',
      'submitted_at',
      'processing_status',
      'request_id',
      'evaluation->>bandEstimate',
      'evaluation->>overallBand',
      'evaluation->>summary'
    ].join(', '))
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(50)

  if (error) {
    return json({ success: false, message: '历史记录读取失败' }, { status: 500 })
  }

  const records: WritingRecordListItem[] = (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>
    return {
      id: r.id as string,
      taskType: r.task_type as string,
      title: r.title as string,
      submittedAt: r.submitted_at as string,
      processingStatus: r.processing_status as string,
      requestId: r.request_id as string | null,
      overallBand: ((r.bandEstimate as string) || (r.overallBand as string)) ?? null,
      summary: (r.summary as string) ?? null,
      taScore: null,
      trScore: null,
      ccScore: null,
      lrScore: null,
      graScore: null
    }
  })

  return json({ success: true, records })
}
