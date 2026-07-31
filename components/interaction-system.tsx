'use client'

import { usePathname } from 'next/navigation'
import { readStorageValue } from '@/lib/user-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { MaterialIcon } from '@/components/app-ui'

type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading'

type Toast = {
  id: string
  kind: ToastKind
  title: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

type ToastInput = Omit<Toast, 'id'>

type ToastContextValue = {
  pushToast: (toast: ToastInput) => string
  dismissToast: (id: string) => void
  updateToast: (id: string, toast: Partial<ToastInput>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const ReducedMotionStorageKey = 'ielts-writing-reduced-motion'
const CommandRecentsStorageKey = 'ielts-writing-command-recents-v1'

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function useScrollAndFocusRestoration(routeKey: string) {
  useEffect(() => {
    window.requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>('[data-main-content], main')
      if (main && !main.hasAttribute('tabindex')) {
        main.setAttribute('tabindex', '-1')
      }
      main?.focus({ preventScroll: true })
    })
  }, [routeKey])
}

function useOnlineState() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
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

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside AppInteractionProvider')
  return context
}

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debounced
}

export function useNetworkStatus() {
  return useOnlineState()
}

function ToastViewport({ toasts, dismissToast }: { toasts: Toast[]; dismissToast: (id: string) => void }) {
  return (
    <div className="toast-viewport" role="region" aria-label="状态通知">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">
            <MaterialIcon
              name={
                toast.kind === 'success'
                  ? 'check_circle'
                  : toast.kind === 'error'
                    ? 'error'
                    : toast.kind === 'warning'
                      ? 'warning'
                      : toast.kind === 'loading'
                        ? 'progress_activity'
                        : 'info'
              }
              size={18}
            />
          </span>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.message ? <span>{toast.message}</span> : null}
          </div>
          {toast.actionLabel && toast.onAction ? (
            <button className="toast-action" type="button" onClick={toast.onAction}>
              {toast.actionLabel}
            </button>
          ) : null}
          <button className="toast-close" type="button" aria-label="关闭通知" onClick={() => dismissToast(toast.id)}>
            <MaterialIcon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

type CommandAction = {
  id: string
  title: string
  subtitle: string
  icon: string
  href?: string
  run?: () => void
  keywords: string
}

function readRecents() {
  try {
    const parsed: unknown = JSON.parse(readStorageValue(window.localStorage, CommandRecentsStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(id: string) {
  const next = [id, ...readRecents().filter((item) => item !== id)].slice(0, 5)
  window.localStorage.setItem(CommandRecentsStorageKey, JSON.stringify(next))
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const actions = useMemo<CommandAction[]>(
    () => [
      { id: 'home', title: '前往首页', subtitle: '打开账号中心', icon: 'home', href: '/dashboard', keywords: 'home 首页 账号中心' },
      { id: 'task1', title: '开始 Task 1', subtitle: '20 分钟图表写作', icon: 'bar_chart', href: '/write/task1', keywords: 'task 1 academic graph' },
      { id: 'task2', title: '开始 Task 2', subtitle: '40 分钟议论文', icon: 'edit_document', href: '/write/task2', keywords: 'task 2 essay writing' },
      { id: 'mock', title: '开始完整模考', subtitle: '60 分钟 Task 1 + Task 2', icon: 'timer', href: '/write/mock', keywords: 'mock test 完整 模考' },
      { id: 'history', title: '查看历史', subtitle: '搜索和筛选真实批改记录', icon: 'history', href: '/history', keywords: 'history 历史 records' },
      { id: 'analytics', title: '查看分析', subtitle: '分数趋势与错误分布', icon: 'analytics', href: '/analytics', keywords: 'analytics stats analysis 分析' },
      { id: 'settings', title: '账号中心', subtitle: '账号设置和激活信息', icon: 'manage_accounts', href: '/dashboard', keywords: 'settings preference 设置 账号' },
      {
        id: 'draft',
        title: '查看当前草稿',
        subtitle: '打开草稿记录并选择要继续的练习',
        icon: 'draft',
        run: () => window.location.assign('/practice?drafts=1'),
        keywords: 'draft 草稿 current'
      },
      {
        id: 'search-history',
        title: '搜索历史记录',
        subtitle: '跳转到历史并带上当前搜索词',
        icon: 'search',
        run: () => window.location.assign(`/history${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`),
        keywords: 'search history 搜索 历史'
      }
    ],
    [query]
  )

  const recents = useMemo(() => (open ? readRecents() : []), [open])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const source = normalized
      ? actions.filter((action) => `${action.title} ${action.subtitle} ${action.keywords}`.toLowerCase().includes(normalized))
      : actions
    return source.slice().sort((a, b) => recents.indexOf(b.id) - recents.indexOf(a.id))
  }, [actions, query, recents])

  const runAction = useCallback(
    (action: CommandAction | undefined) => {
      if (!action) return
      writeRecent(action.id)
      onOpenChange(false)
      setQuery('')
      setSelected(0)
      if (action.href) window.location.assign(action.href)
      else action.run?.()
    },
    [onOpenChange]
  )

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => {
      setSelected(0)
      inputRef.current?.focus()
    })
  }, [open])

  if (!open) return null

  return (
    <div className="command-layer" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="快速导航"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input-row">
          <MaterialIcon name="search" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onOpenChange(false)
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelected((current) => Math.min(filtered.length - 1, current + 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((current) => Math.max(0, current - 1))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                runAction(filtered[selected])
              }
            }}
            placeholder="搜索页面、草稿或操作"
            aria-controls="command-results"
            aria-activedescendant={filtered[selected] ? `command-${filtered[selected].id}` : undefined}
          />
          <span className="command-kbd">Esc</span>
        </div>
        <div id="command-results" className="command-results" role="listbox">
          {filtered.length > 0 ? (
            filtered.map((action, index) => (
              <button
                id={`command-${action.id}`}
                key={action.id}
                className={`command-item ${selected === index ? 'is-active' : ''}`}
                type="button"
                role="option"
                aria-selected={selected === index}
                onMouseEnter={() => setSelected(index)}
                onClick={() => runAction(action)}
              >
                <span className="command-icon">
                  <MaterialIcon name={action.icon} size={20} />
                </span>
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.subtitle}</small>
                </span>
                {recents.includes(action.id) ? <em>最近</em> : null}
              </button>
            ))
          ) : (
            <div className="command-empty">
              <MaterialIcon name="search_off" size={22} />
              <span>没有匹配结果</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GlobalShortcuts({ onCommand }: { onCommand: () => void }) {

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
        window.location.assign('/write/task1')
        return
      }
      if (modifier && event.key === '2') {
        event.preventDefault()
        window.location.assign('/write/task2')
        return
      }
      if (modifier && event.key === ',') {
        event.preventDefault()
        window.location.assign('/dashboard')
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
  }, [onCommand])

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
  const [toasts, setToasts] = useState<Toast[]>([])
  const [commandOpen, setCommandOpen] = useState(false)
  const online = useOnlineState()
  const motion = useReducedMotionPreference()
  const lastErrorTitles = useRef(new Map<string, number>())

  useScrollAndFocusRestoration(routeKey)

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (input: ToastInput) => {
      const now = Date.now()
      const last = lastErrorTitles.current.get(`${input.kind}:${input.title}`) ?? 0
      if (input.kind === 'error' && now - last < 1200) {
        return ''
      }
      lastErrorTitles.current.set(`${input.kind}:${input.title}`, now)

      const id = createId('toast')
      const toast: Toast = { id, ...input }
      setToasts((current) => [toast, ...current.filter((item) => item.title !== input.title).slice(0, 3)])
      if (input.kind !== 'loading') {
        window.setTimeout(() => dismissToast(id), input.durationMs ?? (input.kind === 'error' ? 7200 : 2800))
      }
      return id
    },
    [dismissToast]
  )

  const updateToast = useCallback((id: string, input: Partial<ToastInput>) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...input } : toast)))
  }, [])

  const context = useMemo(() => ({ pushToast, dismissToast, updateToast }), [dismissToast, pushToast, updateToast])

  const openCommand = useCallback(() => setCommandOpen(true), [])

  return (
    <ToastContext.Provider value={context}>
      <MotionContext.Provider value={motion}>
        <GlobalShortcuts onCommand={openCommand} />
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
  verificationText,
  verificationLabel = '请输入上方账号以确认',
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger' | 'warning' | 'primary'
  verificationText?: string
  verificationLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const verificationRef = useRef<HTMLInputElement>(null)
  const [verificationValue, setVerificationValue] = useState('')

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => {
      setVerificationValue('')
      if (verificationText) verificationRef.current?.focus()
      else confirmRef.current?.focus()
    })
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [onCancel, open, verificationText])

  if (!open) return null

  // 根据 tone 确定图标和按钮样式
  const iconConfig = {
    default: { icon: 'info', buttonClass: 'ui-primary-button' },
    danger: { icon: 'warning', buttonClass: 'danger-action-button' },
    warning: { icon: 'warning', buttonClass: 'warning-action-button' },
    primary: { icon: 'info', buttonClass: 'ui-primary-button' }
  }
  
  const config = iconConfig[tone] || iconConfig.default

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
          <MaterialIcon name={config.icon} size={22} />
        </span>
        <div>
          <h2 id="confirm-title" className="ui-title-md">
            {title}
          </h2>
          <p id="confirm-message" className="ui-body-md">
            {message}
          </p>
        </div>
        {verificationText ? (
          <label className="confirm-verification">
            <span>{verificationLabel}</span>
            <strong>{verificationText}</strong>
            <input
              ref={verificationRef}
              value={verificationValue}
              onChange={(event) => setVerificationValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label={verificationLabel}
            />
          </label>
        ) : null}
        <div className="confirm-actions">
          <button className="ui-secondary-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={config.buttonClass}
            type="button"
            onClick={onConfirm}
            disabled={Boolean(verificationText) && verificationValue !== verificationText}
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
        <a className="ui-primary-button" href={href}>
          {action}
        </a>
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
