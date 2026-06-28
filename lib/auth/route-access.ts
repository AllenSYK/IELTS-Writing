/**
 * 路由权限分组
 *
 * authEntryRoutes: 未登录可访问；已登录时跳转
 * publicRoutes: 任何人可访问，不要求登录
 * loginRequiredRoutes: 需要登录，但不需要有效许可证
 * activeLicenseRequiredRoutes: 需要登录且需要有效许可证
 * adminRoutes: 需要管理员权限（在 middleware 中通过 pathname 前缀判断）
 */

// 未登录入口：未登录可访问；已登录用户访问时跳转到 dashboard 或 activate
const authEntryRoutes = ['/login', '/register', '/forgot-password', '/reset-password']

// 公开路由：任何人可访问，不要求登录
const publicRoutes = ['/terms', '/privacy']

// 需要登录但不需要许可证的路由
const loginRequiredRoutes = ['/activate', '/settings', '/support']

// 需要有效许可证的路由
const activeLicenseRequiredRoutes = ['/dashboard', '/practice', '/history', '/write', '/result', '/analytics', '/study-plan', '/ielts']

// 所有用户路由（需要登录）
const userRoutes = [...authEntryRoutes, ...loginRequiredRoutes, ...activeLicenseRequiredRoutes]

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
    isPublicRoute: startsWithRoute(pathname, publicRoutes),
    isAuthEntryRoute: startsWithRoute(pathname, authEntryRoutes),
    isUserRoute: startsWithRoute(pathname, userRoutes),
    isLoginRequiredRoute: startsWithRoute(pathname, loginRequiredRoutes),
    isActiveLicenseRoute: startsWithRoute(pathname, activeLicenseRequiredRoutes)
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

  // 管理员路由
  if (route.isAdminRoute) {
    if (!isAuthenticated) return '/admin/login'
    if (role !== 'admin') return '/admin/login?reason=not_admin'
    if (pathname === '/admin') return '/admin/licenses'
    return null
  }

  // 管理员登录页
  if (route.isAdminLoginRoute) {
    return isAuthenticated && role === 'admin' ? '/admin/licenses' : null
  }

  // 公开路由：任何人可访问
  if (route.isPublicRoute) {
    return null
  }

  // 未登录用户
  if (!isAuthenticated) {
    return route.isUserRoute ? `/login?next=${encodeURIComponent(pathname)}` : null
  }

  // 管理员访问用户页面：重定向到管理后台
  if (role === 'admin') {
    return route.isUserRoute ? '/admin/licenses' : null
  }

  // 已登录用户访问登录/注册等入口页：跳转到合理页面
  if (route.isAuthEntryRoute) {
    return licenseActive ? '/dashboard' : '/activate'
  }

  // 激活页：已有许可证则跳转到仪表板
  if (pathname === '/activate' && licenseActive) {
    return '/dashboard'
  }

  // 需要许可证的路由：没有许可证则跳转到激活页
  if (route.isActiveLicenseRoute && !licenseActive) {
    return `/activate?next=${encodeURIComponent(pathname)}`
  }

  return null
}
