import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveAuthRedirect } from '@/lib/auth/route-access'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

type LicenseGate = {
  active: boolean
  expiresAt?: number
}

type MiddlewareProfile = {
  role?: string | null
  license_status?: string | null
  license_expires_at?: string | null
}

type AccessSnapshot = {
  role?: string | null
  licenseActive: boolean
  licenseExpiresAt?: number
  expiresAt: number
}

type AccessState = Omit<AccessSnapshot, 'expiresAt'>

const AccessCacheTtlMs = 30_000
const accessSnapshotCache = new Map<string, AccessSnapshot>()
const pendingAccessChecks = new Map<string, Promise<AccessState>>()

function sessionCacheKey(request: NextRequest) {
  const source = request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith('sb-') && name.includes('auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, value }) => `${name}=${value}`)
    .join('|')

  if (!source) return null

  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function readAccessSnapshot(key: string | null) {
  if (!key) return null
  const snapshot = accessSnapshotCache.get(key)
  const now = Date.now()
  if (
    !snapshot ||
    snapshot.expiresAt <= now ||
    (snapshot.licenseExpiresAt !== undefined && snapshot.licenseExpiresAt <= now)
  ) {
    accessSnapshotCache.delete(key)
    return null
  }
  return snapshot
}

function writeAccessSnapshot(key: string | null, snapshot: AccessState) {
  if (!key) return
  // Do not cache inactive ordinary users: a successful activation must take effect immediately.
  if (snapshot.role !== 'admin' && !snapshot.licenseActive) return
  if (accessSnapshotCache.size >= 100) {
    const oldestKey = accessSnapshotCache.keys().next().value
    if (oldestKey) accessSnapshotCache.delete(oldestKey)
  }
  accessSnapshotCache.set(key, {
    ...snapshot,
    expiresAt: Date.now() + AccessCacheTtlMs
  })
}

function redirectTo(request: NextRequest, target: string, sourceResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(new URL(target, request.url))
  sourceResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
  redirectResponse.headers.set('Cache-Control', 'private, no-store')
  return redirectResponse
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
  const expiresAt = new Date(profile.license_expires_at).getTime()
  return {
    active: expiresAt > Date.now(),
    expiresAt
  }
}

async function loadAccessState(
  url: string,
  serviceRoleKey: string,
  userId: string
): Promise<AccessState> {
  const service = createMiddlewareServiceClient(url, serviceRoleKey)
  const nowIso = new Date().toISOString()

  const [profileResult, activationResult] = await Promise.all([
    service
      .from('profiles')
      .select('role, license_status, license_expires_at')
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

  const profile = profileResult.data as MiddlewareProfile | null
  const activation = activationResult.data
  const license = Array.isArray(activation?.license_codes)
    ? activation?.license_codes[0]
    : activation?.license_codes
  const profileGate = hasActiveLicense(profile)
  const activationExpiresAt = activation?.expires_at
    ? new Date(activation.expires_at).getTime()
    : undefined
  const activationActive =
    activation?.status === 'active' &&
    activationExpiresAt !== undefined &&
    activationExpiresAt > Date.now() &&
    license?.status !== 'disabled' &&
    license?.status !== 'expired'

  if (profile?.role === 'admin') {
    return {
      role: profile.role,
      licenseActive: false
    }
  }

  if (!profileGate.active || !activationActive) {
    await service
      .from('profiles')
      .update({
        license_status: license?.status === 'disabled' ? 'suspended' : 'inactive',
        license_expires_at: null
      })
      .eq('id', userId)
    return {
      role: profile?.role,
      licenseActive: false
    }
  }

  return {
    role: profile?.role,
    licenseActive: true,
    licenseExpiresAt: Math.min(profileGate.expiresAt ?? Number.POSITIVE_INFINITY, activationExpiresAt)
  }
}

async function getAccessState(key: string | null, url: string, serviceRoleKey: string, userId: string) {
  const cached = readAccessSnapshot(key)
  if (cached) return cached

  if (!key) return loadAccessState(url, serviceRoleKey, userId)

  const pending = pendingAccessChecks.get(key)
  if (pending) return pending

  const request = loadAccessState(url, serviceRoleKey, userId)
    .then((snapshot) => {
      writeAccessSnapshot(key, snapshot)
      return snapshot
    })
    .finally(() => {
      pendingAccessChecks.delete(key)
    })
  pendingAccessChecks.set(key, request)
  return request
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
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims?.sub) {
    const target = resolveAuthRedirect({
      pathname,
      isAuthenticated: false
    })
    return target ? redirectTo(request, target, response) : response
  }

  const serviceRoleKey = getSupabaseServiceRoleKey()
  let access: AccessState
  if (serviceRoleKey) {
    const cookieKey = sessionCacheKey(request)
    const cacheKey = `${claims.sub}:${claims.session_id || cookieKey || 'session'}`
    access = await getAccessState(cacheKey, url, serviceRoleKey, claims.sub)
  } else {
    const { data } = await supabase
      .from('profiles')
      .select('role, license_status, license_expires_at')
      .eq('id', claims.sub)
      .maybeSingle()
    const profile = data as MiddlewareProfile | null
    const licenseGate = hasActiveLicense(profile)
    access = {
      role: profile?.role,
      licenseActive: licenseGate.active,
      licenseExpiresAt: licenseGate.expiresAt
    }
  }

  const target = resolveAuthRedirect({
    pathname,
    isAuthenticated: true,
    role: access.role,
    licenseActive: access.licenseActive
  })
  return target ? redirectTo(request, target, response) : response
}
