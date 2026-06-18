import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUserLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const PatchSchema = z.object({
  action: z.enum(['extend', 'revoke', 'restore']),
  days: z.number().int().min(1).max(3650).optional(),
  reason: z.string().max(500).optional()
})

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())
    const { data: activation, error: loadError } = await service
      .from('license_activations')
      .select('id, user_id, expires_at')
      .eq('id', id)
      .single()
    if (loadError) throw loadError

    if (body.action === 'extend') {
      const base = new Date(activation.expires_at).getTime() > Date.now() ? new Date(activation.expires_at) : new Date()
      const expiresAt = new Date(base.getTime() + (body.days || 30) * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await service
        .from('license_activations')
        .update({ expires_at: expiresAt, status: 'active', revoked_at: null, revoked_reason: null })
        .eq('id', id)
      if (error) throw error
    } else if (body.action === 'revoke') {
      const { error } = await service
        .from('license_activations')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: body.reason || '管理员撤销激活' })
        .eq('id', id)
      if (error) throw error
    } else {
      const { error } = await service
        .from('license_activations')
        .update({ status: 'active', revoked_at: null, revoked_reason: null })
        .eq('id', id)
      if (error) throw error
    }

    await refreshUserLicenseStatus(activation.user_id)
    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '操作参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法更新激活记录')
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const { data: activation, error: loadError } = await service
      .from('license_activations')
      .select('user_id, license_id')
      .eq('id', id)
      .single()
    if (loadError) throw loadError
    const { error } = await service.from('license_activations').delete().eq('id', id)
    if (error) throw error

    const { data: license, error: licenseError } = await service
      .from('license_codes')
      .select('activation_count, max_activations, status')
      .eq('id', activation.license_id)
      .single()
    if (licenseError) throw licenseError
    if (license.status !== 'revoked' && license.status !== 'disabled') {
      const count = Math.max(0, (license.activation_count || 0) - 1)
      const status = count === 0 ? 'unused' : count >= license.max_activations ? 'exhausted' : 'active'
      const { error: updateError } = await service
        .from('license_codes')
        .update({ activation_count: count, status })
        .eq('id', activation.license_id)
      if (updateError) throw updateError
    }

    await refreshUserLicenseStatus(activation.user_id)
    return json({ success: true })
  } catch (error) {
    return adminApiError(error, '无法解绑激活记录')
  }
}
