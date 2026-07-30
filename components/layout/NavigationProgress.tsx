'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevPathRef = useRef(pathname + searchParams.toString())
  const startTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Detect navigation start by comparing path
  // When a Link is clicked, the page starts loading. We show the progress bar
  // immediately and hide it when the pathname changes (navigation completes).
  useEffect(() => {
    const currentPath = pathname + searchParams.toString()
    if (prevPathRef.current !== currentPath) {
      // Navigation completed
      prevPathRef.current = currentPath
      setIsLoading(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [pathname, searchParams])

  // Safety timeout
  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        setIsLoading(false)
      }, 5000)
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (startTimerRef.current) clearTimeout(startTimerRef.current)
    }
  }, [isLoading])

  // Listen for click events on Links to detect navigation start
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = (e.target as HTMLElement).closest('a[href]')
      if (!target) return
      const href = (target as HTMLAnchorElement).getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      // Check if navigating to a different page
      const currentPath = window.location.pathname
      if (href === currentPath) return
      // Show progress after a short delay to avoid flash for fast navigations
      startTimerRef.current = setTimeout(() => {
        setIsLoading(true)
      }, 150)
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
    }
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
