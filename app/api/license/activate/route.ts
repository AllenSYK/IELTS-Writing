import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getWebLicenseCodePrefix, hashWebLicenseCode, normalizeWebLicenseCode } from '@/lib/web-license/codes'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'

const ActivateSchema = z.object({
  code: z.string().min(6).max(80)
})

const failureMessages: Record<string, string> = {
  NOT_AUTHENTICATED: '请先登录',
  LICENSE_INVALID: '激活码无效',
  LICENSE_DISABLED: '激活码已禁用',
  LICENSE_EXPIRED: '激活码已过期',
  LICENSE_REVOKED: '激活码已撤销',
  LICENSE_ALREADY_USED: '激活码已绑定其他账号',
  LICENSE_EXHAUSTED: '激活码可用次数已用完',
  USER_ALREADY_ACTIVE: '当前账号已有有效激活记录',
  INTERNAL_ERROR: '激活失败，请稍后重试'
}

export async function POST(request: Request) {
  let licenseCodePrefix: string | null = null

  try {
    const user = await getCurrentSupabaseUser()
    if (!user) {
      return json({ success: false, code: 'NOT_AUTHENTICATED', message: failureMessages.NOT_AUTHENTICATED }, { status: 401 })
    }
    const body = ActivateSchema.parse(await request.json())
    const normalized = normalizeWebLicenseCode(body.code)
    licenseCodePrefix = getWebLicenseCodePrefix(normalized)
    const service = createSupabaseServiceRoleClient()
    const { data, error } = await service.rpc('activate_license_code', {
      p_code_hash: hashWebLicenseCode(normalized),
      p_user_id: user.id,
      p_email: user.email || user.phone || user.id
    })

    const result = Array.isArray(data) ? data[0] : data
    const errorCode = result?.error_code || null

    if (error) {
      console.error('[license-activate] RPC error', {
        code: error.code,
        errorCode,
        licenseCodePrefix
      })
      return json({ success: false, code: 'INTERNAL_ERROR', message: failureMessages.INTERNAL_ERROR }, { status: 500 })
    }

    if (!result?.success) {
      const code = result?.error_code || 'LICENSE_INVALID'
      const message = result?.message || failureMessages[code] || failureMessages.LICENSE_INVALID
      const status = code === 'USER_ALREADY_ACTIVE' ? 409 : code === 'INTERNAL_ERROR' ? 500 : 400
      return json({ success: false, code, message }, { status })
    }

    return json({
      success: true,
      expiresAt: result.expires_at,
      plan: result.plan
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'LICENSE_INVALID', message: '请输入有效激活码' }, { status: 400 })
    }
    console.error('[license-activate] request failed', {
      error: error instanceof Error ? error.message : 'unknown',
      licenseCodePrefix
    })
    return json({ success: false, code: 'INTERNAL_ERROR', message: failureMessages.INTERNAL_ERROR }, { status: 500 })
  }
}
