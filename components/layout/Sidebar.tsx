'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import { MaterialIcon } from '@/components/app-ui'
import { handleRovingNavKeyDown } from '@/components/interaction-system'
import { BRAND_NAME } from '@/lib/brand'
import type { UserRouteCacheKey } from '@/lib/user-route-cache'

type SidebarItem = {
  id: string
  href: string
  label: string
  icon: string
  cacheKey?: UserRouteCacheKey
  match: (pathname: string) => boolean
}

const mainItems: SidebarItem[] = [
  { id: 'study-plan', href: '/study-plan', label: '学习规划', icon: 'school', match: (pathname) => pathname.startsWith('/study-plan') && !pathname.startsWith('/study-plan/errors') },
  { id: 'ielts', href: '/practice', label: '写作练习', icon: 'edit_note', match: (pathname) => pathname === '/practice' || pathname.startsWith('/result') || pathname.startsWith('/ielts') || pathname.startsWith('/write') },
  { id: 'error-notebook', href: '/study-plan/errors', label: '错题本', icon: 'bug_report', match: (pathname) => pathname.startsWith('/study-plan/errors') },
  { id: 'history', href: '/history', label: '历史记录', icon: 'history', match: (pathname) => pathname.startsWith('/history') },
  { id: 'analytics', href: '/analytics', label: '学习分析', icon: 'analytics', match: (pathname) => pathname.startsWith('/analytics') },
  { id: 'home', href: '/dashboard', label: '账号中心', icon: 'manage_accounts', match: (pathname) => pathname === '/dashboard' || pathname.startsWith('/settings') }
]

const supportItems: SidebarItem[] = [
  { id: 'support', href: '/support', label: '帮助与反馈', icon: 'contact_support', match: (pathname) => pathname.startsWith('/support') },
  { id: 'terms', href: '/terms', label: '服务条款', icon: 'contract', match: (pathname) => pathname.startsWith('/terms') },
  { id: 'privacy', href: '/privacy', label: '隐私政策', icon: 'privacy_tip', match: (pathname) => pathname.startsWith('/privacy') }
]

function useOnlineLabel() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const online = useOnlineLabel()
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeId = useMemo(() => {
    const allItems = [...mainItems, ...supportItems]
    const matches = allItems.filter((item) => item.match(pathname))
    if (matches.length === 0) return null
    return matches.sort((a, b) => b.href.length - a.href.length)[0].id
  }, [pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileOpen])

  function prefetchItem(item: SidebarItem) {
    router.prefetch(item.href)
  }

  return (
    <aside className="sidebar" aria-label="应用导航">
      <Link
        className="sidebar-logo"
        href="/practice"
        prefetch={false}
        aria-label={`返回 ${BRAND_NAME} 首页`}
        title={BRAND_NAME}
        onPointerEnter={() => router.prefetch('/practice')}
        onFocus={() => router.prefetch('/practice')}
      >
        <BrandLogo size="md" showName />
      </Link>

      <button
        className="sidebar-mobile-menu"
        type="button"
        aria-label={mobileOpen ? '关闭主导航' : '打开主导航'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-main-navigation"
        onClick={() => setMobileOpen((value) => !value)}
      >
        <MaterialIcon name={mobileOpen ? 'close' : 'menu'} size={24} />
      </button>

      <nav className="sidebar-nav" aria-label="主要页面" onKeyDown={handleRovingNavKeyDown}>
        {mainItems.map((item) => (
          <Link
            key={item.id}
            className={`sidebar-link ${activeId === item.id ? 'is-active' : ''}`}
            href={item.href}
            prefetch={false}
            aria-current={activeId === item.id ? 'page' : undefined}
            onPointerEnter={() => prefetchItem(item)}
            onFocus={() => prefetchItem(item)}
            onClick={() => {
              if (item.id === 'ielts') {
                window.dispatchEvent(new Event('ielts-writing:practice-visited'))
              }
            }}
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
            <strong>网络状态</strong>
            <small>{online ? '已连接' : '连接中断'}</small>
          </div>
        </div>

        <nav className="sidebar-support-nav" aria-label="支持与法律页面" onKeyDown={handleRovingNavKeyDown}>
          {supportItems.map((item) => (
            <Link
              key={item.id}
              className={`sidebar-link sidebar-link-small ${activeId === item.id ? 'is-active' : ''}`}
              href={item.href}
              prefetch={false}
              aria-current={activeId === item.id ? 'page' : undefined}
            >
              <MaterialIcon name={item.icon} filled={activeId === item.id} size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <p className="sidebar-copyright">© 2026 {BRAND_NAME}</p>
      </div>

      {mobileOpen ? (
        <>
          <button
            className="sidebar-mobile-backdrop"
            type="button"
            aria-label="关闭主导航"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="mobile-main-navigation"
            className="sidebar-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="页面导航"
          >
            <div className="sidebar-mobile-drawer-heading">
              <strong>前往页面</strong>
              <button type="button" aria-label="关闭主导航" onClick={() => setMobileOpen(false)}>
                <MaterialIcon name="close" size={22} />
              </button>
            </div>
            <nav aria-label="移动端主要页面">
              {mainItems.map((item) => (
                <Link
                  key={item.id}
                  className={`sidebar-link ${activeId === item.id ? 'is-active' : ''}`}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  onClick={() => {
                    setMobileOpen(false)
                    if (item.id === 'ielts') {
                      window.dispatchEvent(new Event('ielts-writing:practice-visited'))
                    }
                  }}
                >
                  <MaterialIcon name={item.icon} filled={activeId === item.id} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <nav className="sidebar-mobile-support" aria-label="移动端支持与法律页面">
              {supportItems.map((item) => (
                <Link
                  key={item.id}
                  className={`sidebar-link sidebar-link-small ${activeId === item.id ? 'is-active' : ''}`}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <MaterialIcon name={item.icon} filled={activeId === item.id} size={20} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </aside>
  )
}
