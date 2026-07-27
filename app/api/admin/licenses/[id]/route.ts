import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveLicenseStatus } from '@/lib/web-license/admin-license-data'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

const PatchSchema = z.object({
  status: z.enum(['unused', 'active', 'disabled', 'revoked']).optional(),
  plan: z.string().min(1).max(80).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  maxActivations: z.number().int().min(1).max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: '至少提供一个要更新的字段'
})

function licenseMutationError(error: unknown) {
  if (!(error instanceof Error)) return null
  const messages: Record<string, string> = {
    LICENSE_REVOKED: '已撤销的激活码不能重新启用或修改状态。',
    MAX_ACTIVATIONS_BELOW_USAGE: '最大激活次数不能小于已占用次数。',
    LICENSE_NOT_FOUND: '激活码不存在。'
  }
  const code = Object.keys(messages).find((item) => error.message.includes(item))
  if (!code) return null
  return json({ success: false, code, message: messages[code] }, { status: code === 'LICENSE_NOT_FOUND' ? 404 : 409 })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const { data, error } = await service
      .from('license_codes')
      .select(`
        id, code_prefix, plan, duration_days, max_activations, activation_count,
        status, expires_at, note, created_by, created_at, updated_at
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    const activationCount = data.activation_count || 0
    return json({
      success: true,
      license: {
        ...data,
        activation_count: activationCount,
        remaining_count: Math.max(0, data.max_activations - activationCount),
        status: getEffectiveLicenseStatus({ ...data, activation_count: activationCount })
      }
    })
  } catch (error) {
    return adminApiError(error, '无法加载激活码详情')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auditInfo = extractAuditInfo(request)
  try {
    const { service, user } = await requireAdminService(request)
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())
    const { error } = await service.rpc('admin_mutate_license', {
      p_license_id: id,
      p_status: body.status || null,
      p_plan: body.plan || null,
      p_duration_days: body.durationDays || null,
      p_max_activations: body.maxActivations || null,
      p_expires_at: body.expiresAt || null,
      p_set_expires_at: 'expiresAt' in body,
      p_note: body.note || null,
      p_set_note: 'note' in body
    })
    if (error) throw error

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: body.status === 'revoked' ? 'revoke_license' : 'update_license',
      resourceType: 'license',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      changedFields: body
    })

    // RPC 会返回数据库整行；写操作响应不得把内部字段转发给浏览器。
    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '更新参数无效' }, { status: 400 })
    }
    const businessError = licenseMutationError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法更新激活码')
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminService(request)
    return json({
      success: false,
      code: 'HARD_DELETE_DISABLED',
      message: '为保留绑定历史和审计记录，激活码不允许永久删除；请使用“撤销”。'
    }, { status: 405, headers: { Allow: 'GET, PATCH' } })
  } catch (error) {
    return adminApiError(error, '无法处理激活码')
  }
}
