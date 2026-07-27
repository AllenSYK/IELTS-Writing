import { json } from '@/lib/http'
import { pastPaperPracticeReadiness } from '@/lib/past-paper-readiness'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin: Awaited<ReturnType<typeof requireWebAdmin>>
  try {
    admin = await requireWebAdmin(request)
  } catch (error) {
    return json(
      { success: false, message: error instanceof Response && error.status === 403 ? '无权发布真题' : '请先登录管理员账号' },
      { status: error instanceof Response ? error.status : 401 }
    )
  }

  const { id } = await params
  const { service, user } = admin

  const { data: question, error: fetchError } = await service
    .from('past_paper_questions')
    .select('id, status, task_type, question_text, task1_visual_types, task1_visual_data')
    .eq('id', id)
    .single()

  if (fetchError || !question) {
    return json({ success: false, message: 'Question not found' }, { status: 404 })
  }

  if (question.status === 'published') {
    return json({ success: true, unchanged: true })
  }

  const readiness = pastPaperPracticeReadiness({
    taskType: question.task_type,
    questionText: question.question_text,
    task1VisualTypes: question.task1_visual_types,
    task1VisualData: question.task1_visual_data as Record<string, unknown> | null
  })
  if (!readiness.ready) {
    return json({ success: false, code: readiness.code, message: readiness.message }, { status: 409 })
  }

  const { data: updated, error } = await service
    .from('past_paper_questions')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('status', question.status)
    .select('id')
    .maybeSingle()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  if (!updated) {
    return json({ success: false, code: 'CONFLICT', message: '题目状态已被其他管理员修改，请刷新后重试。' }, { status: 409 })
  }

  const auditInfo = extractAuditInfo(request)
  await logAdminAudit(service, {
    adminUserId: user.id,
    action: 'publish_past_paper',
    resourceType: 'past_paper',
    resourceId: id,
    requestId: auditInfo.requestId,
    ipHash: auditInfo.ip,
    userAgentSummary: auditInfo.userAgent
  })
  return json({ success: true })
}
