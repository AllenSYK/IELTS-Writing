'use client'

import { usePathname } from 'next/navigation'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import type { ReactNode } from 'react'

const routeMeta: Array<{ match: (pathname: string) => boolean; title: string; subtitle: string }> = [
  { match: (pathname) => pathname === '/' || pathname === '/dashboard', title: '账号中心', subtitle: 'Home' },
  { match: (pathname) => pathname === '/practice', title: 'IELTS Writing', subtitle: 'Practice' },
  { match: (pathname) => pathname.startsWith('/history'), title: '练习记录', subtitle: 'History' },
  { match: (pathname) => pathname.startsWith('/analytics') || pathname.startsWith('/level0'), title: '学习分析', subtitle: 'Analytics' },
  { match: (pathname) => pathname.startsWith('/result'), title: '批改结果', subtitle: 'Result' },
  { match: (pathname) => pathname.startsWith('/settings'), title: '设置', subtitle: 'Settings' },
  { match: (pathname) => pathname.startsWith('/support'), title: '支持中心', subtitle: 'Support' },
  { match: (pathname) => pathname.startsWith('/terms'), title: '服务条款', subtitle: 'Terms of Service' },
  { match: (pathname) => pathname.startsWith('/privacy'), title: '隐私政策', subtitle: 'Privacy Policy' }
]

function pageMeta(pathname: string) {
  return routeMeta.find((item) => item.match(pathname)) ?? routeMeta[0]
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const fullScreenRoute =
    pathname.startsWith('/write') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/activate')
  const meta = pageMeta(pathname)

  if (fullScreenRoute) {
    return <div className="app-route-root is-full-screen">{children}</div>
  }

  return (
    <div className="app-route-root">
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <AppHeader title={meta.title} subtitle={meta.subtitle} />
          <div className="app-content">{children}</div>
        </div>
      </div>
    </div>
  )
}
