import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createApiObservation, type ApiObservation } from '@/lib/api-observability'
import { resolveAuthRedirect } from '@/lib/auth/route-access'
import {
  isActiveWebLicenseSnapshot,
  loadWebLicenseAccessSnapshot,
  type WebLicenseAccessSnapshot
} from '@/lib/web-license/access'
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from './env'

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

function isInvalidRefreshToken(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = 'message' in error ? String(error.message) : ''
  return (
    code === 'refresh_token_not_found'
    || code === 'invalid_refresh_token'
    || (code === 'validation_failed' && /refresh token/i.test(message))
    || /invalid refresh token|refresh token (?:is )?not (?:found|valid)/i.test(message)
  )
}

function clearStaleAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith('sb-') && name.includes('auth-token'))
    .forEach(({ name }) => {
      response.cookies.set(name, '', {
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        maxAge: 0,
        expires: new Date(0)
      })
    })
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0')
  response.headers.set('Expires', '0')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('X-Auth-Session-Recovered', '1')
  return response
}

function unauthenticatedResponse(
  request: NextRequest,
  pathname: string,
  sourceResponse: NextResponse,
  clearStaleSession = false
) {
  const target = resolveAuthRedirect({
    pathname,
    isAuthenticated: false
  })
  const response = target ? redirectTo(request, target, sourceResponse) : sourceResponse
  return clearStaleSession ? clearStaleAuthCookies(request, response) : response
}

function createMiddlewareServiceClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

function accessStateFromSnapshot(snapshot: WebLicenseAccessSnapshot): AccessState {
  const role = snapshot.profile?.role
  if (role === 'admin') return { role, licenseActive: false }
  if (!isActiveWebLicenseSnapshot(snapshot)) return { role, licenseActive: false }

  const expirationValues = [
    snapshot.profile?.license_expires_at,
    snapshot.activation?.expires_at,
    snapshot.license?.expires_at
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)

  return {
    role,
    licenseActive: true,
    licenseExpiresAt: expirationValues.length > 0 ? Math.min(...expirationValues) : undefined
  }
}

async function loadAccessState(
  url: string,
  serviceRoleKey: string,
  userId: string,
  observation?: ApiObservation
): Promise<AccessState> {
  const service = createMiddlewareServiceClient(url, serviceRoleKey)
  return accessStateFromSnapshot(await loadWebLicenseAccessSnapshot(service, userId, observation))
}

async function getAccessState(
  key: string | null,
  url: string,
  serviceRoleKey: string,
  userId: string,
  observation?: ApiObservation
) {
  const cached = readAccessSnapshot(key)
  if (cached) {
    observation?.record('database', 0)
    observation?.record('profile', 0)
    observation?.record('activation', 0)
    return cached
  }

  if (!key) return loadAccessState(url, serviceRoleKey, userId, observation)

  const pending = pendingAccessChecks.get(key)
  if (pending) {
    observation?.record('database', 0)
    observation?.record('profile', 0)
    observation?.record('activation', 0)
    return pending
  }

  const request = loadAccessState(url, serviceRoleKey, userId, observation)
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
  const observation = createApiObservation('proxy', request)
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  if (!url || !key) {
    return observation.finish(NextResponse.next({ request }))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
        Object.entries(headersToSet).forEach(([name, value]) => {
          response.headers.set(name, value)
        })
      }
    }
  })

  const pathname = request.nextUrl.pathname
  let claimsData
  let claimsError
  try {
    const claimsResult = await observation.time('auth', () => supabase.auth.getClaims())
    claimsData = claimsResult.data
    claimsError = claimsResult.error
  } catch (error) {
    if (isInvalidRefreshToken(error)) {
      console.warn('[auth:proxy] cleared stale refresh token', { pathname })
      return observation.finish(unauthenticatedResponse(request, pathname, response, true))
    }
    throw error
  }
  const claims = claimsData?.claims

  if (claimsError || !claims?.sub) {
    return observation.finish(unauthenticatedResponse(
      request,
      pathname,
      response,
      isInvalidRefreshToken(claimsError)
    ))
  }

  const serviceRoleKey = getSupabaseServiceRoleKey()
  let access: AccessState
  if (serviceRoleKey) {
    const cookieKey = sessionCacheKey(request)
    const cacheKey = `${claims.sub}:${claims.session_id || cookieKey || 'session'}`
    access = await getAccessState(cacheKey, url, serviceRoleKey, claims.sub, observation)
  } else {
    const snapshot = await loadWebLicenseAccessSnapshot(
      supabase,
      claims.sub,
      observation,
      { tryRpc: false }
    )
    access = accessStateFromSnapshot(snapshot)
  }

  const target = resolveAuthRedirect({
    pathname,
    isAuthenticated: true,
    role: access.role,
    licenseActive: access.licenseActive
  })
  return observation.finish(target ? redirectTo(request, target, response) : response)
}
