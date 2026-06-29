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

// 需要登录的路由（不包括 authEntryRoutes）
const loginProtectedRoutes = [...loginRequiredRoutes, ...activeLicenseRequiredRoutes]

function startsWithRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

/**
 * 安全的 next 参数生成
 * 防止 /login?next=/login 等循环重定向
 */
export function getSafeLoginNext(pathname: string): string | null {
  const authEntryPaths = new Set(['/login', '/register', '/forgot-password', '/reset-password'])

  // 如果是认证入口路径，不生成 next 参数
  if (authEntryPaths.has(pathname)) {
    return null
  }

  // 防止开放重定向
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return null
  }

  return pathname
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
    isLoginProtectedRoute: startsWithRoute(pathname, loginProtectedRoutes),
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

  // 认证入口路由（/login, /register 等）
  if (route.isAuthEntryRoute) {
    // 未登录用户可以正常访问
    if (!isAuthenticated) {
      return null
    }
    // 已登录用户跳转到合理页面
    if (role === 'admin') {
      return '/admin/licenses'
    }
    return licenseActive ? '/dashboard' : '/activate'
  }

  // 以下路由需要登录
  if (!isAuthenticated) {
    // 使用安全的 next 参数生成
    const next = getSafeLoginNext(pathname)
    return next ? `/login?next=${encodeURIComponent(next)}` : '/login'
  }

  // 管理员访问用户页面：重定向到管理后台
  if (role === 'admin') {
    return route.isLoginProtectedRoute ? '/admin/licenses' : null
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
