'use client'

import { usePathname } from 'next/navigation'
import { AppHeader } from './AppHeader'
import { Sidebar } from './Sidebar'
import { useLayoutEffect, useRef, useEffect, type ReactNode } from 'react'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { setCurrentUserId, addPrefetchTask, setupVisibilityListener, setupNetworkListener } from '@/lib/performance/prefetch-manager'
import { clearUserCache } from '@/lib/performance/cache-manager'

const routeMeta: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (pathname) => pathname === '/' || pathname === '/dashboard', title: '账号中心' },
  { match: (pathname) => pathname.startsWith('/study-plan/errors'), title: '个人错误本' },
  { match: (pathname) => pathname.startsWith('/study-plan'), title: '学习规划' },
  { match: (pathname) => pathname === '/practice', title: '雅思写作练习' },
  { match: (pathname) => pathname.startsWith('/ielts'), title: '雅思真题练习' },
  { match: (pathname) => pathname.startsWith('/history'), title: '历史记录' },
  { match: (pathname) => pathname.startsWith('/analytics'), title: '学习分析' },
  { match: (pathname) => pathname.startsWith('/result'), title: '批改结果' },
  { match: (pathname) => pathname.startsWith('/settings'), title: '账号中心' },
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
  const { userId, status: sessionStatus } = useUserSession()
  const prefetchedRef = useRef(false)
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

  // 设置当前用户 ID
  useEffect(() => {
    setCurrentUserId(userId)
  }, [userId])

  // 监听用户登出，清理缓存
  useEffect(() => {
    if (sessionStatus === 'unauthenticated' && userId) {
      clearUserCache(userId)
    }
  }, [sessionStatus, userId])

  // 设置可见性和网络监听
  useEffect(() => {
    const cleanupVisibility = setupVisibilityListener()
    const cleanupNetwork = setupNetworkListener()
    return () => {
      cleanupVisibility()
      cleanupNetwork()
    }
  }, [])

  // 页面可交互后启动后台预加载
  useEffect(() => {
    if (!userId || prefetchedRef.current) return
    
    // 延迟启动预加载，等待页面可交互
    const startPrefetch = () => {
      prefetchedRef.current = true
      
      // 第一批：高优先级（学习规划、写作练习）
      addPrefetchTask('prefetch-batch-1', async () => {
        // 这里只是预加载路由代码，不加载数据
        // 实际的数据预加载由各页面自己管理
      }, 'high')
    }
    
    // 使用 requestIdleCallback 或 setTimeout
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(startPrefetch, { timeout: 2000 })
    } else {
      setTimeout(startPrefetch, 1200)
    }
  }, [userId])

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
