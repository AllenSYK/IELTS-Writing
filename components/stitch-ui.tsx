'use client'

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type NavItem = 'home' | 'ielts' | 'history' | 'analytics' | 'settings'

type IconProps = {
  name: string
  filled?: boolean
  className?: string
  size?: number
}

const navItems: Array<{ id: NavItem; href: string; label: string }> = [
  { id: 'home', href: '/', label: 'Home' },
  { id: 'ielts', href: '/practice', label: 'IELTS' },
  { id: 'history', href: '/history', label: 'History' },
  { id: 'analytics', href: '/analytics', label: 'Analytics' }
]

function handleRovingNavKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
  const currentIndex = links.indexOf(document.activeElement as HTMLElement)
  if (currentIndex < 0) return
  event.preventDefault()
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? links.length - 1
        : (currentIndex + direction + links.length) % links.length
  links[nextIndex]?.focus()
}

export function MaterialIcon({ name, filled = false, className = '', size }: IconProps) {
  const style: CSSProperties = {
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
    ...(size ? { fontSize: size } : {})
  }

  return (
    <span className={`material-symbols-outlined ${className}`} style={style} aria-hidden="true">
      {name}
    </span>
  )
}

export function UserAvatar({ src = '/stitch/asset-03.jpg', alt = 'User avatar' }: { src?: string; alt?: string }) {
  return (
    <span className="stitch-avatar">
      <Image alt={alt} src={src} width={40} height={40} priority unoptimized />
    </span>
  )
}

export function UserNav({ active, avatar = '/stitch/asset-03.jpg' }: { active: NavItem; avatar?: string }) {
  return (
    <>
      <nav className="stitch-top-nav" aria-label="Main Navigation">
        <Link className="stitch-brand" href="/">
          空与梦
        </Link>
        <div className="stitch-nav-links" onKeyDown={handleRovingNavKeyDown}>
          {navItems.map((item) => (
            <Link
              key={item.id}
              className={`stitch-nav-link ${active === item.id ? 'is-active' : ''}`}
              href={item.href}
              aria-current={active === item.id ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="stitch-nav-actions">
          <a
            className="stitch-icon-button"
            href="https://xhslink.com/m/3TO45Vd0bey"
            target="_blank"
            rel="noreferrer"
            title="Xiaohongshu"
            aria-label="Xiaohongshu"
          >
            <MaterialIcon name="share" />
          </a>
          <Link
            className={`stitch-icon-button ${active === 'settings' ? 'is-active' : ''}`}
            href="/settings"
            aria-label="settings"
            aria-current={active === 'settings' ? 'page' : undefined}
          >
            <MaterialIcon name="settings" />
          </Link>
          <UserAvatar src={avatar} />
        </div>
      </nav>

      <nav className="stitch-bottom-nav" aria-label="Mobile Navigation" onKeyDown={handleRovingNavKeyDown}>
        <Link className={active === 'home' ? 'is-active' : ''} href="/" aria-current={active === 'home' ? 'page' : undefined}>
          <MaterialIcon name="home" filled={active === 'home'} />
          <span>Home</span>
        </Link>
        <Link className={active === 'ielts' ? 'is-active' : ''} href="/practice" aria-current={active === 'ielts' ? 'page' : undefined}>
          <MaterialIcon name="edit_note" filled={active === 'ielts'} />
          <span>IELTS</span>
        </Link>
        <Link className={active === 'history' ? 'is-active' : ''} href="/history" aria-current={active === 'history' ? 'page' : undefined}>
          <MaterialIcon name="history" filled={active === 'history'} />
          <span>History</span>
        </Link>
        <Link className={active === 'analytics' ? 'is-active' : ''} href="/analytics" aria-current={active === 'analytics' ? 'page' : undefined}>
          <MaterialIcon name="analytics" filled={active === 'analytics'} />
          <span>Stats</span>
        </Link>
      </nav>
    </>
  )
}

export function StitchFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`stitch-footer ${compact ? 'is-compact' : ''}`}>
      <div className="stitch-footer-brand">NightWish</div>
      <p>© 2026 NightWish AI. All rights reserved.</p>
      <div className="stitch-footer-links">
        <Link href="/support">Support</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </footer>
  )
}

export function GlassPanel({
  children,
  level = 1,
  className = '',
  style
}: {
  children: ReactNode
  level?: 1 | 2
  className?: string
  style?: CSSProperties
}) {
  return (
    <section className={`stitch-glass stitch-glass-${level} ${className}`} style={style}>
      {children}
    </section>
  )
}

export function ScoreRing({
  score,
  color = 'primary',
  label
}: {
  score: string
  color?: 'primary' | 'tertiary' | 'error'
  label?: string
}) {
  const numeric = Number(score.match(/\d+(?:\.\d+)?/)?.[0] ?? 0)
  const circumference = 251.2
  const offset = circumference - (Math.min(Math.max(numeric, 0), 9) / 9) * circumference

  return (
    <div className="score-ring" aria-label={label}>
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" fill="transparent" r="40" strokeWidth="4" />
        <circle
          className={`ring-value ring-${color}`}
          cx="50"
          cy="50"
          fill="transparent"
          r="40"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <span>{score}</span>
    </div>
  )
}
