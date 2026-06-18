import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUserLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'
import {
  getEffectiveBindingStatus,
  syncLicenseActivationCount,
  UNBOUND_BINDING_REASON
} from '@/lib/web-license/admin-license-data'

const PatchSchema = z.object({
  action: z.enum(['extend', 'revoke', 'rebind', 'restore']),
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().max(500).optional()
})

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
        code_value,
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
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())
    const binding = await loadBinding(service, id)
    const license = binding.license_codes
    if (!license) {
      return json({ success: false, code: 'LICENSE_NOT_FOUND', message: '对应激活码不存在' }, { status: 404 })
    }

    if (body.action === 'extend') {
      if (binding.binding_status === 'unbound' || binding.binding_status === 'revoked') {
        return json({ success: false, code: 'BINDING_INACTIVE', message: '请先重新绑定，再延长有效期' }, { status: 409 })
      }
      if (['disabled', 'revoked', 'expired'].includes(license.status)) {
        return json({ success: false, code: 'LICENSE_UNAVAILABLE', message: '该激活码当前不可延长邮箱权限' }, { status: 409 })
      }
      if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
        return json({ success: false, code: 'LICENSE_EXPIRED', message: '该激活码整体有效期已结束' }, { status: 409 })
      }
      const base = new Date(binding.expires_at).getTime() > Date.now() ? new Date(binding.expires_at) : new Date()
      const expiresAt = new Date(base.getTime() + (body.days || 30) * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await service
        .from('license_activations')
        .update({ expires_at: expiresAt, status: 'active', revoked_at: null, revoked_reason: null })
        .eq('id', id)
      if (error) throw error
    } else if (body.action === 'revoke') {
      const { error } = await service
        .from('license_activations')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_reason: body.reason || '管理员撤销邮箱权限'
        })
        .eq('id', id)
      if (error) throw error
    } else {
      if (['disabled', 'revoked', 'expired'].includes(license.status)) {
        return json({ success: false, code: 'LICENSE_UNAVAILABLE', message: '该激活码当前不可重新绑定' }, { status: 409 })
      }
      if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
        return json({ success: false, code: 'LICENSE_EXPIRED', message: '该激活码整体有效期已结束' }, { status: 409 })
      }

      const { data: otherActive, error: activeError } = await service
        .from('license_activations')
        .select('id')
        .eq('user_id', binding.user_id)
        .eq('status', 'active')
        .neq('id', id)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle()
      if (activeError) throw activeError
      if (otherActive) {
        return json({ success: false, code: 'USER_ALREADY_ACTIVE', message: '该邮箱已有其他有效激活码' }, { status: 409 })
      }

      if (binding.binding_status === 'unbound') {
        const count = await syncLicenseActivationCount(service, license.id)
        if (count.activationCount >= license.max_activations) {
          return json({ success: false, code: 'LICENSE_EXHAUSTED', message: '该激活码已无剩余次数' }, { status: 409 })
        }
      }

      const expiresAt = new Date(Date.now() + license.duration_days * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await service
        .from('license_activations')
        .update({
          activated_at: new Date().toISOString(),
          expires_at: expiresAt,
          status: 'active',
          revoked_at: null,
          revoked_reason: null
        })
        .eq('id', id)
      if (error) throw error
    }

    await syncLicenseActivationCount(service, binding.license_id)
    await refreshUserLicenseStatus(binding.user_id)
    return json({ success: true, binding: await loadBinding(service, id) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '操作参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法更新邮箱绑定')
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const binding = await loadBinding(service, id)

    if (binding.binding_status !== 'unbound') {
      const { error } = await service
        .from('license_activations')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_reason: UNBOUND_BINDING_REASON
        })
        .eq('id', id)
      if (error) throw error
    }

    await syncLicenseActivationCount(service, binding.license_id)
    await refreshUserLicenseStatus(binding.user_id)
    return json({ success: true, binding: await loadBinding(service, id) })
  } catch (error) {
    return adminApiError(error, '无法解绑邮箱')
  }
}
