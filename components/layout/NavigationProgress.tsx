'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * 导航进度条组件
 * 
 * 在页面切换时显示顶部进度条
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const prevPathRef = useRef(pathname)

  useEffect(() => {
    // 路径变化时触发加载状态
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname
      setIsLoading(true)
      setProgress(30)

      // 模拟进度
      if (timerRef.current) clearInterval(timerRef.current)
      
      const startTime = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        if (elapsed > 2000) {
          setProgress(90)
        } else if (elapsed > 1000) {
          setProgress(70)
        } else if (elapsed > 500) {
          setProgress(50)
        }
      }, 100)

      // 页面加载完成
      const handleLoad = () => {
        setProgress(100)
        setTimeout(() => {
          setIsLoading(false)
          setProgress(0)
        }, 200)
      }

      // 监听页面加载完成
      if (document.readyState === 'complete') {
        handleLoad()
      } else {
        window.addEventListener('load', handleLoad, { once: true })
      }

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
        window.removeEventListener('load', handleLoad)
      }
    }
  }, [pathname, searchParams])

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
          width: `${progress}%`,
          backgroundColor: '#3b82f6',
          transition: 'width 0.2s ease',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
        }}
      />
    </div>
  )
}
