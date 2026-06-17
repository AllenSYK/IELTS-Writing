import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireWebAdmin } from './auth'

export async function requireAdminService() {
  const { user, profile } = await requireWebAdmin()
  const service = createSupabaseServiceRoleClient()
  return { user, profile, service }
}

export function adminApiError(error: unknown, fallback: string) {
  if (error instanceof Response) {
    const status = error.status
    return json(
      {
        success: false,
        code: status === 401 ? 'NOT_AUTHENTICATED' : 'FORBIDDEN',
        message: status === 401 ? '请先登录管理员账号' : '无权访问管理员功能'
      },
      { status }
    )
  }
  if (error instanceof Error) {
    console.error('[admin-api]', error.name, error.message)
  } else {
    console.error('[admin-api]', error)
  }
  return json({ success: false, code: 'INTERNAL_ERROR', message: fallback }, { status: 500 })
}

export async function refreshUserLicenseStatus(userId: string) {
  const service = createSupabaseServiceRoleClient()
  const nowIso = new Date().toISOString()

  await service
    .from('license_activations')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('expires_at', nowIso)

  const { data: activation, error } = await service
    .from('license_activations')
    .select('expires_at, status, license_codes(status)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const license = Array.isArray(activation?.license_codes)
    ? activation?.license_codes[0]
    : activation?.license_codes

  if (activation && license?.status !== 'disabled' && license?.status !== 'expired') {
    await service
      .from('profiles')
      .update({ license_status: 'active', license_expires_at: activation.expires_at })
      .eq('id', userId)
    return
  }

  const { data: suspended } = await service
    .from('license_activations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'suspended')
    .limit(1)
    .maybeSingle()

  await service
    .from('profiles')
    .update({
      license_status: suspended ? 'suspended' : 'inactive',
      license_expires_at: null
    })
    .eq('id', userId)
}

export async function refreshUsersLicenseStatus(userIds: string[]) {
  await Promise.all([...new Set(userIds)].filter(Boolean).map((id) => refreshUserLicenseStatus(id)))
}
