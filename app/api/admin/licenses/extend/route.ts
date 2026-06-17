import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUserLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const ExtendSchema = z.object({
  activationId: z.string().uuid(),
  days: z.number().int().min(1).max(3650).optional(),
  expiresAt: z.string().datetime().optional()
}).refine((value) => value.days || value.expiresAt, {
  message: 'days or expiresAt is required'
})

export async function POST(request: Request) {
  try {
    const { service } = await requireAdminService()
    const body = ExtendSchema.parse(await request.json())
    const { data: activation, error: loadError } = await service
      .from('license_activations')
      .select('id, user_id, expires_at')
      .eq('id', body.activationId)
      .single()
    if (loadError) throw loadError

    const base = new Date(activation.expires_at).getTime() > Date.now()
      ? new Date(activation.expires_at)
      : new Date()
    const nextExpiresAt = body.expiresAt
      ? body.expiresAt
      : new Date(base.getTime() + (body.days || 0) * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await service
      .from('license_activations')
      .update({ expires_at: nextExpiresAt, status: 'active', revoked_at: null, revoked_reason: null })
      .eq('id', body.activationId)
    if (error) throw error

    await refreshUserLicenseStatus(activation.user_id)
    return json({ success: true, expiresAt: nextExpiresAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '续期参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法延长有效期')
  }
}
