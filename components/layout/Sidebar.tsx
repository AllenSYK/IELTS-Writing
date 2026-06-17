'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { MaterialIcon } from '@/components/stitch-ui'
import { handleRovingNavKeyDown } from '@/components/interaction-system'

type SidebarItem = {
  id: string
  href: string
  label: string
  icon: string
  match: (pathname: string) => boolean
}

const mainItems: SidebarItem[] = [
  { id: 'home', href: '/', label: 'Home', icon: 'home', match: (pathname) => pathname === '/' },
  { id: 'ielts', href: '/practice', label: 'IELTS', icon: 'edit_note', match: (pathname) => pathname === '/practice' || pathname.startsWith('/result') },
  { id: 'history', href: '/history', label: 'History', icon: 'history', match: (pathname) => pathname.startsWith('/history') },
  { id: 'analytics', href: '/analytics', label: 'Analytics', icon: 'analytics', match: (pathname) => pathname.startsWith('/analytics') },
  { id: 'settings', href: '/settings', label: 'Settings', icon: 'settings', match: (pathname) => pathname.startsWith('/settings') }
]

const supportItems: SidebarItem[] = [
  { id: 'support', href: '/support', label: 'Support', icon: 'contact_support', match: (pathname) => pathname.startsWith('/support') },
  { id: 'terms', href: '/terms', label: 'Terms of Service', icon: 'contract', match: (pathname) => pathname.startsWith('/terms') },
  { id: 'privacy', href: '/privacy', label: 'Privacy Policy', icon: 'privacy_tip', match: (pathname) => pathname.startsWith('/privacy') }
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
  const online = useOnlineLabel()
  const activeId = useMemo(
    () => [...mainItems, ...supportItems].find((item) => item.match(pathname))?.id ?? 'home',
    [pathname]
  )

  return (
    <aside className="sidebar" aria-label="应用导航">
      <Link className="sidebar-logo" href="/" aria-label="回到首页">
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
            aria-current={activeId === item.id ? 'page' : undefined}
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

        <p className="sidebar-copyright">© 2026 NightWish AI. All rights reserved.</p>
      </div>
    </aside>
  )
}
