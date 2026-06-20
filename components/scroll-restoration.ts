'use client'

import { useEffect } from 'react'
import { readStorageValue } from '@/lib/user-storage'

export function saveScrollPosition(routeKey: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`ielts-writing-scroll:${routeKey}`, String(window.scrollY))
}

export function useScrollAndFocusRestoration(routeKey: string) {
  useEffect(() => {
    const stored = readStorageValue(window.sessionStorage, `ielts-writing-scroll:${routeKey}`)
    window.requestAnimationFrame(() => {
      if (stored) {
        window.scrollTo({ top: Number(stored), behavior: 'instant' as ScrollBehavior })
      }
      const main = document.querySelector<HTMLElement>('[data-main-content], main')
      if (main && !main.hasAttribute('tabindex')) {
        main.setAttribute('tabindex', '-1')
      }
      main?.focus({ preventScroll: true })
    })

    const handlePageHide = () => saveScrollPosition(routeKey)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      saveScrollPosition(routeKey)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [routeKey])
}
