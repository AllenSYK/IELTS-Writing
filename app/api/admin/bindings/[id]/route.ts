import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveBindingStatus } from '@/lib/web-license/admin-license-data'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

const PatchSchema = z.object({
  action: z.enum(['extend', 'revoke', 'rebind']),
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().max(500).optional()
})

function bindingMutationError(error: unknown) {
  if (!(error instanceof Error)) return null
  const messages: Record<string, string> = {
    BINDING_NOT_FOUND: '邮箱绑定记录不存在。',
    LICENSE_NOT_FOUND: '对应激活码不存在。',
    LICENSE_UNAVAILABLE: '该激活码当前不可用于续期或重新绑定。',
    BINDING_UNBOUND: '请先重新绑定，再延长有效期。',
    ACCOUNT_DISABLED: '该账号已禁用，请先在用户管理中启用账号。',
    ACCOUNT_DELETED: '已删除账号的绑定历史不可修改。',
    USER_ALREADY_ACTIVE: '该用户已有其他有效激活码。',
    LICENSE_EXHAUSTED: '该激活码已无剩余次数。'
  }
  const code = Object.keys(messages).find((item) => error.message.includes(item))
  if (!code) return null
  return json(
    { success: false, code, message: messages[code] },
    { status: code.endsWith('NOT_FOUND') ? 404 : 409 }
  )
}

async function loadBinding(service: Awaited<ReturnType<typeof requireAdminService>>['service'], id: string) {
  const { data: binding, error } = await service
    .from('license_activations')
    .select(`
      id,
      license_id,
      user_id,
      email,
      activated_at,
      expires_at,
      status,
      last_used_at,
      revoked_at,
      revoked_reason,
      license_codes (
        id,
        code_prefix,
        plan,
        status,
        expires_at,
        duration_days,
        max_activations,
        activation_count
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, email, role')
    .eq('id', binding.user_id)
    .maybeSingle()
  if (profileError) throw profileError

  return {
    ...binding,
    license_codes: Array.isArray(binding.license_codes) ? binding.license_codes[0] : binding.license_codes,
    binding_status: getEffectiveBindingStatus({
      ...binding,
      license_status: (Array.isArray(binding.license_codes) ? binding.license_codes[0] : binding.license_codes)?.status,
      license_expires_at: (Array.isArray(binding.license_codes) ? binding.license_codes[0] : binding.license_codes)?.expires_at
    }),
    user_role: profile?.role || 'user'
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    return json({ success: true, binding: await loadBinding(service, id) })
  } catch (error) {
    return adminApiError(error, '无法加载邮箱绑定详情')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auditInfo = extractAuditInfo(request)
  try {
    const { service, user } = await requireAdminService(request)
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())
    const { error } = await service.rpc('admin_mutate_binding', {
      p_binding_id: id,
      p_action: body.action,
      p_days: body.action === 'extend' ? body.days || 30 : null,
      p_reason: body.reason || null
    })
    if (error) throw error

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_binding',
      resourceType: 'binding',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      changedFields: { action: body.action, days: body.days }
    })

    return json({ success: true, binding: await loadBinding(service, id) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '操作参数无效' }, { status: 400 })
    }
    const businessError = bindingMutationError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法更新邮箱绑定')
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auditInfo = extractAuditInfo(request)
  try {
    const { service, user } = await requireAdminService(request)
    const { id } = await context.params
    const { error } = await service.rpc('admin_mutate_binding', {
      p_binding_id: id,
      p_action: 'unbind',
      p_days: null,
      p_reason: null
    })
    if (error) throw error

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_binding',
      resourceType: 'binding',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      changedFields: { action: 'unbind' }
    })

    return json({ success: true, binding: await loadBinding(service, id) })
  } catch (error) {
    const businessError = bindingMutationError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法解绑邮箱')
  }
}
