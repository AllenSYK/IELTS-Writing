import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  status: z.string().optional(),
  taskType: z.string().optional(),
  frequencyLevel: z.string().optional(),
  sourceType: z.string().optional(),
  difficulty: z.string().optional(),
  topic: z.string().optional(),
  search: z.string().max(200).optional()
})

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return json({ success: false, message: 'Invalid query' }, { status: 400 })
    }

    const { page, pageSize, status, taskType, frequencyLevel, sourceType, difficulty, topic, search } = parsed.data
    const offset = (page - 1) * pageSize

    let query = service
      .from('past_paper_questions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (status) query = query.eq('status', status)
    if (taskType) query = query.eq('task_type', taskType)
    if (frequencyLevel) query = query.eq('frequency_level', frequencyLevel)
    if (sourceType) query = query.eq('source_type', sourceType)
    if (difficulty) query = query.eq('difficulty', difficulty)
    if (topic) query = query.contains('topics', [topic])
    if (search) {
      const safe = search.replace(/%/g, '\\%').replace(/_/g, '\\_').slice(0, 200)
      query = query.or(`title.ilike.%${safe}%,question_text.ilike.%${safe}%,summary.ilike.%${safe}%`)
    }

    const { data, error, count } = await query
    if (error) return json({ success: false, message: error.message }, { status: 500 })

    return json({
      success: true,
      items: (data ?? []).map(mapRow),
      total: count ?? 0,
      page,
      pageSize
    })
  } catch (error) {
    return adminApiError(error, '无法加载真题列表')
  }
}

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  questionText: z.string().min(1).max(10000),
  taskType: z.enum(['task1_academic', 'task1_general', 'task2', 'full_test', 'unknown']).default('unknown'),
  sourceType: z.enum(['official', 'published_collection', 'recalled', 'curated']).default('curated'),
  sourceName: z.string().max(200).optional(),
  sourceYear: z.number().int().min(1990).max(2030).optional(),
  frequencyLevel: z.enum(['high', 'medium_high', 'normal', 'low']).default('normal'),
  topics: z.array(z.string().max(50)).max(10).default([]),
  keywords: z.array(z.string().max(50)).max(20).default([]),
  summary: z.string().max(1000).default('')
})

export async function POST(request: Request) {
  try {
    const { user, service } = await requireAdminService()

    let body
    try {
      body = CreateSchema.parse(await request.json())
    } catch {
      return json({ success: false, message: 'Invalid input' }, { status: 400 })
    }

    const { data, error } = await service
    .from('past_paper_questions')
    .insert({
      title: body.title,
      question_text: body.questionText,
      task_type: body.taskType,
      source_type: body.sourceType,
      source_name: body.sourceName ?? null,
      source_year: body.sourceYear ?? null,
      frequency_level: body.frequencyLevel,
      topics: body.topics,
      keywords: body.keywords,
      summary: body.summary,
      status: 'draft',
      created_by: user.id
    })
    .select()
    .single()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true, question: mapRow(data) })
  } catch (error) {
    return adminApiError(error, '无法创建真题')
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    status: row.status,
    taskType: row.task_type,
    title: row.title,
    questionText: row.question_text,
    summary: row.summary,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceYear: row.source_year,
    sourceReference: row.source_reference,
    frequencyLevel: row.frequency_level,
    frequencySource: row.frequency_source,
    difficulty: row.difficulty,
    task1VisualTypes: row.task1_visual_types,
    task1VisualData: row.task1_visual_data,
    task2QuestionType: row.task2_question_type,
    topics: row.topics ?? [],
    keywords: row.keywords ?? [],
    sourceImagePath: row.source_image_path,
    showSourceImage: row.show_source_image,
    aiAnalysis: row.ai_analysis,
    aiModel: row.ai_model,
    aiAnalyzedAt: row.ai_analyzed_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
