import { z } from 'zod'
import { json } from '@/lib/http'
import { hashWebLicenseCode } from '@/lib/web-license/codes'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

const PatchSchema = z.object({
  action: z.enum(['role', 'disable', 'enable', 'bind', 'reset-password']),
  role: z.enum(['user', 'admin']).optional(),
  licenseCode: z.string().min(8).max(80).optional(),
  confirmation: z.string().min(1).max(200).optional()
}).superRefine((value, context) => {
  if (value.action === 'role' && !value.role) {
    context.addIssue({ code: 'custom', path: ['role'], message: '角色不能为空' })
  }
  if (value.action === 'bind' && !value.licenseCode) {
    context.addIssue({ code: 'custom', path: ['licenseCode'], message: '激活码不能为空' })
  }
})

const DeleteSchema = z.object({
  confirmation: z.string().min(1).max(200),
  reason: z.string().max(500).optional()
})

type AdminService = Awaited<ReturnType<typeof requireAdminService>>['service']

async function loadTargetUser(service: AdminService, id: string) {
  const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    service.auth.admin.getUserById(id),
    service
      .from('profiles')
      .select('id, email, phone, role, license_status, license_expires_at, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()
  ])
  if (authError) throw authError
  if (profileError) throw profileError
  if (!authData.user || !profile) {
    throw new Error('USER_NOT_FOUND')
  }

  const accountLabel = authData.user.email || authData.user.phone || profile.email || profile.phone || id
  return { authUser: authData.user, profile, accountLabel }
}

function requireTypedConfirmation(actual: string | undefined, expected: string) {
  if (actual?.trim() !== expected) {
    throw new Error('CONFIRMATION_MISMATCH')
  }
}

function userBusinessError(error: unknown) {
  if (!(error instanceof Error)) return null
  const messages: Record<string, string> = {
    USER_NOT_FOUND: '用户不存在。',
    CONFIRMATION_MISMATCH: '确认文字与目标账号不一致。',
    CANNOT_CHANGE_SELF: '不能降低或禁用当前登录的管理员账号。',
    LAST_ADMIN_PROTECTED: '系统必须至少保留一位可用管理员。',
    ACTOR_NOT_ADMIN: '当前账号已不再是管理员，请重新登录。',
    ADMIN_ROLE_PROTECTED: '请先取消管理员角色，再禁用或删除该账号。',
    ADMIN_LICENSE_NOT_ALLOWED: '管理员账号不使用普通激活码。',
    ACCOUNT_DISABLED: '该账号已禁用，请先启用账号。',
    ACCOUNT_DELETED: '已删除账号不能再修改。'
  }
  const code = Object.keys(messages).find((item) => error.message.includes(item))
  if (!code) return null
  return json(
    { success: false, code, message: messages[code] },
    { status: code === 'USER_NOT_FOUND' ? 404 : 409 }
  )
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const [{ authUser, profile }, { data: activations, error: activationError }] = await Promise.all([
      loadTargetUser(service, id),
      service
        .from('license_activations')
        .select('id, email, activated_at, expires_at, status, last_used_at, license_codes(id, code_prefix, plan, status)')
        .eq('user_id', id)
        .order('activated_at', { ascending: false })
    ])
    if (activationError) throw activationError
    return json({ success: true, user: authUser, profile, activations: activations || [] })
  } catch (error) {
    const businessError = userBusinessError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法加载用户详情')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auditInfo = extractAuditInfo(request)
  try {
    const { service, user } = await requireAdminService(request)
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())

    if (body.action === 'reset-password') {
      const { authUser } = await loadTargetUser(service, id)
      if (!authUser.email) {
        return json({ success: false, code: 'EMAIL_REQUIRED', message: '该用户没有可用邮箱' }, { status: 400 })
      }
      const redirectTo = `${new URL(request.url).origin}/reset-password`
      const { error } = await service.auth.resetPasswordForEmail(authUser.email, { redirectTo })
      if (error) throw error
    } else if (body.action === 'role') {
      const target = await loadTargetUser(service, id)
      requireTypedConfirmation(body.confirmation, target.accountLabel)
      const { error } = await service.rpc('admin_set_user_role', {
        p_actor_user_id: user.id,
        p_user_id: id,
        p_role: body.role
      })
      if (error) throw error
    } else if (body.action === 'disable' || body.action === 'enable') {
      const target = await loadTargetUser(service, id)
      if (body.action === 'disable') {
        requireTypedConfirmation(body.confirmation, target.accountLabel)
        if (id === user.id) throw new Error('CANNOT_CHANGE_SELF')
        if (target.profile.role === 'admin') throw new Error('ADMIN_ROLE_PROTECTED')
      }

      // The RPC updates auth.users and public license state in one transaction.
      const { error: accessError } = await service.rpc('admin_set_user_access', {
        p_user_id: id,
        p_action: body.action
      })
      if (accessError) throw accessError
    } else if (body.action === 'bind') {
      const { authUser, profile } = await loadTargetUser(service, id)
      if (profile.role === 'admin') throw new Error('ADMIN_LICENSE_NOT_ALLOWED')
      const account = authUser.email || authUser.phone || authUser.id
      const { data, error } = await service.rpc('activate_license_code', {
        p_code_hash: hashWebLicenseCode(body.licenseCode || ''),
        p_user_id: id,
        p_email: account
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.success) {
        return json({
          success: false,
          code: result?.error_code || 'ACTIVATION_FAILED',
          message: result?.message || '绑定失败'
        }, { status: 409 })
      }
    }

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_user',
      resourceType: 'user',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      changedFields: { action: body.action, role: body.role }
    })

    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '用户操作参数无效' }, { status: 400 })
    }
    const businessError = userBusinessError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法更新用户')
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auditInfo = extractAuditInfo(request)
  try {
    const { service, user } = await requireAdminService(request)
    const { id } = await context.params
    const body = DeleteSchema.parse(await request.json())
    const target = await loadTargetUser(service, id)

    requireTypedConfirmation(body.confirmation, target.accountLabel)
    if (id === user.id) throw new Error('CANNOT_CHANGE_SELF')
    if (target.profile.role === 'admin') throw new Error('ADMIN_ROLE_PROTECTED')

    // Preparation atomically bans the Auth account and freezes public access.
    const { error: prepareError } = await service.rpc('admin_prepare_user_deletion', {
      p_user_id: id
    })
    if (prepareError) throw prepareError

    // Keep the Auth identity as a Supabase soft deletion so foreign-key-backed
    // business records, binding history, and audit history are not cascaded.
    const { error: deleteError } = await service.auth.admin.deleteUser(id, true)
    if (deleteError) {
      await logAdminAudit(service, {
        adminUserId: user.id,
        action: 'delete_user',
        resourceType: 'user',
        resourceId: id,
        requestId: auditInfo.requestId,
        result: 'partial',
        errorMessage: deleteError.message,
        ipHash: auditInfo.ip,
        userAgentSummary: auditInfo.userAgent
      })
      throw deleteError
    }

    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'delete_user',
      resourceType: 'user',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      metadata: { mode: 'soft-delete', reasonProvided: Boolean(body.reason?.trim()) }
    })
    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '删除确认参数无效' }, { status: 400 })
    }
    const businessError = userBusinessError(error)
    if (businessError) return businessError
    return adminApiError(error, '无法删除用户')
  }
}
