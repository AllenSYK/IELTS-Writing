import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
  taskType: z.string().optional(),
  frequencyLevel: z.string().optional(),
  sourceType: z.string().optional(),
  task1VisualType: z.string().optional(),
  task2QuestionType: z.string().optional(),
  topic: z.string().optional(),
  year: z.coerce.number().int().optional(),
  search: z.string().max(200).optional()
})

export async function GET(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) {
    return json({ success: false, message: check.message }, { status: check.status })
  }

  const url = new URL(request.url)
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return json({ success: false, message: 'Invalid query' }, { status: 400 })
  }

  const { page, pageSize, taskType, frequencyLevel, sourceType, task1VisualType, task2QuestionType, topic, year, search } = parsed.data
  const service = createSupabaseServiceRoleClient()
  const offset = (page - 1) * pageSize

  let query = service
    .from('past_paper_questions')
    .select('id, task_type, title, summary, source_type, source_name, source_year, frequency_level, difficulty, task1_visual_types, task2_question_type, topics, created_at', { count: 'exact' })
    .eq('status', 'published')
    .order('frequency_level', { ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (taskType && taskType !== 'all') {
    if (taskType === 'task1') query = query.in('task_type', ['task1_academic', 'task1_general'])
    else if (taskType === 'task2') query = query.eq('task_type', 'task2')
    else if (taskType === 'full_test') query = query.eq('task_type', 'full_test')
  }
  if (frequencyLevel && frequencyLevel !== 'all') query = query.eq('frequency_level', frequencyLevel)
  if (sourceType && sourceType !== 'all') query = query.eq('source_type', sourceType)
  if (task1VisualType && task1VisualType !== 'all') query = query.contains('task1_visual_types', [task1VisualType])
  if (task2QuestionType && task2QuestionType !== 'all') query = query.eq('task2_question_type', task2QuestionType)
  if (topic && topic !== 'all') query = query.contains('topics', [topic])
  if (year) query = query.eq('source_year', year)
  if (search) query = query.or(`title.ilike.%${search}%,question_text.ilike.%${search}%,summary.ilike.%${search}%,keywords.cs.{${search}}`)

  const { data, error, count } = await query
  if (error) return json({ success: false, message: error.message }, { status: 500 })

  const items = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    taskType: row.task_type,
    title: row.title,
    summary: row.summary,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceYear: row.source_year,
    frequencyLevel: row.frequency_level,
    difficulty: row.difficulty,
    task1VisualTypes: row.task1_visual_types,
    task2QuestionType: row.task2_question_type,
    topics: row.topics ?? [],
    createdAt: row.created_at
  }))

  return json({ success: true, items, total: count ?? 0, page, pageSize })
}
