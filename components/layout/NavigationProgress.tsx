'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { navigationEvents } from '@/lib/navigation-events'

/**
 * 导航进度条组件
 * 
 * 在页面切换时显示顶部进度条
 * 使用CSS动画实现不确定进度
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevPathRef = useRef(pathname + searchParams.toString())

  useEffect(() => {
    const unsubscribe = navigationEvents.subscribe(() => {
      setIsLoading(navigationEvents.getIsNavigating())
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const currentPath = pathname + searchParams.toString()
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath
      navigationEvents.complete()
    }
  }, [pathname, searchParams])

  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        navigationEvents.complete()
      }, 8000)
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isLoading])

  if (!isLoading) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 9999,
        backgroundColor: 'transparent',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: '100%',
          backgroundColor: '#3b82f6',
          animation: 'navigation-progress 1.5s infinite ease-in-out',
          transformOrigin: 'left',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
        }}
      />
      <style jsx>{`
        @keyframes navigation-progress {
          0% {
            transform: scaleX(0);
          }
          50% {
            transform: scaleX(0.6);
          }
          100% {
            transform: scaleX(0.9);
          }
        }
      `}</style>
    </div>
  )
}
