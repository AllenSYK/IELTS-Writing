import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { logAdminAudit, extractAuditInfo } from '@/lib/admin/audit-log'

const ListQuerySchema = z.object({
  status: z.enum(['pending', 'reviewing', 'resolved', 'closed']).optional(),
  category: z.string().max(60).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
})

const FeedbackPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'reviewing', 'resolved', 'closed']).optional(),
  adminNote: z.string().max(4000).nullable().optional(),
  resolutionNote: z.string().max(4000).nullable().optional()
})

function rowToFeedback(row: Record<string, unknown>) {
  return {
    id: row.id,
    displayId: `FB-${String(row.id).slice(0, 8).toUpperCase()}`,
    category: row.category,
    subject: row.subject,
    message: row.message,
    contactEmail: row.contact_email,
    userId: row.user_id,
    status: row.status,
    priority: row.priority,
    adminNote: row.admin_note,
    resolutionNote: row.resolution_note,
    appVersion: row.app_version,
    platform: row.platform,
    osVersion: row.os_version,
    diagnostics: row.diagnostics,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function GET(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const query = ListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))
    const offset = (query.page - 1) * query.limit

    let dbQuery = service
      .from('support_feedback')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + query.limit - 1)

    if (query.status) dbQuery = dbQuery.eq('status', query.status)
    if (query.category) dbQuery = dbQuery.eq('category', query.category)
    if (query.priority) dbQuery = dbQuery.eq('priority', query.priority)
    if (query.search) {
      const term = query.search.replace(/[%_]/g, '\\$&')
      dbQuery = dbQuery.or(`subject.ilike.%${term}%,message.ilike.%${term}%`)
    }

    const [{ data, error, count }, { data: statusRows }] = await Promise.all([
      dbQuery,
      service.from('support_feedback').select('status')
    ])

    if (error) throw error

    const statuses = statusRows ?? []
    return json({
      success: true,
      items: (data ?? []).map(rowToFeedback),
      total: count ?? 0,
      page: query.page,
      limit: query.limit,
      stats: {
        total: statuses.length,
        pending: statuses.filter((row) => row.status === 'pending').length,
        reviewing: statuses.filter((row) => row.status === 'reviewing').length,
        resolved: statuses.filter((row) => row.status === 'resolved').length,
        closed: statuses.filter((row) => row.status === 'closed').length
      },
      requestId
    })
  } catch (error) {
    return adminApiError(error, '无法加载用户反馈')
  }
}

export async function PATCH(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)
  try {
    const { user, service } = await requireAdminService(request)
    const body = FeedbackPatchSchema.parse(await request.json())

    const update: Record<string, unknown> = {}
    if (body.status) {
      update.status = body.status
      update.handled_by = user.id
      update.handled_at = new Date().toISOString()
    }
    if (body.adminNote !== undefined) update.admin_note = body.adminNote
    if (body.resolutionNote !== undefined) update.resolution_note = body.resolutionNote

    const { data, error } = await service
      .from('support_feedback')
      .update(update)
      .eq('id', body.id)
      .select('*')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return json({ success: false, code: 'NOT_FOUND', message: '反馈不存在。', requestId }, { status: 404 })
    }

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_feedback',
      resourceType: 'feedback',
      resourceId: body.id,
      requestId,
      result: 'success',
      changedFields: {
        status: body.status,
        adminNote: body.adminNote !== undefined ? 'updated' : undefined,
        resolutionNote: body.resolutionNote !== undefined ? 'updated' : undefined
      },
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })

    return json({ success: true, item: rowToFeedback(data), requestId })
  } catch (error) {
    return adminApiError(error, '无法更新用户反馈')
  }
}
