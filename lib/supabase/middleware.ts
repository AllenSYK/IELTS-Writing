import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

type LicenseGate = {
  active: boolean
}

type MiddlewareProfile = {
  role?: string | null
  license_status?: string | null
  license_expires_at?: string | null
}

const loginOnlyRoutes = ['/dashboard', '/activate']
const activeLicenseRoutes = ['/practice', '/history', '/write', '/result', '/analytics']
const userRoutes = [...loginOnlyRoutes, ...activeLicenseRoutes]

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function redirectTo(request: NextRequest, pathname: string, includeNext = true) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  if (includeNext) {
    url.searchParams.set('next', request.nextUrl.pathname)
  } else {
    url.search = ''
  }
  return NextResponse.redirect(url)
}

function isAllowedAdminRoute(pathname: string) {
  return pathname === '/admin/licenses' || pathname === '/admin/users'
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
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isUserRoute = startsWithRoute(pathname, userRoutes)
  const needsLogin = isAdminRoute || isUserRoute

  const { data: { user } } = await supabase.auth.getUser()
  if (!needsLogin) return response

  if (!user) {
    return redirectTo(request, '/login')
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
  if (isAdmin) {
    if (isUserRoute || (isAdminRoute && !isAllowedAdminRoute(pathname))) {
      return redirectTo(request, '/admin/licenses', false)
    }
    return response
  }

  let licenseGate = hasActiveLicense(profile)
  const serviceGate = await checkActiveLicenseForMiddleware(url, serviceRoleKey, user.id, profile)
  if (serviceGate) {
    licenseGate = serviceGate
  }

  if (isAdminRoute) {
    return redirectTo(request, licenseGate.active ? '/dashboard' : '/activate', false)
  }

  if (startsWithRoute(pathname, activeLicenseRoutes)) {
    if (!licenseGate.active) {
      return redirectTo(request, '/activate')
    }
  }

  return response
}
