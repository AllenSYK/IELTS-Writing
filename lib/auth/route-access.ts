const authEntryRoutes = ['/login', '/register']
const loginOnlyRoutes = ['/activate']
const activeLicenseRoutes = ['/dashboard', '/practice', '/history', '/write', '/result', '/analytics', '/study-plan', '/ielts']
const userRoutes = [...loginOnlyRoutes, ...activeLicenseRoutes]

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function getAuthRouteInfo(pathname: string) {
  const isAdminLoginRoute = pathname === '/admin/login'
  const isAdminRoute =
    (pathname === '/admin' || pathname.startsWith('/admin/')) &&
    !isAdminLoginRoute

  return {
    isAdminLoginRoute,
    isAdminRoute,
    isUserRoute: startsWithRoute(pathname, userRoutes),
    isAuthEntryRoute: startsWithRoute(pathname, authEntryRoutes),
    isActiveLicenseRoute: startsWithRoute(pathname, activeLicenseRoutes)
  }
}

export function resolveAuthRedirect({
  pathname,
  isAuthenticated,
  role,
  licenseActive
}: {
  pathname: string
  isAuthenticated: boolean
  role?: string | null
  licenseActive?: boolean
}) {
  const route = getAuthRouteInfo(pathname)

  if (route.isAdminRoute) {
    if (!isAuthenticated) return '/admin/login'
    if (role !== 'admin') return '/admin/login?reason=not_admin'
    if (pathname === '/admin') return '/admin/licenses'
    return null
  }

  if (route.isAdminLoginRoute) {
    return isAuthenticated && role === 'admin' ? '/admin/licenses' : null
  }

  if (!isAuthenticated) {
    return route.isUserRoute ? `/login?next=${encodeURIComponent(pathname)}` : null
  }

  if (role === 'admin') {
    return route.isUserRoute || route.isAuthEntryRoute ? '/admin/licenses' : null
  }

  if (route.isAuthEntryRoute) {
    return licenseActive ? '/dashboard' : '/activate'
  }

  if (pathname === '/activate' && licenseActive) {
    return '/dashboard'
  }

  if (route.isActiveLicenseRoute && !licenseActive) {
    return `/activate?next=${encodeURIComponent(pathname)}`
  }

  return null
}
