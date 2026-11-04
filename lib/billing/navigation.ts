import { getAuthRouteInfo, sanitizeAuthNext } from '@/lib/auth/route-access'

const featureNames: Array<[string, string]> = [
  ['/study-plan/errors', '错题本'], ['/study-plan', '学习规划'],
  ['/practice', '写作练习'], ['/write', '写作练习'], ['/result', '批改结果'],
  ['/history', '历史记录'], ['/analytics', '学习分析'], ['/ielts', '真题题库']
]

export function membershipDestination(raw: string | null | undefined) {
  const href = sanitizeAuthNext(raw)
  if (!href) return null
  const pathname = new URL(href, 'https://local.invalid').pathname
  if (!getAuthRouteInfo(pathname).isActiveLicenseRoute) return null
  return { href, label: featureNames.find(([route]) => pathname === route || pathname.startsWith(`${route}/`))?.[1] || '学习功能' }
}
