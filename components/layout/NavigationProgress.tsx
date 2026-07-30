'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const prevPathRef = useRef(pathname + searchParams.toString())

  // Only detect navigation completion via pathname change
  useEffect(() => {
    const currentPath = pathname + searchParams.toString()
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath
      setIsLoading(false)
    }
  }, [pathname, searchParams])

  // Safety auto-hide after 5s
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setIsLoading(false), 5000)
    return () => clearTimeout(timer)
  }, [isLoading])

  // Listen for Link clicks to show progress
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.button !== 0) return
      const link = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
      if (!link) return
      const href = link.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href === window.location.pathname) return
      // Don't preventDefault or stopPropagation - let the Link navigate normally
      setIsLoading(true)
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

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
          0% { transform: scaleX(0); }
          50% { transform: scaleX(0.6); }
          100% { transform: scaleX(0.9); }
        }
      `}</style>
    </div>
  )
}
