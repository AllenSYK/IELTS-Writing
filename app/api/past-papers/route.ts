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
  search: z.string().max(200).optional(),
  examSession: z.string().optional(),
  examMode: z.string().optional(),
  completeness: z.string().optional(),
  examDateFrom: z.string().optional(),
  examDateTo: z.string().optional(),
  sort: z.enum(['random', 'newest', 'frequency', 'difficulty_asc', 'difficulty_desc']).default('random'),
  seed: z.string().max(64).optional()
})

// Stable hash: same input always produces same output
function stableHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

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

  const { page, pageSize, taskType, frequencyLevel, sourceType, task1VisualType, task2QuestionType, topic, year, search, examSession, examMode, completeness, examDateFrom, examDateTo, sort, seed } = parsed.data
  const service = createSupabaseServiceRoleClient()

  const selectFields =
    'id, task_type, title, summary, source_type, source_name, source_year, frequency_level, difficulty, ' +
    'task1_visual_types, task2_question_type, topics, created_at, primary_topic, secondary_topics, ' +
    'exam_date, exam_session, exam_mode, exam_region, completeness, ' +
    'display_published_at, exam_session_label, exam_session_source, appearance_frequency, frequency_score, frequency_source'

  // For random sort with seed, we need to fetch a larger window and do seeded ordering server-side
  // because PostgREST doesn't support custom SQL expressions in ORDER BY
  const useSeededRandom = sort === 'random' && seed

  let query = service
    .from('past_paper_questions')
    .select(selectFields, { count: 'exact' })
    .eq('status', 'published')
    .eq('is_visible', true)

  // Apply filters
  if (taskType && taskType !== 'all') {
    if (taskType === 'task1') query = query.in('task_type', ['task1_academic', 'task1_general'])
    else if (taskType === 'task2') query = query.eq('task_type', 'task2')
    else if (taskType === 'full_test') query = query.eq('task_type', 'full_test')
  }
  if (frequencyLevel && frequencyLevel !== 'all') query = query.eq('frequency_level', frequencyLevel)
  if (sourceType && sourceType !== 'all') query = query.eq('source_type', sourceType)
  if (task1VisualType && task1VisualType !== 'all') query = query.contains('task1_visual_types', [task1VisualType])
  if (task2QuestionType && task2QuestionType !== 'all') query = query.eq('task2_question_type', task2QuestionType)
  if (topic && topic !== 'all') query = query.or(`topics.cs.{${topic}},primary_topic.eq.${topic},secondary_topics.cs.{${topic}}`)
  if (year) query = query.eq('source_year', year)
  if (search) query = query.or(`title.ilike.%${search}%,question_text.ilike.%${search}%,summary.ilike.%${search}%,keywords.cs.{${search}}`)
  if (examSession && examSession !== 'all') query = query.eq('exam_session', examSession)
  if (examMode && examMode !== 'all') query = query.eq('exam_mode', examMode)
  if (completeness && completeness !== 'all') query = query.eq('completeness', completeness)
  if (examDateFrom) query = query.gte('exam_date', examDateFrom)
  if (examDateTo) query = query.lte('exam_date', examDateTo)

  let total = 0

  if (useSeededRandom) {
    // For seeded random: fetch all matching IDs first to compute seeded order
    // This is necessary because PostgREST doesn't support hashtextextended in ORDER BY
    const MAX_WINDOW = 600
    const idQuery = service
      .from('past_paper_questions')
      .select('id', { count: 'exact' })
      .eq('status', 'published')
      .eq('is_visible', true)

    // Apply same filters to ID query
    if (taskType && taskType !== 'all') {
      if (taskType === 'task1') idQuery.in('task_type', ['task1_academic', 'task1_general'])
      else if (taskType === 'task2') idQuery.eq('task_type', 'task2')
      else if (taskType === 'full_test') idQuery.eq('task_type', 'full_test')
    }
    if (frequencyLevel && frequencyLevel !== 'all') idQuery.eq('frequency_level', frequencyLevel)
    if (sourceType && sourceType !== 'all') idQuery.eq('source_type', sourceType)
    if (task1VisualType && task1VisualType !== 'all') idQuery.contains('task1_visual_types', [task1VisualType])
    if (task2QuestionType && task2QuestionType !== 'all') idQuery.eq('task2_question_type', task2QuestionType)
    if (topic && topic !== 'all') idQuery.or(`topics.cs.{${topic}},primary_topic.eq.${topic},secondary_topics.cs.{${topic}}`)
    if (year) idQuery.eq('source_year', year)
    if (search) idQuery.or(`title.ilike.%${search}%,question_text.ilike.%${search}%,summary.ilike.%${search}%,keywords.cs.{${search}}`)
    if (examSession && examSession !== 'all') idQuery.eq('exam_session', examSession)
    if (examMode && examMode !== 'all') idQuery.eq('exam_mode', examMode)
    if (completeness && completeness !== 'all') idQuery.eq('completeness', completeness)
    if (examDateFrom) idQuery.gte('exam_date', examDateFrom)
    if (examDateTo) idQuery.lte('exam_date', examDateTo)

    const { data: allIds, count: totalCount, error: idError } = await idQuery.range(0, MAX_WINDOW - 1)
    if (idError) return json({ success: false, message: idError.message }, { status: 500 })
    total = totalCount ?? 0

    if (!allIds || allIds.length === 0) {
      return json({ success: true, items: [], total: 0, page, pageSize, sort, seed })
    }

    // Compute seeded order: hash(question_id + seed) for each
    const seedHash = stableHash(seed)
    const ordered = allIds
      .map((row) => ({
        id: row.id as string,
        sortKey: stableHash(String(row.id) + ':' + String(seedHash))
      }))
      .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id))

    // Paginate from the seeded order
    const offset = (page - 1) * pageSize
    const pageIds = ordered.slice(offset, offset + pageSize).map((r) => r.id)

    if (pageIds.length === 0) {
      return json({ success: true, items: [], total, page, pageSize, sort, seed })
    }

    // Fetch full data for the page IDs
    const { data: pageData, error: pageError } = await service
      .from('past_paper_questions')
      .select(selectFields)
      .in('id', pageIds)

    if (pageError) return json({ success: false, message: pageError.message }, { status: 500 })

    // Map data and maintain seeded order
    const dataMap = new Map<string, Record<string, unknown>>()
    for (const row of (pageData ?? []) as unknown as Record<string, unknown>[]) {
      dataMap.set(row.id as string, row)
    }
    const items = pageIds
      .map((id) => dataMap.get(id))
      .filter((r): r is Record<string, unknown> => r != null)
      .map(mapRow)

    return json({ success: true, items, total, page, pageSize, sort, seed })
  }

  // Non-random sort: standard pagination
  switch (sort) {
    case 'newest':
      query = query.order('display_published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      break
    case 'frequency':
      query = query.order('frequency_score', { ascending: false, nullsFirst: false })
        .order('frequency_level', { ascending: true })
      break
    case 'difficulty_asc':
      query = query.order('difficulty', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      break
    case 'difficulty_desc':
      query = query.order('difficulty', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      break
  }

  const offset = (page - 1) * pageSize
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  if (error) return json({ success: false, message: error.message }, { status: 500 })

  const items = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow)

  return json({ success: true, items, total: count ?? 0, page, pageSize, sort, seed: seed ?? null })
}

function mapRow(row: Record<string, unknown>) {
  return {
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
    createdAt: row.created_at,
    primaryTopic: row.primary_topic,
    secondaryTopics: row.secondary_topics ?? [],
    examDate: row.exam_date,
    examSession: row.exam_session,
    examMode: row.exam_mode,
    examRegion: row.exam_region,
    completeness: row.completeness,
    displayPublishedAt: row.display_published_at,
    examSessionLabel: row.exam_session_label,
    examSessionSource: row.exam_session_source,
    appearanceFrequency: row.appearance_frequency,
    frequencyScore: row.frequency_score,
    frequencySource: row.frequency_source
  }
}
