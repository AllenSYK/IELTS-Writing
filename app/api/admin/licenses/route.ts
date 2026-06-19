import { z } from 'zod'
import { json } from '@/lib/http'
import { generateWebLicenseCode, getWebLicenseCodePrefix, hashWebLicenseCode } from '@/lib/web-license/codes'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import {
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '@/lib/web-license/admin-license-data'

const CreateSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  plan: z.string().min(1).max(80).default('standard'),
  durationDays: z.number().int().min(1).max(3650).default(365),
  maxActivations: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().optional().nullable(),
  note: z.string().max(500).optional().nullable()
})

function toNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, toNumber(url.searchParams.get('pageSize'), 50)))
    const search = (url.searchParams.get('search')?.trim() || '').replace(/[,()]/g, ' ')
    const status = url.searchParams.get('status')?.trim() || 'all'
    const plan = url.searchParams.get('plan')?.trim() || 'all'
    const licenseId = url.searchParams.get('licenseId')?.trim() || ''

    let query = service
      .from('license_codes')
      .select(`
        id,
        code_value,
        code_prefix,
        plan,
        duration_days,
        max_activations,
        activation_count,
        status,
        expires_at,
        note,
        created_by,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (licenseId) query = query.eq('id', licenseId)
    if (plan !== 'all') query = query.eq('plan', plan)
    if (search) {
      query = query.or(`code_prefix.ilike.%${search}%,code_value.ilike.%${search}%,plan.ilike.%${search}%,note.ilike.%${search}%`)
    }

    const [licensesResult, activationsResult] = await Promise.all([
      query,
      service
        .from('license_activations')
        .select('license_id, revoked_reason')
        .limit(1000)
    ])

    if (licensesResult.error) throw licensesResult.error
    if (activationsResult.error) throw activationsResult.error

    const usageByLicense = new Map<string, number>()
    for (const binding of activationsResult.data || []) {
      if (binding.revoked_reason === UNBOUND_BINDING_REASON) continue
      usageByLicense.set(binding.license_id, (usageByLicense.get(binding.license_id) || 0) + 1)
    }

    const normalized = (licensesResult.data || []).map((license) => {
      const activationCount = usageByLicense.get(license.id) || 0
      const effectiveStatus = getEffectiveLicenseStatus({
        ...license,
        activation_count: activationCount
      })
      return {
        ...license,
        activation_count: activationCount,
        remaining_count: Math.max(0, license.max_activations - activationCount),
        status: effectiveStatus
      }
    })

    const filtered = status === 'all'
      ? normalized
      : normalized.filter((license) => license.status === status)
    const offset = (page - 1) * pageSize

    return json({
      success: true,
      licenses: filtered.slice(offset, offset + pageSize),
      total: filtered.length
    })
  } catch (error) {
    return adminApiError(error, '无法加载激活码')
  }
}

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
