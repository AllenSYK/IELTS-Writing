import { json } from '@/lib/http'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin: Awaited<ReturnType<typeof requireWebAdmin>>
  try {
    admin = await requireWebAdmin(request)
  } catch (error) {
    return json(
      { success: false, message: error instanceof Response && error.status === 403 ? '无权下架真题' : '请先登录管理员账号' },
      { status: error instanceof Response ? error.status : 401 }
    )
  }

  const { id } = await params
  const { service, user } = admin

  const { data: updated, error } = await service
    .from('past_paper_questions')
    .update({ status: 'unpublished', published_at: null })
    .eq('id', id)
    .eq('status', 'published')
    .select('id')
    .maybeSingle()

  if (error) return json({ success: false, message: error.message }, { status: 500 })
  if (!updated) {
    const { data: current } = await service
      .from('past_paper_questions')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (!current) return json({ success: false, message: '真题不存在' }, { status: 404 })
    if (current.status === 'unpublished') return json({ success: true, unchanged: true })
    return json({ success: false, code: 'CONFLICT', message: '题目状态已被其他管理员修改，请刷新后重试。' }, { status: 409 })
  }

  const auditInfo = extractAuditInfo(request)
  await logAdminAudit(service, {
    adminUserId: user.id,
    action: 'unpublish_past_paper',
    resourceType: 'past_paper',
    resourceId: id,
    requestId: auditInfo.requestId,
    ipHash: auditInfo.ip,
    userAgentSummary: auditInfo.userAgent
  })
  return json({ success: true })
}
