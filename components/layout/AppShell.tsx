'use client'

import { usePathname } from 'next/navigation'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import type { ReactNode } from 'react'

const routeMeta: Array<{ match: (pathname: string) => boolean; title: string; subtitle: string }> = [
  { match: (pathname) => pathname === '/' || pathname === '/dashboard', title: '账号中心', subtitle: '练习概览与近期进度' },
  { match: (pathname) => pathname === '/practice', title: 'IELTS Writing', subtitle: '选择题型并开始写作' },
  { match: (pathname) => pathname.startsWith('/history'), title: '练习记录', subtitle: '查看已提交作文和批改结果' },
  { match: (pathname) => pathname.startsWith('/analytics'), title: '学习分析', subtitle: '查看分数趋势和练习建议' },
  { match: (pathname) => pathname.startsWith('/result'), title: '批改结果', subtitle: '查看评分和修改建议' },
  { match: (pathname) => pathname.startsWith('/settings'), title: '设置', subtitle: '管理账号和使用偏好' },
  { match: (pathname) => pathname.startsWith('/support'), title: '支持中心', subtitle: '查看常见问题或提交反馈' },
  { match: (pathname) => pathname.startsWith('/terms'), title: '服务条款', subtitle: '了解服务规则和使用限制' },
  { match: (pathname) => pathname.startsWith('/privacy'), title: '隐私政策', subtitle: '了解数据的收集和处理方式' }
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
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
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
