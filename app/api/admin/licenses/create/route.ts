import { z } from 'zod'
import { json } from '@/lib/http'
import { generateWebLicenseCode, getWebLicenseCodePrefix, hashWebLicenseCode } from '@/lib/web-license/codes'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

const CreateSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  plan: z.string().min(1).max(80).default('standard'),
  durationDays: z.number().int().min(1).max(3650).default(365),
  maxActivations: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().optional().nullable(),
  note: z.string().max(500).optional().nullable()
})

export async function POST(request: Request) {
  try {
    const { user, service } = await requireAdminService()
    const body = CreateSchema.parse(await request.json())
    const generated = Array.from({ length: body.count }, () => {
      const code = generateWebLicenseCode()
      return {
        code,
        row: {
          code_hash: hashWebLicenseCode(code),
          code_value: code,
          code_prefix: getWebLicenseCodePrefix(code),
          plan: body.plan,
          duration_days: body.durationDays,
          max_activations: body.maxActivations,
          status: 'unused',
          expires_at: body.expiresAt || null,
          note: body.note?.trim() || null,
          created_by: user.id
        }
      }
    })

    const { data, error } = await service
      .from('license_codes')
      .insert(generated.map((item) => item.row))
      .select('id, code_prefix, plan, duration_days, max_activations, status, expires_at, note, created_at')

    if (error) throw error

    return json({
      success: true,
      codes: generated.map((item, index) => ({
        ...data?.[index],
        code: item.code
      }))
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '生成参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法生成激活码')
  }
}
