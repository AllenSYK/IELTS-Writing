'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useMotionPreference } from '@/components/interaction-system'
import { PricingWaterfall } from './PricingWaterfall'

/** Enhances server-rendered content; everything stays visible without JavaScript. */
export function PricingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null)
  const { enabled: reducedMotion } = useMotionPreference()

  useEffect(() => {
    const root = rootRef.current
    if (!root || reducedMotion) return

    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-pricing-reveal]'))
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const section = entry.target as HTMLElement
        section.dataset.pricingReveal = 'visible'
        observer?.unobserve(entry.target)
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' })

    if (observer) {
      for (const section of sections) {
        section.dataset.pricingReveal = 'pending'
        observer.observe(section)
      }
    }

    // Keyboard navigation must never focus an element in a hidden reveal group.
    const revealFocusedContent = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return
      const section = event.target.closest<HTMLElement>('[data-pricing-reveal]')
      if (section) {
        section.dataset.pricingReveal = 'focused'
        observer?.unobserve(section)
      }
    }
    root.addEventListener('focusin', revealFocusedContent)

    const scrollContainer = root.closest<HTMLElement>('.app-route-root')
    let scrollFrame = 0
    const updateParallax = () => {
      scrollFrame = 0
      const offset = Math.max(0, Math.min((scrollContainer?.scrollTop ?? window.scrollY) * 0.12, 90))
      root.style.setProperty('--pricing-drift', `${offset}px`)
    }
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateParallax)
    }
    const scrollTarget = scrollContainer ?? window
    scrollTarget.addEventListener('scroll', onScroll, { passive: true })
    updateParallax()

    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-pricing-spotlight]'))
    let pointerFrame = 0
    let pointer: { card: HTMLElement; x: number; y: number } | null = null
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer = { card: event.currentTarget as HTMLElement, x: event.clientX, y: event.clientY }
      if (pointerFrame) return
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0
        if (!pointer) return
        const { card, x, y } = pointer
        const bounds = card.getBoundingClientRect()
        card.style.setProperty('--spotlight-x', `${x - bounds.left}px`)
        card.style.setProperty('--spotlight-y', `${y - bounds.top}px`)
        card.dataset.spotlightActive = 'true'
      })
    }
    const onPointerLeave = (event: PointerEvent) => {
      const card = event.currentTarget as HTMLElement
      card.removeAttribute('data-spotlight-active')
      pointer = null
      cancelAnimationFrame(pointerFrame)
      pointerFrame = 0
    }
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      for (const card of cards) {
        card.addEventListener('pointermove', onPointerMove, { passive: true })
        card.addEventListener('pointerleave', onPointerLeave)
      }
    }

    return () => {
      observer?.disconnect()
      root.removeEventListener('focusin', revealFocusedContent)
      scrollTarget.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(scrollFrame)
      cancelAnimationFrame(pointerFrame)
      root.style.removeProperty('--pricing-drift')
      for (const section of sections) section.dataset.pricingReveal = ''
      for (const card of cards) {
        card.removeEventListener('pointermove', onPointerMove)
        card.removeEventListener('pointerleave', onPointerLeave)
        card.removeAttribute('data-spotlight-active')
        card.style.removeProperty('--spotlight-x')
        card.style.removeProperty('--spotlight-y')
      }
    }
  }, [reducedMotion])

  return <main ref={rootRef} className="pricing-page pricing-motion" data-main-content tabIndex={-1}>{children}<PricingWaterfall /></main>
}
