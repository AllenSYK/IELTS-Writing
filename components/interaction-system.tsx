'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { MaterialIcon } from '@/components/app-ui'
import { useOnlineStatus } from '@/components/browser-hooks'
import { readStorageValue } from '@/lib/user-storage'
import { useScrollAndFocusRestoration } from './scroll-restoration'
import {
  ToastContext,
  ToastViewport,
  useToast,
  useToastState
} from './toast-system'
import { CommandPalette } from './command-palette'

export { useToast } from './toast-system'
export type { ToastInput, ToastContextValue } from './toast-system'

const ReducedMotionStorageKey = 'ielts-writing-reduced-motion'

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function useReducedMotionPreference() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const stored = readStorageValue(window.localStorage, ReducedMotionStorageKey)
    const update = () => {
      const next = stored === 'true' || (stored === null && media.matches)
      setEnabled(next)
      document.documentElement.classList.toggle('reduce-motion', next)
    }
    update()

    const handleMedia = () => {
      if (window.localStorage.getItem(ReducedMotionStorageKey) === null) {
        setEnabled(media.matches)
        document.documentElement.classList.toggle('reduce-motion', media.matches)
      }
    }
    media.addEventListener('change', handleMedia)
    return () => media.removeEventListener('change', handleMedia)
  }, [])

  const setPreference = useCallback((value: boolean) => {
    window.localStorage.setItem(ReducedMotionStorageKey, String(value))
    setEnabled(value)
    document.documentElement.classList.toggle('reduce-motion', value)
  }, [])

  return { enabled, setPreference }
}

export function useMotionPreference() {
  const context = useContext(MotionContext)
  if (!context) throw new Error('useMotionPreference must be used inside AppInteractionProvider')
  return context
}

const MotionContext = createContext<ReturnType<typeof useReducedMotionPreference> | null>(null)

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debounced
}

export function useNetworkStatus() {
  return useOnlineStatus()
}

function GlobalShortcuts({ onCommand }: { onCommand: () => void }) {
  const router = useRouter()

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onCommand()
        return
      }
      if (modifier && event.key === '1') {
        event.preventDefault()
        router.push('/write/task1')
        return
      }
      if (modifier && event.key === '2') {
        event.preventDefault()
        router.push('/write/task2')
        return
      }
      if (modifier && event.key === ',') {
        event.preventDefault()
        router.push('/settings')
        return
      }
      if (event.key === '/' && !modifier && !isTypingTarget(event.target)) {
        const search = document.querySelector<HTMLInputElement>('[data-search-input]')
        if (search) {
          event.preventDefault()
          search.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCommand, router])

  return null
}

function NetworkBanner({ online }: { online: boolean }) {
  const wasOffline = useRef(false)
  const { pushToast } = useToast()

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      return
    }
    if (wasOffline.current) {
      pushToast({ kind: 'success', title: '网络已恢复', message: '本地草稿会继续保留并可重新同步。' })
      wasOffline.current = false
    }
  }, [online, pushToast])

  if (online) return null

  return (
    <div className="network-banner" role="status">
      <MaterialIcon name="wifi_off" size={18} />
      <span>当前离线。写作可继续，本地草稿不会丢失。</span>
    </div>
  )
}

export function AppInteractionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const routeKey = pathname
  const [commandOpen, setCommandOpen] = useState(false)
  const online = useOnlineStatus()
  const motion = useReducedMotionPreference()
  const { toasts, dismissToast, context: toastContext } = useToastState()

  useScrollAndFocusRestoration(routeKey)

  return (
    <ToastContext.Provider value={toastContext}>
      <MotionContext.Provider value={motion}>
        <GlobalShortcuts onCommand={() => setCommandOpen(true)} />
        <NetworkBanner online={online} />
        <div className="route-stage" data-route-key={routeKey}>
          {children}
        </div>
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <ToastViewport toasts={toasts} dismissToast={dismissToast} />
      </MotionContext.Provider>
    </ToastContext.Provider>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'default',
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.requestAnimationFrame(() => confirmRef.current?.focus())
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [onCancel, open])

  if (!open) return null

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={tone === 'danger' ? undefined : onCancel}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={`confirm-icon ${tone}`}>
          <MaterialIcon name={tone === 'danger' ? 'warning' : 'info'} size={22} />
        </span>
        <div>
          <h2 id="confirm-title" className="ui-title-md">
            {title}
          </h2>
          <p id="confirm-message" className="ui-body-md">
            {message}
          </p>
        </div>
        <div className="confirm-actions">
          <button className="ui-secondary-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={tone === 'danger' ? 'danger-action-button' : 'ui-primary-button'}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export function AsyncButton({
  children,
  icon,
  loading,
  success,
  error,
  disabledReason,
  className = 'ui-primary-button',
  onClick,
  type = 'button',
  disabled
}: {
  children: ReactNode
  icon?: string
  loading?: boolean
  success?: boolean
  error?: boolean
  disabledReason?: string
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const isDisabled = Boolean(disabled || loading || disabledReason)
  return (
    <button
      className={`${className} async-button ${loading ? 'is-loading' : ''} ${success ? 'is-success' : ''} ${error ? 'is-error' : ''}`}
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={disabledReason ? 'button-disabled-reason' : undefined}
      title={disabledReason}
    >
      <span className="async-button-content">
        <MaterialIcon name={loading ? 'progress_activity' : success ? 'check_circle' : error ? 'error' : icon || 'arrow_forward'} size={18} />
        <span>{children}</span>
      </span>
      {disabledReason ? (
        <span id="button-disabled-reason" className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </button>
  )
}

export function EmptyState({ title, message, href, action }: { title: string; message: string; href?: string; action?: string }) {
  return (
    <section className="empty-state refined-empty" aria-live="polite">
      <MaterialIcon name="inbox" size={28} />
      <h2 className="ui-title-md">{title}</h2>
      <p className="ui-body-md">{message}</p>
      {href && action ? (
        <Link className="ui-primary-button" href={href}>
          {action}
        </Link>
      ) : null}
    </section>
  )
}

export function handleRovingNavKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const container = event.currentTarget
  const links = Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
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
