import type { User } from '@supabase/supabase-js'
import { cache } from 'react'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'

export { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'

type MinimalUser = Pick<User, 'id'> & { email?: string | null; phone?: string | null }

export type WebProfile = {
  id: string
  email: string | null
  phone: string | null
  role: string
  license_status: string
  license_expires_at: string | null
  display_name: string | null
}

export type WebLicenseCheck =
  | {
      ok: true
      user: MinimalUser
      profile: WebProfile
      activation: {
        id: string
        license_id: string
        user_id: string
        email: string
        activated_at: string
        expires_at: string
        status: string
        last_used_at: string | null
      }
      license: {
        id: string
        plan: string
        status: string
      }
    }
  | {
      ok: false
      status: number
      code: string
      message: string
      user?: MinimalUser
    }

export const getCurrentSupabaseUser = cache(async function getCurrentSupabaseUser(): Promise<MinimalUser | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === 'string' ? data.claims.email : null,
    phone: typeof data.claims.phone === 'string' ? data.claims.phone : null
  }
})

export const getWebProfile = cache(async function getWebProfile(userId: string) {
  const service = createSupabaseServiceRoleClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, email, phone, role, license_status, license_expires_at, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return profile as WebProfile | null
})

export async function requireWebAdmin(request?: Request) {
  if (request) assertTrustedAdminMutationRequest(request)

  const user = await getCurrentSupabaseUser()
  if (!user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const profile = await getWebProfile(user.id)
  if (profile?.role !== 'admin') {
    throw new Response('Forbidden', { status: 403 })
  }

  const service = createSupabaseServiceRoleClient()
  return { user, service, profile }
}

export async function requireActiveWebLicense(): Promise<WebLicenseCheck> {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'NOT_AUTHENTICATED',
      message: '请先登录'
    }
  }

  return checkActiveWebLicenseForUser(user)
}

export const checkActiveWebLicenseForUser = cache(async function checkActiveWebLicenseForUser(user: MinimalUser): Promise<WebLicenseCheck> {
  const service = createSupabaseServiceRoleClient()
  const nowIso = new Date().toISOString()

  const [, profile, activationResult] = await Promise.all([
    service
      .from('license_activations')
      .update({ status: 'expired' })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('expires_at', nowIso),
    getWebProfile(user.id),
    service
      .from('license_activations')
      .select('id, license_id, user_id, email, activated_at, expires_at, status, last_used_at, license_codes(id, plan, status)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  const profileActive =
    profile?.license_status === 'active' &&
    profile.license_expires_at &&
    new Date(profile.license_expires_at).getTime() > Date.now()

  if (!profileActive) {
    return {
      ok: false,
      status: 403,
      code: 'LICENSE_REQUIRED',
      message: '请先激活账号后再使用批改功能',
      user
    }
  }

  const { data: activation, error: activationError } = activationResult
  if (activationError) throw activationError
  const license = Array.isArray(activation?.license_codes)
    ? activation?.license_codes[0]
    : activation?.license_codes

  if (!activation || !license || license.status === 'disabled' || license.status === 'expired') {
    // 鉴权路径不更新 profiles，只返回状态
    // profiles.license_status 应由激活、撤销、延期等明确操作更新
    return {
      ok: false,
      status: 403,
      code: 'LICENSE_REQUIRED',
      message: '请先激活账号后再使用批改功能',
      user
    }
  }

  return {
    ok: true,
    user,
    profile: profile as WebProfile,
    activation: {
      id: activation.id,
      license_id: activation.license_id,
      user_id: activation.user_id,
      email: activation.email,
      activated_at: activation.activated_at,
      expires_at: activation.expires_at,
      status: activation.status,
      last_used_at: activation.last_used_at
    },
    license: {
      id: license.id,
      plan: license.plan,
      status: license.status
    }
  }
})
