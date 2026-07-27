import { z } from 'zod'
import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

const FieldUpdateSchema = z.object({
  taskType: z.string().optional(),
  task1VisualTypes: z.array(z.string()).optional(),
  task2QuestionType: z.string().optional(),
  primaryTopic: z.string().nullable().optional(),
  secondaryTopics: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  frequencyLevel: z.string().optional(),
  sourceType: z.string().optional(),
  sourceReliability: z.string().optional(),
  completeness: z.string().optional(),
  tags: z.array(z.string()).optional(),
  missingFields: z.array(z.string()).optional(),
  uncertainties: z.array(z.string()).optional()
})

const ConfirmSchema = z.object({
  items: z.array(z.object({
    questionId: z.string().uuid(),
    fields: FieldUpdateSchema,
    classificationSource: z.record(z.string()).optional()
  })).min(1).max(50)
})

export async function POST(request: Request) {
  try {
    await requireWebAdmin(request)
  } catch {
    return json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = ConfirmSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  let successCount = 0
  let failureCount = 0

  for (const item of body.items) {
    const updates: Record<string, unknown> = {}
    const sources: Record<string, string> = item.classificationSource ?? {}

    if (item.fields.taskType !== undefined) { updates.task_type = item.fields.taskType; if (!sources.taskType) sources.taskType = 'ai' }
    if (item.fields.task1VisualTypes !== undefined) { updates.task1_visual_types = item.fields.task1VisualTypes; if (!sources.task1VisualTypes) sources.task1VisualTypes = 'ai' }
    if (item.fields.task2QuestionType !== undefined) { updates.task2_question_type = item.fields.task2QuestionType; if (!sources.task2QuestionType) sources.task2QuestionType = 'ai' }
    if (item.fields.primaryTopic !== undefined) { updates.primary_topic = item.fields.primaryTopic; if (!sources.primaryTopic) sources.primaryTopic = 'ai' }
    if (item.fields.secondaryTopics !== undefined) { updates.secondary_topics = item.fields.secondaryTopics; if (!sources.secondaryTopics) sources.secondaryTopics = 'ai' }
    if (item.fields.keywords !== undefined) { updates.keywords = item.fields.keywords; if (!sources.keywords) sources.keywords = 'ai' }
    if (item.fields.frequencyLevel !== undefined) { updates.frequency_level = item.fields.frequencyLevel; if (!sources.frequencyLevel) sources.frequencyLevel = 'ai' }
    if (item.fields.sourceType !== undefined) { updates.source_type = item.fields.sourceType; if (!sources.sourceType) sources.sourceType = 'ai' }
    if (item.fields.sourceReliability !== undefined) { updates.source_reliability = item.fields.sourceReliability; if (!sources.sourceReliability) sources.sourceReliability = 'ai' }
    if (item.fields.completeness !== undefined) { updates.completeness = item.fields.completeness; if (!sources.completeness) sources.completeness = 'ai' }
    if (item.fields.tags !== undefined) { updates.tags = item.fields.tags; if (!sources.tags) sources.tags = 'ai' }
    if (item.fields.missingFields !== undefined) { updates.missing_fields = item.fields.missingFields; if (!sources.missingFields) sources.missingFields = 'ai' }
    if (item.fields.uncertainties !== undefined) { updates.uncertainties = item.fields.uncertainties; if (!sources.uncertainties) sources.uncertainties = 'ai' }

    if (Object.keys(updates).length === 0) continue

    updates.classification_sources = sources
    updates.classification_status = 'ai_classified'
    updates.ai_classified_at = new Date().toISOString()
    updates.frequency_source = sources.frequencyLevel === 'admin' ? 'admin' : 'ai'

    const { error } = await service
      .from('past_paper_questions')
      .update(updates)
      .eq('id', item.questionId)

    if (error) {
      failureCount++
    } else {
      successCount++
    }
  }

  return json({ success: true, successCount, failureCount, total: body.items.length })
}
