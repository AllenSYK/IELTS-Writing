import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

const UpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  questionText: z.string().min(1).max(10000).optional(),
  summary: z.string().max(1000).optional(),
  taskType: z.enum(['task1_academic', 'task1_general', 'task2', 'full_test', 'unknown']).optional(),
  sourceType: z.enum(['official', 'published_collection', 'recalled', 'curated']).optional(),
  sourceName: z.string().max(200).nullable().optional(),
  sourceYear: z.number().int().min(1990).max(2030).nullable().optional(),
  frequencyLevel: z.enum(['high', 'medium_high', 'normal', 'low']).optional(),
  frequencySource: z.enum(['admin', 'ai_suggested']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  topics: z.array(z.string().max(50)).max(10).optional(),
  keywords: z.array(z.string().max(50)).max(20).optional(),
  task1VisualTypes: z.array(z.string()).nullable().optional(),
  task2QuestionType: z.string().max(100).nullable().optional(),
  showSourceImage: z.boolean().optional()
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWebAdmin()
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let body
  try {
    body = UpdateSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title
  if (body.questionText !== undefined) updates.question_text = body.questionText
  if (body.summary !== undefined) updates.summary = body.summary
  if (body.taskType !== undefined) updates.task_type = body.taskType
  if (body.sourceType !== undefined) updates.source_type = body.sourceType
  if (body.sourceName !== undefined) updates.source_name = body.sourceName
  if (body.sourceYear !== undefined) updates.source_year = body.sourceYear
  if (body.frequencyLevel !== undefined) updates.frequency_level = body.frequencyLevel
  if (body.frequencySource !== undefined) updates.frequency_source = body.frequencySource
  if (body.difficulty !== undefined) updates.difficulty = body.difficulty
  if (body.topics !== undefined) updates.topics = body.topics
  if (body.keywords !== undefined) updates.keywords = body.keywords
  if (body.task1VisualTypes !== undefined) updates.task1_visual_types = body.task1VisualTypes
  if (body.task2QuestionType !== undefined) updates.task2_question_type = body.task2QuestionType
  if (body.showSourceImage !== undefined) updates.show_source_image = body.showSourceImage

  if (Object.keys(updates).length === 0) {
    return json({ success: false, message: 'No updates provided' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service
    .from('past_paper_questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true, question: mapRow(data) })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWebAdmin()
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const service = createSupabaseServiceRoleClient()
  const { error } = await service.from('past_paper_questions').delete().eq('id', id)
  if (error) return json({ success: false, message: error.message }, { status: 500 })
  return json({ success: true })
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id, status: row.status, taskType: row.task_type, title: row.title,
    questionText: row.question_text, summary: row.summary, sourceType: row.source_type,
    sourceName: row.source_name, sourceYear: row.source_year, sourceReference: row.source_reference,
    frequencyLevel: row.frequency_level, frequencySource: row.frequency_source,
    difficulty: row.difficulty, task1VisualTypes: row.task1_visual_types,
    task1VisualData: row.task1_visual_data, task2QuestionType: row.task2_question_type,
    topics: row.topics ?? [], keywords: row.keywords ?? [],
    sourceImagePath: row.source_image_path, showSourceImage: row.show_source_image,
    aiAnalysis: row.ai_analysis, aiModel: row.ai_model, aiAnalyzedAt: row.ai_analyzed_at,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, publishedAt: row.published_at,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at
  }
}
