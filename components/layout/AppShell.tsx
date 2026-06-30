'use client'

import { usePathname } from 'next/navigation'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

const routeMeta: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (pathname) => pathname === '/' || pathname === '/dashboard', title: '账号中心' },
  { match: (pathname) => pathname.startsWith('/study-plan/errors'), title: '个人错误本' },
  { match: (pathname) => pathname.startsWith('/study-plan'), title: '学习规划' },
  { match: (pathname) => pathname === '/practice', title: 'IELTS Writing' },
  { match: (pathname) => pathname.startsWith('/ielts'), title: 'IELTS Writing' },
  { match: (pathname) => pathname.startsWith('/history'), title: '历史记录' },
  { match: (pathname) => pathname.startsWith('/analytics'), title: '学习分析' },
  { match: (pathname) => pathname.startsWith('/result'), title: '批改结果' },
  { match: (pathname) => pathname.startsWith('/settings'), title: '设置' },
  { match: (pathname) => pathname.startsWith('/support'), title: '支持中心' },
  { match: (pathname) => pathname.startsWith('/terms'), title: '服务条款' },
  { match: (pathname) => pathname.startsWith('/privacy'), title: '隐私政策' }
]

function pageMeta(pathname: string) {
  return routeMeta.find((item) => item.match(pathname)) ?? routeMeta[0]
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const contentRef = useRef<HTMLDivElement>(null)
  const fullScreenRoute =
    pathname.startsWith('/write') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/activate')
  const meta = pageMeta(pathname)

  useLayoutEffect(() => {
    const container = contentRef.current
    if (container) {
      container.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [pathname])

  if (fullScreenRoute) {
    return <div className="app-route-root is-full-screen">{children}</div>
  }

  return (
    <div className="app-route-root">
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <AppHeader title={meta.title} />
          <div ref={contentRef} className="app-content">{children}</div>
        </div>
      </div>
    </div>
  )
}
