import type { User } from '@supabase/supabase-js'
import { cache } from 'react'
import type { ApiObservation } from '@/lib/api-observability'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
import {
  isActiveWebLicenseSnapshot,
  loadWebLicenseAccessSnapshot,
  type WebLicenseAccessSnapshot,
  type WebProfile
} from '@/lib/web-license/access'

export { assertTrustedAdminMutationRequest } from '@/lib/admin/trusted-origin'
export type { WebProfile } from '@/lib/web-license/access'

type MinimalUser = Pick<User, 'id'> & { email?: string | null; phone?: string | null }

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

const getWebLicenseAccessSnapshot = cache(async function getWebLicenseAccessSnapshot(userId: string) {
  const service = createSupabaseServiceRoleClient()
  return loadWebLicenseAccessSnapshot(service, userId)
})

export const getWebProfile = cache(async function getWebProfile(userId: string) {
  return (await getWebLicenseAccessSnapshot(userId)).profile
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

export async function requireActiveWebLicense(observation?: ApiObservation): Promise<WebLicenseCheck> {
  const authStartedAt = performance.now()
  const user = await getCurrentSupabaseUser()
  observation?.recordSince('auth', authStartedAt)
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'NOT_AUTHENTICATED',
      message: '请先登录'
    }
  }

  const service = createSupabaseServiceRoleClient()
  const snapshot = await loadWebLicenseAccessSnapshot(service, user.id, observation)
  return webLicenseCheckFromSnapshot(user, snapshot)
}

export const checkActiveWebLicenseForUser = cache(async function checkActiveWebLicenseForUser(user: MinimalUser): Promise<WebLicenseCheck> {
  return webLicenseCheckFromSnapshot(user, await getWebLicenseAccessSnapshot(user.id))
})

function webLicenseCheckFromSnapshot(
  user: MinimalUser,
  snapshot: WebLicenseAccessSnapshot
): WebLicenseCheck {
  if (!isActiveWebLicenseSnapshot(snapshot)) {
    return {
      ok: false,
      status: 403,
      code: 'LICENSE_REQUIRED',
      message: '请先激活账号后再使用批改功能',
      user
    }
  }

  const { profile, activation, license } = snapshot
  if (!profile || !activation || !license) {
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
