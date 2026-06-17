import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUsersLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['unused', 'active', 'exhausted', 'disabled', 'expired']).optional(),
  plan: z.string().min(1).max(80).optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  maxActivations: z.number().int().min(1).max(100).optional(),
  expiresAt: z.string().datetime().nullable().optional()
})

export async function POST(request: Request) {
  try {
    const { service } = await requireAdminService()
    const body = UpdateSchema.parse(await request.json())
    const patch: Record<string, unknown> = {}
    if (body.status) patch.status = body.status
    if (body.plan) patch.plan = body.plan
    if (body.durationDays) patch.duration_days = body.durationDays
    if (body.maxActivations) patch.max_activations = body.maxActivations
    if ('expiresAt' in body) patch.expires_at = body.expiresAt || null

    const { data: activations, error: activationError } = await service
      .from('license_activations')
      .select('id, user_id')
      .eq('license_id', body.id)

    if (activationError) throw activationError

    const { data, error } = await service
      .from('license_codes')
      .update(patch)
      .eq('id', body.id)
      .select()
      .single()

    if (error) throw error

    if (body.status === 'disabled') {
      await service
        .from('license_activations')
        .update({ status: 'suspended' })
        .eq('license_id', body.id)
        .eq('status', 'active')
    } else if (body.status === 'active' || body.status === 'unused') {
      await service
        .from('license_activations')
        .update({ status: 'active', revoked_at: null, revoked_reason: null })
        .eq('license_id', body.id)
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
