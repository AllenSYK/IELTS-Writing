import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getAuthRouteInfo, resolveAuthRedirect } from '@/lib/auth/route-access'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

type LicenseGate = {
  active: boolean
}

type MiddlewareProfile = {
  role?: string | null
  license_status?: string | null
  license_expires_at?: string | null
}

function redirectTo(request: NextRequest, target: string) {
  return NextResponse.redirect(new URL(target, request.url))
}

function createMiddlewareServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

function hasActiveLicense(profile: MiddlewareProfile | null): LicenseGate {
  if (!profile || profile.license_status !== 'active' || !profile.license_expires_at) {
    return { active: false }
  }
  return { active: new Date(profile.license_expires_at).getTime() > Date.now() }
}

async function getProfileForMiddleware(url: string, serviceRoleKey: string, userId: string) {
  if (!serviceRoleKey) return null
  const service = createMiddlewareServiceClient(url, serviceRoleKey)
  const { data: profile } = await service
    .from('profiles')
    .select('role, license_status, license_expires_at')
    .eq('id', userId)
    .maybeSingle()

  return profile as MiddlewareProfile | null
}

async function checkActiveLicenseForMiddleware(
  url: string,
  serviceRoleKey: string,
  userId: string,
  profile: MiddlewareProfile | null
): Promise<LicenseGate | null> {
  if (!serviceRoleKey) return null
  const service = createMiddlewareServiceClient(url, serviceRoleKey)
  const nowIso = new Date().toISOString()

  const { data: activation } = await service
    .from('license_activations')
    .select('id, expires_at, status, license_codes(status)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const license = Array.isArray(activation?.license_codes)
    ? activation?.license_codes[0]
    : activation?.license_codes
  const profileActive = hasActiveLicense(profile).active
  const activationActive =
    activation?.status === 'active' &&
    new Date(activation.expires_at).getTime() > Date.now() &&
    license?.status !== 'disabled' &&
    license?.status !== 'expired'

  if (!profileActive || !activationActive) {
    await service
      .from('profiles')
      .update({
        license_status: license?.status === 'disabled' ? 'suspended' : 'inactive',
        license_expires_at: null
      })
      .eq('id', userId)
    return { active: false }
  }

  return { active: true }
}

export async function updateSupabaseSession(request: NextRequest) {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
        response.headers.set('Cache-Control', 'private, no-store')
      }
    }
  })

  const pathname = request.nextUrl.pathname
  const route = getAuthRouteInfo(pathname)

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const target = resolveAuthRedirect({
      pathname,
      isAuthenticated: false
    })
    return target ? redirectTo(request, target) : response
  }

  const serviceRoleKey = getSupabaseServiceRoleKey()
  let profile = await getProfileForMiddleware(url, serviceRoleKey, user.id)
  if (!profile) {
    const { data } = await supabase
      .from('profiles')
      .select('role, license_status, license_expires_at')
      .eq('id', user.id)
      .maybeSingle()
    profile = data as MiddlewareProfile | null
  }

  const isAdmin = profile?.role === 'admin'

  // 管理员路由必须在普通用户激活状态之前处理，避免普通用户被送往 /activate。
  if (route.isAdminRoute || route.isAdminLoginRoute || isAdmin) {
    const target = resolveAuthRedirect({
      pathname,
      isAuthenticated: true,
      role: profile?.role
    })
    return target ? redirectTo(request, target) : response
  }

  let licenseGate = hasActiveLicense(profile)
  const serviceGate = await checkActiveLicenseForMiddleware(url, serviceRoleKey, user.id, profile)
  if (serviceGate) {
    licenseGate = serviceGate
  }

  const target = resolveAuthRedirect({
    pathname,
    isAuthenticated: true,
    role: profile?.role,
    licenseActive: licenseGate.active
  })
  return target ? redirectTo(request, target) : response
}
