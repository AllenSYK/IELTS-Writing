import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

type LicenseGate = {
  active: boolean
}

const loginOnlyRoutes = ['/dashboard', '/activate']
const activeLicenseRoutes = ['/practice', '/history', '/write', '/result', '/analytics']

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

function hasActiveLicense(profile: {
  license_status?: string | null
  license_expires_at?: string | null
} | null): LicenseGate {
  if (!profile || profile.license_status !== 'active' || !profile.license_expires_at) {
    return { active: false }
  }
  return { active: new Date(profile.license_expires_at).getTime() > Date.now() }
}

async function checkActiveLicenseForMiddleware(
  url: string,
  serviceRoleKey: string,
  userId: string
): Promise<LicenseGate | null> {
  if (!serviceRoleKey) return null
  const service = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
  const nowIso = new Date().toISOString()

  const [{ data: profile }, { data: activation }] = await Promise.all([
    service
      .from('profiles')
      .select('license_status, license_expires_at')
      .eq('id', userId)
      .maybeSingle(),
    service
      .from('license_activations')
      .select('id, expires_at, status, license_codes(status)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

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
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  const needsLogin = isAdmin || startsWithRoute(pathname, loginOnlyRoutes) || startsWithRoute(pathname, activeLicenseRoutes)

  const { data: { user } } = await supabase.auth.getUser()
  if (!needsLogin) return response

  if (!user) {
    return redirectTo(request, '/login')
  }

  if (pathname === '/activate' || pathname.startsWith('/admin')) {
    return response
  }

  if (startsWithRoute(pathname, activeLicenseRoutes)) {
    const serviceGate = await checkActiveLicenseForMiddleware(url, getSupabaseServiceRoleKey(), user.id)
    if (serviceGate && !serviceGate.active) {
      return redirectTo(request, '/activate')
    }
    if (!serviceGate) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('license_status, license_expires_at')
        .eq('id', user.id)
        .maybeSingle()

      if (!hasActiveLicense(profile).active) {
        return redirectTo(request, '/activate')
      }
    }
  }

  return response
}
