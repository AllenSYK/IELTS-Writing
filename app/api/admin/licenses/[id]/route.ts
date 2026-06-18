import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUsersLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const PatchSchema = z.object({
  status: z.enum(['unused', 'active', 'exhausted', 'disabled', 'expired', 'revoked']).optional(),
  plan: z.string().min(1).max(80).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  maxActivations: z.number().int().min(1).max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional()
})

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const { data, error } = await service
      .from('license_codes')
      .select(`
        id, code_value, code_prefix, plan, duration_days, max_activations, activation_count,
        status, expires_at, note, created_by, created_at, updated_at,
        license_activations (
          id, user_id, email, activated_at, expires_at, status, last_used_at, revoked_at, revoked_reason
        )
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return json({ success: true, license: data })
  } catch (error) {
    return adminApiError(error, '无法加载激活码详情')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const body = PatchSchema.parse(await request.json())
    const patch: Record<string, unknown> = {}
    if (body.status) patch.status = body.status
    if (body.plan) patch.plan = body.plan
    if (body.durationDays) patch.duration_days = body.durationDays
    if (body.maxActivations) patch.max_activations = body.maxActivations
    if ('expiresAt' in body) patch.expires_at = body.expiresAt || null
    if ('note' in body) patch.note = body.note?.trim() || null

    const { data: activations, error: activationError } = await service
      .from('license_activations')
      .select('user_id')
      .eq('license_id', id)
    if (activationError) throw activationError

    const { data, error } = await service.from('license_codes').update(patch).eq('id', id).select().single()
    if (error) throw error

    if (body.status === 'disabled') {
      await service.from('license_activations').update({ status: 'suspended' }).eq('license_id', id).eq('status', 'active')
    }
    if (body.status === 'revoked') {
      await service
        .from('license_activations')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: '激活码已被管理员撤销' })
        .eq('license_id', id)
        .in('status', ['active', 'suspended'])
    }
    if (body.status === 'active' || body.status === 'unused') {
      await service
        .from('license_activations')
        .update({ status: 'active', revoked_at: null, revoked_reason: null })
        .eq('license_id', id)
        .eq('status', 'suspended')
        .gt('expires_at', new Date().toISOString())
    }

    await refreshUsersLicenseStatus((activations || []).map((item) => item.user_id))
    return json({ success: true, license: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '更新参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法更新激活码')
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { service } = await requireAdminService()
    const { id } = await context.params
    const { data: activations, error: activationError } = await service.from('license_activations').select('user_id').eq('license_id', id)
    if (activationError) throw activationError
    const { error } = await service.from('license_codes').delete().eq('id', id)
    if (error) throw error
    await refreshUsersLicenseStatus((activations || []).map((item) => item.user_id))
    return json({ success: true })
  } catch (error) {
    return adminApiError(error, '无法删除激活码')
  }
}
