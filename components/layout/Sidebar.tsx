'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useSWRConfig } from 'swr'
import { MaterialIcon } from '@/components/app-ui'
import { handleRovingNavKeyDown } from '@/components/interaction-system'
import { useOnlineStatus } from '@/components/browser-hooks'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  UserRouteCacheKeys,
  warmUserRouteCache,
  type UserRouteCacheKey
} from '@/lib/user-route-cache'

type SidebarItem = {
  id: string
  href: string
  label: string
  icon: string
  cacheKey?: UserRouteCacheKey
  match: (pathname: string) => boolean
}

const mainItems: SidebarItem[] = [
  { id: 'home', href: '/dashboard', label: '账号中心', icon: 'home', match: (pathname) => pathname === '/' || pathname === '/dashboard' },
  { id: 'ielts', href: '/practice', label: 'IELTS', icon: 'edit_note', match: (pathname) => pathname === '/practice' || pathname.startsWith('/result') },
  { id: 'history', href: '/history', label: '历史记录', icon: 'history', cacheKey: UserRouteCacheKeys.history, match: (pathname) => pathname.startsWith('/history') },
  { id: 'analytics', href: '/analytics', label: '学习分析', icon: 'analytics', cacheKey: UserRouteCacheKeys.analytics, match: (pathname) => pathname.startsWith('/analytics') },
  { id: 'settings', href: '/settings', label: '设置', icon: 'settings', match: (pathname) => pathname.startsWith('/settings') }
]

const supportItems: SidebarItem[] = [
  { id: 'support', href: '/support', label: '帮助与反馈', icon: 'contact_support', match: (pathname) => pathname.startsWith('/support') },
  { id: 'terms', href: '/terms', label: '服务条款', icon: 'contract', match: (pathname) => pathname.startsWith('/terms') },
  { id: 'privacy', href: '/privacy', label: '隐私政策', icon: 'privacy_tip', match: (pathname) => pathname.startsWith('/privacy') }
]

export function Sidebar() {
  const { userId } = useUserSession()
  const pathname = usePathname()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const online = useOnlineStatus()
  const activeId = useMemo(
    () => [...mainItems, ...supportItems].find((item) => item.match(pathname))?.id ?? 'home',
    [pathname]
  )

  function prefetchItem(item: SidebarItem) {
    router.prefetch(item.href)
    if (item.cacheKey && userId) void warmUserRouteCache(userId, item.cacheKey, mutate)
  }

  return (
    <aside className="sidebar" aria-label="应用导航">
      <Link className="sidebar-logo" href="/dashboard" aria-label="回到首页" onPointerEnter={() => prefetchItem(mainItems[0])} onFocus={() => prefetchItem(mainItems[0])}>
        <span className="sidebar-logo-mark">空</span>
        <span>
          <strong>空与梦</strong>
          <small>IELTS Writing</small>
        </span>
      </Link>

      <nav className="sidebar-nav" aria-label="主要页面" onKeyDown={handleRovingNavKeyDown}>
        {mainItems.map((item) => (
          <Link
            key={item.id}
            className={`sidebar-link ${activeId === item.id ? 'is-active' : ''}`}
            href={item.href}
            prefetch
            aria-current={activeId === item.id ? 'page' : undefined}
            onPointerEnter={() => prefetchItem(item)}
            onFocus={() => prefetchItem(item)}
          >
            <MaterialIcon name={item.icon} filled={activeId === item.id} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className={`netwatch-status ${online ? 'is-online' : 'is-offline'}`} role="status">
          <span />
          <div>
            <strong>NetWatch</strong>
            <small>{online ? 'Online' : 'Offline'}</small>
          </div>
        </div>

        <nav className="sidebar-support-nav" aria-label="支持与法律页面" onKeyDown={handleRovingNavKeyDown}>
          {supportItems.map((item) => (
            <Link
              key={item.id}
              className={`sidebar-link sidebar-link-small ${activeId === item.id ? 'is-active' : ''}`}
              href={item.href}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <MaterialIcon name={item.icon} filled={activeId === item.id} size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <p className="sidebar-copyright">© 2026 IELTS Writing</p>
      </div>
    </aside>
  )
}
