import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, refreshUserLicenseStatus, requireAdminService } from '@/lib/web-license/admin-api'

const RevokeSchema = z.object({
  activationId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
  unbind: z.boolean().default(false)
})

export async function POST(request: Request) {
  try {
    const { service } = await requireAdminService()
    const body = RevokeSchema.parse(await request.json())
    const { data: activation, error: loadError } = await service
      .from('license_activations')
      .select('id, user_id, license_id, status')
      .eq('id', body.activationId)
      .single()
    if (loadError) throw loadError

    if (body.unbind) {
      const { error } = await service.from('license_activations').delete().eq('id', body.activationId)
      if (error) throw error

      const { data: license, error: licenseError } = await service
        .from('license_codes')
        .select('activation_count, max_activations')
        .eq('id', activation.license_id)
        .single()
      if (licenseError) throw licenseError

      const nextCount = Math.max(0, (license.activation_count || 0) - 1)
      await service
        .from('license_codes')
        .update({
          activation_count: nextCount,
          status: nextCount === 0 ? 'unused' : nextCount >= license.max_activations ? 'exhausted' : 'active'
        })
        .eq('id', activation.license_id)
    } else {
      const { error } = await service
        .from('license_activations')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revoked_reason: body.reason || '管理员撤销'
        })
        .eq('id', body.activationId)
      if (error) throw error
    }

    await refreshUserLicenseStatus(activation.user_id)
    return json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '撤销参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法撤销激活')
  }
}
