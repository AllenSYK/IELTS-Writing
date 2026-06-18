import { z } from 'zod'
import { json } from '@/lib/http'
import { hashWebLicenseCode } from '@/lib/web-license/codes'
import { adminApiError, refreshUserLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const PatchSchema = z.object({
  action: z.enum(['role', 'disable', 'enable', 'bind', 'extend', 'revoke', 'unbind', 'reset-password']),
  role: z.enum(['user', 'admin']).optional(),
  licenseCode: z.string().min(8).max(80).optional(),
  activationId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(3650).optional()
})

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const [{ data: authData, error: authError }, { data: profile, error: profileError }, { data: activations, error: activationError }] = await Promise.all([
      service.auth.admin.getUserById(id),
      service.from('profiles').select('id, email, role, license_status, license_expires_at, created_at, updated_at').eq('id', id).single(),
      service
        .from('license_activations')
        .select('id, email, activated_at, expires_at, status, last_used_at, license_codes(id, code_value, code_prefix, plan, status)')
        .eq('user_id', id)
        .order('activated_at', { ascending: false })
    ])
    if (authError) throw authError
    if (profileError) throw profileError
    if (activationError) throw activationError
    return json({ success: true, user: authData.user, profile, activations: activations || [] })
  } catch (error) {
    return adminApiError(error, '无法加载用户详情')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())

    if (body.action === 'reset-password') {
      const { data: authData, error: userError } = await service.auth.admin.getUserById(id)
      if (userError) throw userError
      if (!authData.user.email) {
        return json({ success: false, code: 'EMAIL_REQUIRED', message: '该用户没有可用邮箱' }, { status: 400 })
      }
      const redirectTo = `${new URL(request.url).origin}/reset-password`
      const { error } = await service.auth.resetPasswordForEmail(authData.user.email, { redirectTo })
      if (error) throw error
    } else if (body.action === 'role') {
      const { error } = await service.from('profiles').update({ role: body.role || 'user' }).eq('id', id)
      if (error) throw error
    } else if (body.action === 'disable' || body.action === 'enable') {
      const { error } = await service.auth.admin.updateUserById(id, {
        ban_duration: body.action === 'disable' ? '876000h' : 'none'
      })
      if (error) throw error
      if (body.action === 'disable') {
        const { error: activationError } = await service
          .from('license_activations')
          .update({ status: 'suspended', revoked_reason: 'ACCOUNT_DISABLED' })
          .eq('user_id', id)
          .eq('status', 'active')
        if (activationError) throw activationError
      } else {
        const { error: activationError } = await service
          .from('license_activations')
          .update({ status: 'active', revoked_reason: null })
          .eq('user_id', id)
          .eq('status', 'suspended')
          .eq('revoked_reason', 'ACCOUNT_DISABLED')
          .gt('expires_at', new Date().toISOString())
        if (activationError) throw activationError
      }
    } else if (body.action === 'bind') {
      const { data: authData, error: userError } = await service.auth.admin.getUserById(id)
      if (userError) throw userError
      const email = authData.user.email
      if (!email || !body.licenseCode) {
        return json({ success: false, code: 'INVALID_INPUT', message: '用户邮箱或激活码缺失' }, { status: 400 })
      }
      const { data, error } = await service.rpc('activate_license_code', {
        p_code_hash: hashWebLicenseCode(body.licenseCode),
        p_user_id: id,
        p_email: email
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.success) {
        return json({ success: false, code: result?.error_code || 'ACTIVATION_FAILED', message: result?.message || '绑定失败' }, { status: 409 })
      }
    } else {
      const activationId = body.activationId
      if (!activationId) {
        return json({ success: false, code: 'INVALID_INPUT', message: '缺少激活记录 ID' }, { status: 400 })
      }
      if (body.action === 'extend') {
        const { data: activation, error: loadError } = await service
          .from('license_activations')
          .select('expires_at')
          .eq('id', activationId)
          .eq('user_id', id)
          .single()
        if (loadError) throw loadError
        const base = new Date(activation.expires_at).getTime() > Date.now() ? new Date(activation.expires_at) : new Date()
        const expiresAt = new Date(base.getTime() + (body.days || 30) * 24 * 60 * 60 * 1000).toISOString()
        const { error } = await service
          .from('license_activations')
          .update({ expires_at: expiresAt, status: 'active', revoked_at: null, revoked_reason: null })
          .eq('id', activationId)
        if (error) throw error
      } else if (body.action === 'revoke') {
        const { error } = await service
          .from('license_activations')
          .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: '管理员从用户详情撤销' })
          .eq('id', activationId)
        if (error) throw error
      } else if (body.action === 'unbind') {
        const { data: activation, error: loadError } = await service
          .from('license_activations')
          .select('license_id')
          .eq('id', activationId)
          .eq('user_id', id)
          .single()
        if (loadError) throw loadError
        const { error } = await service.from('license_activations').delete().eq('id', activationId)
        if (error) throw error
        const { data: license, error: licenseError } = await service
          .from('license_codes')
          .select('activation_count, max_activations, status')
          .eq('id', activation.license_id)
          .single()
        if (licenseError) throw licenseError
        if (!['revoked', 'disabled'].includes(license.status)) {
          const count = Math.max(0, (license.activation_count || 0) - 1)
          const status = count === 0 ? 'unused' : count >= license.max_activations ? 'exhausted' : 'active'
          await service.from('license_codes').update({ activation_count: count, status }).eq('id', activation.license_id)
        }
      }
    }

    await refreshUserLicenseStatus(id)
    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '用户操作参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法更新用户')
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service, user } = await requireAdminService()
    const { id } = await context.params
    if (id === user.id) {
      return json({ success: false, code: 'CANNOT_DELETE_SELF', message: '不能删除当前登录的管理员账号' }, { status: 400 })
    }
    const { error } = await service.auth.admin.deleteUser(id)
    if (error) throw error
    return json({ success: true })
  } catch (error) {
    return adminApiError(error, '无法删除用户')
  }
}
