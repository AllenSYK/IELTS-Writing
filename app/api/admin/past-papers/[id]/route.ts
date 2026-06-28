import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { logAdminAudit, extractAuditInfo } from '@/lib/admin/audit-log'

const UpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  questionText: z.string().min(1).max(10000).optional(),
  summary: z.string().max(2000).optional(),
  taskType: z.enum(['task1_academic', 'task1_general', 'task2', 'full_test', 'unknown']).optional(),
  sourceType: z.enum(['official', 'published_collection', 'recalled', 'curated', 'official_public', 'published_book', 'exam_recall', 'platform_curated', 'user_submitted', 'other']).optional(),
  sourceName: z.string().max(200).nullable().optional(),
  sourceYear: z.number().int().min(1990).max(2030).nullable().optional(),
  sourceReference: z.string().max(500).nullable().optional(),
  frequencyLevel: z.enum(['high', 'medium_high', 'normal', 'low']).optional(),
  frequencySource: z.enum(['admin', 'ai_suggested', 'imported', 'unknown']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  topics: z.array(z.string().max(50)).max(20).optional(),
  keywords: z.array(z.string().max(50)).max(30).optional(),
  task1VisualTypes: z.array(z.string()).nullable().optional(),
  task2QuestionType: z.string().max(100).nullable().optional(),
  showSourceImage: z.boolean().optional(),
  status: z.enum(['draft', 'review_pending', 'published', 'unpublished', 'archived']).optional(),
  sourceNote: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().max(500).nullable().optional(),
  sourceDate: z.string().max(20).nullable().optional(),
  sourceReliability: z.enum(['confirmed', 'multiple_reports', 'single_report', 'uncertain']).nullable().optional(),
  showSourceToUsers: z.boolean().optional(),
  internalNote: z.string().max(5000).nullable().optional(),
  userNote: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isFeatured: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  sortWeight: z.number().int().min(-9999).max(9999).optional(),
  isVisible: z.boolean().optional(),
  completeness: z.enum(['complete', 'mostly_complete', 'partial', 'summary_only', 'missing']).nullable().optional(),
  missingFields: z.array(z.string()).nullable().optional(),
  uncertainties: z.array(z.string()).nullable().optional(),
  primaryTopic: z.string().max(100).nullable().optional(),
  secondaryTopics: z.array(z.string().max(50)).max(10).optional(),
  examDate: z.string().max(20).nullable().optional(),
  examSession: z.enum(['morning', 'afternoon', 'evening', 'unknown']).optional(),
  examTimeLocal: z.string().max(20).nullable().optional(),
  examTimezone: z.string().max(50).nullable().optional(),
  examMode: z.enum(['computer', 'paper', 'unknown']).optional(),
  examCountry: z.string().max(100).nullable().optional(),
  examRegion: z.string().max(100).nullable().optional(),
  examCity: z.string().max(100).nullable().optional(),
  venueNote: z.string().max(500).nullable().optional(),
  expectedUpdatedAt: z.string().optional()
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)
  
  try {
    const { user, service } = await requireAdminService()

    const { id } = await params
    let body
    try {
      body = UpdateSchema.parse(await request.json())
    } catch {
      return json({ success: false, message: 'Invalid input', requestId }, { status: 400 })
    }

    const { expectedUpdatedAt, ...fields } = body
    const updates: Record<string, unknown> = {}

  if (fields.title !== undefined) updates.title = fields.title
  if (fields.questionText !== undefined) updates.question_text = fields.questionText
  if (fields.summary !== undefined) updates.summary = fields.summary
  if (fields.taskType !== undefined) updates.task_type = fields.taskType
  if (fields.sourceType !== undefined) updates.source_type = fields.sourceType
  if (fields.sourceName !== undefined) updates.source_name = fields.sourceName
  if (fields.sourceYear !== undefined) updates.source_year = fields.sourceYear
  if (fields.sourceReference !== undefined) updates.source_reference = fields.sourceReference
  if (fields.frequencyLevel !== undefined) updates.frequency_level = fields.frequencyLevel
  if (fields.frequencySource !== undefined) updates.frequency_source = fields.frequencySource
  if (fields.difficulty !== undefined) updates.difficulty = fields.difficulty
  if (fields.topics !== undefined) updates.topics = fields.topics
  if (fields.keywords !== undefined) updates.keywords = fields.keywords
  if (fields.task1VisualTypes !== undefined) updates.task1_visual_types = fields.task1VisualTypes
  if (fields.task2QuestionType !== undefined) updates.task2_question_type = fields.task2QuestionType
  if (fields.showSourceImage !== undefined) updates.show_source_image = fields.showSourceImage
  if (fields.status !== undefined) updates.status = fields.status
  if (fields.sourceNote !== undefined) updates.source_note = fields.sourceNote
  if (fields.sourceUrl !== undefined) updates.source_url = fields.sourceUrl
  if (fields.sourceDate !== undefined) updates.source_date = fields.sourceDate
  if (fields.sourceReliability !== undefined) updates.source_reliability = fields.sourceReliability
  if (fields.showSourceToUsers !== undefined) updates.show_source_to_users = fields.showSourceToUsers
  if (fields.internalNote !== undefined) updates.internal_note = fields.internalNote
  if (fields.userNote !== undefined) updates.user_note = fields.userNote
  if (fields.tags !== undefined) updates.tags = fields.tags
  if (fields.isFeatured !== undefined) updates.is_featured = fields.isFeatured
  if (fields.isPinned !== undefined) updates.is_pinned = fields.isPinned
  if (fields.isRecommended !== undefined) updates.is_recommended = fields.isRecommended
  if (fields.sortWeight !== undefined) updates.sort_weight = fields.sortWeight
  if (fields.isVisible !== undefined) updates.is_visible = fields.isVisible
  if (fields.completeness !== undefined) updates.completeness = fields.completeness
  if (fields.missingFields !== undefined) updates.missing_fields = fields.missingFields
  if (fields.uncertainties !== undefined) updates.uncertainties = fields.uncertainties
  if (fields.primaryTopic !== undefined) updates.primary_topic = fields.primaryTopic
  if (fields.secondaryTopics !== undefined) updates.secondary_topics = fields.secondaryTopics
  if (fields.examDate !== undefined) updates.exam_date = fields.examDate
  if (fields.examSession !== undefined) updates.exam_session = fields.examSession
  if (fields.examTimeLocal !== undefined) updates.exam_time_local = fields.examTimeLocal
  if (fields.examTimezone !== undefined) updates.exam_timezone = fields.examTimezone
  if (fields.examMode !== undefined) updates.exam_mode = fields.examMode
  if (fields.examCountry !== undefined) updates.exam_country = fields.examCountry
  if (fields.examRegion !== undefined) updates.exam_region = fields.examRegion
  if (fields.examCity !== undefined) updates.exam_city = fields.examCity
  if (fields.venueNote !== undefined) updates.venue_note = fields.venueNote

  if (Object.keys(updates).length === 0) {
    return json({ success: false, message: 'No updates provided', requestId }, { status: 400 })
  }

  updates.updated_by = user.id

  if (expectedUpdatedAt) {
    const { data: existing, error: fetchError } = await service
      .from('past_paper_questions')
      .select('updated_at')
      .eq('id', id)
      .single()

    if (fetchError) return json({ success: false, message: 'Question not found', requestId }, { status: 404 })

    const serverTime = new Date(existing.updated_at as string).getTime()
    const clientTime = new Date(expectedUpdatedAt).getTime()
    if (Math.abs(serverTime - clientTime) > 2000) {
      // 记录冲突审计日志
      await logAdminAudit(service, {
        adminUserId: user.id,
        action: 'update_past_paper',
        resourceType: 'past_paper',
        resourceId: id,
        requestId,
        result: 'failure',
        errorMessage: '该题目已被其他管理员更新',
        ipHash: auditInfo.ip,
        userAgentSummary: auditInfo.userAgent
      })
      
      return json({
        success: false,
        code: 'CONFLICT',
        message: '该题目已被其他管理员更新，请刷新后重新编辑。',
        requestId
      }, { status: 409 })
    }
  }

  const { data, error } = await service
    .from('past_paper_questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return json({ success: false, message: error.message, requestId }, { status: 500 })
  
  // 记录成功审计日志
  const changedFieldNames = Object.keys(updates).filter(k => k !== 'updated_by')
  await logAdminAudit(service, {
    adminUserId: user.id,
    action: 'update_past_paper',
    resourceType: 'past_paper',
    resourceId: id,
    requestId,
    result: 'success',
    changedFields: { fields: changedFieldNames },
    ipHash: auditInfo.ip,
    userAgentSummary: auditInfo.userAgent
  })
  
  return json({ success: true, question: mapRow(data), requestId })
  } catch (error) {
    return adminApiError(error, '无法更新真题')
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()

    const { id } = await params
    const { data, error } = await service
      .from('past_paper_questions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return json({ success: false, message: 'Not found' }, { status: 404 })
    return json({ success: true, question: mapRow(data) })
  } catch (error) {
    return adminApiError(error, '无法获取真题详情')
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)
  
  try {
    const { user, service } = await requireAdminService()

    const { id } = await params
    
    // 先获取真题信息用于审计
    const { data: question } = await service
      .from('past_paper_questions')
      .select('title, status')
      .eq('id', id)
      .single()
    
    const { error } = await service.from('past_paper_questions').delete().eq('id', id)
    if (error) return json({ success: false, message: error.message, requestId }, { status: 500 })
    
    // 记录审计日志
    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'delete_past_paper',
      resourceType: 'past_paper',
      resourceId: id,
      requestId,
      result: 'success',
      metadata: {
        title: question?.title,
        status: question?.status
      },
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })
    
    return json({ success: true, requestId })
  } catch (error) {
    return adminApiError(error, '无法删除真题')
  }
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
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    examWritingSetId: row.exam_writing_set_id, examDate: row.exam_date,
    examSession: row.exam_session, examTimeLocal: row.exam_time_local,
    examTimezone: row.exam_timezone, examMode: row.exam_mode,
    examCountry: row.exam_country, examRegion: row.exam_region,
    examCity: row.exam_city, venueNote: row.venue_note,
    completeness: row.completeness, missingFields: row.missing_fields ?? [],
    uncertainties: row.uncertainties ?? [], primaryTopic: row.primary_topic,
    secondaryTopics: row.secondary_topics ?? [],
    sourceNote: row.source_note, sourceUrl: row.source_url,
    sourceDate: row.source_date, sourceReliability: row.source_reliability,
    showSourceToUsers: row.show_source_to_users, internalNote: row.internal_note,
    userNote: row.user_note, tags: row.tags ?? [],
    isFeatured: row.is_featured, isPinned: row.is_pinned,
    isRecommended: row.is_recommended, sortWeight: row.sort_weight ?? 0,
    isVisible: row.is_visible, updatedBy: row.updated_by
  }
}
