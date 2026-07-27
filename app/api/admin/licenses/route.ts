import { z } from 'zod'
import { json } from '@/lib/http'
import { generateWebLicenseCode, getWebLicenseCodePrefix, hashWebLicenseCode } from '@/lib/web-license/codes'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { getEffectiveLicenseStatus } from '@/lib/web-license/admin-license-data'
import { toQueryParamNumber } from '@/lib/admin/number-utils'
import { logAdminAudit, extractAuditInfo } from '@/lib/admin/audit-log'

const CreateSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  plan: z.string().min(1).max(80).default('standard'),
  durationDays: z.number().int().min(1).max(3650).default(365),
  maxActivations: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().optional().nullable(),
  note: z.string().max(500).optional().nullable()
})

function sanitizeSearchInput(value: string): string {
  return value
    .replace(/[,()]/g, ' ')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

export async function GET(request: Request) {
  try {
    const { service } = await requireAdminService()
    const url = new URL(request.url)
    const page = Math.max(1, toQueryParamNumber(url.searchParams.get('page'), 1))
    const pageSize = Math.min(200, Math.max(1, toQueryParamNumber(url.searchParams.get('pageSize'), 50)))
    const search = sanitizeSearchInput(url.searchParams.get('search') || '')
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

    const licensesResult = await query
    if (licensesResult.error) throw licensesResult.error

    const normalized = (licensesResult.data || []).map((license) => {
      const activationCount = license.activation_count || 0
      const effectiveStatus = getEffectiveLicenseStatus({
        ...license,
        activation_count: activationCount
      })
      // 完整码只允许通过有审计的 reveal 端点读取。列表响应连末四位也不返回，
      // 避免 code_prefix 与末四位组合后显著缩小暴力枚举空间。
      const redacted = { ...license }
      Reflect.deleteProperty(redacted, 'code_value')
      return {
        ...redacted,
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
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)
  
  try {
    const { user, service } = await requireAdminService(request)
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

    // 记录审计日志
    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'create_license',
      resourceType: 'license',
      requestId,
      result: 'success',
      metadata: {
        count: body.count,
        plan: body.plan,
        durationDays: body.durationDays,
        maxActivations: body.maxActivations
      },
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })

    return json({
      success: true,
      codes: generated.map((item, index) => ({
        ...data?.[index],
        code: item.code
      })),
      requestId
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '生成参数无效', requestId }, { status: 400 })
    }
    
    // 记录失败审计日志
    try {
      const { user, service } = await requireAdminService()
      await logAdminAudit(service, {
        adminUserId: user.id,
        action: 'create_license',
        resourceType: 'license',
        requestId,
        result: 'failure',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        ipHash: auditInfo.ip,
        userAgentSummary: auditInfo.userAgent
      })
    } catch {
      // 审计日志写入失败不影响错误响应
    }
    
    return adminApiError(error, '无法生成激活码')
  }
}
