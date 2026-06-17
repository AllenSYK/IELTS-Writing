import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export type WebProfile = {
  id: string
  email: string | null
  role: string
  license_status: string
  license_expires_at: string | null
}

export type WebLicenseCheck =
  | {
      ok: true
      user: User
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
      user?: User
    }

export async function getCurrentSupabaseUser() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

export async function getWebProfile(userId: string) {
  const service = createSupabaseServiceRoleClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, email, role, license_status, license_expires_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return profile as WebProfile | null
}

export async function requireWebAdmin() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    throw new Response('Unauthorized', { status: 401 })
  }

  const service = createSupabaseServiceRoleClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('id, role, email')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  if (profile?.role !== 'admin') {
    throw new Response('Forbidden', { status: 403 })
  }

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

  const service = createSupabaseServiceRoleClient()
  const nowIso = new Date().toISOString()

  await service
    .from('license_activations')
    .update({ status: 'expired' })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .lte('expires_at', nowIso)

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, email, role, license_status, license_expires_at')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError

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

  const { data: activation, error: activationError } = await service
    .from('license_activations')
    .select('id, license_id, user_id, email, activated_at, expires_at, status, last_used_at, license_codes(id, plan, status)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activationError) throw activationError
  const license = Array.isArray(activation?.license_codes)
    ? activation?.license_codes[0]
    : activation?.license_codes

  if (!activation || !license || license.status === 'disabled' || license.status === 'expired') {
    await service
      .from('profiles')
      .update({ license_status: license?.status === 'disabled' ? 'suspended' : 'inactive', license_expires_at: null })
      .eq('id', user.id)

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
}
