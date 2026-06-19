'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
import { MaterialIcon } from '@/components/stitch-ui'
import type { WritingTaskType } from '@/lib/writing-records'

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

type DesktopUpdateState = {
  status: string
  checking: boolean
  currentVersion?: string
  latestVersion?: string
  updateAvailable?: boolean
  mandatory?: boolean
  minimumSupportedVersion?: string | null
  releaseNotes?: string
  publishedAt?: string | null
  lastCheckedAt?: string | null
  message?: string
  developerContactAvailable?: boolean
}

type ToastContextValue = {
  pushToast: (toast: ToastInput) => string
  dismissToast: (id: string) => void
  updateToast: (id: string, toast: Partial<ToastInput>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const ReducedMotionStorageKey = 'aerowrite-reduced-motion'
const CommandRecentsStorageKey = 'aerowrite-command-recents-v1'

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function saveScrollPosition(routeKey: string) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`aerowrite-scroll:${routeKey}`, String(window.scrollY))
}

function useScrollAndFocusRestoration(routeKey: string) {
  useEffect(() => {
    const stored = window.sessionStorage.getItem(`aerowrite-scroll:${routeKey}`)
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
    const stored = window.localStorage.getItem(ReducedMotionStorageKey)
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

function getDraftMode(): WritingTaskType {
  const modes: WritingTaskType[] = ['task2', 'task1', 'mock']
  const found = modes.find((mode) => window.localStorage.getItem(`aerowrite-draft-${mode}`)?.trim())
  return found ?? 'task2'
}

function readRecents() {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CommandRecentsStorageKey) || '[]')
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
  const router = useRouter()
  const { pushToast, dismissToast } = useToast()
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
      { id: 'settings', title: '打开设置', subtitle: '授权、更新、快捷键和偏好', icon: 'settings', href: '/settings', keywords: 'settings preference 设置' },
      {
        id: 'draft',
        title: '查看当前草稿',
        subtitle: '打开最近有内容的写作任务',
        icon: 'draft',
        run: () => router.push(`/write/${getDraftMode()}`),
        keywords: 'draft 草稿 current'
      },
      {
        id: 'update',
        title: '检查更新',
        subtitle: '在桌面版中检查可用更新',
        icon: 'deployed_code_update',
        run: async () => {
          const id = pushToast({ kind: 'loading', title: '正在检查更新', durationMs: 30000 })
          try {
            const result = await window.desktopUpdater?.checkForUpdates()
            pushToast({ kind: result?.ok === false ? 'warning' : 'success', title: result?.message || '浏览器预览中不可用' })
          } catch (error) {
            pushToast({ kind: 'error', title: '检查更新失败', message: error instanceof Error ? error.message : '请稍后重试。' })
          } finally {
            dismissToast(id)
          }
        },
        keywords: 'update version 检查 更新'
      },
      {
        id: 'search-history',
        title: '搜索历史记录',
        subtitle: '跳转到历史并带上当前搜索词',
        icon: 'search',
        run: () => router.push(`/history${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`),
        keywords: 'search history 搜索 历史'
      }
    ],
    [dismissToast, pushToast, query, router]
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
      saveScrollPosition(`${window.location.pathname}${window.location.search}`)
      onOpenChange(false)
      setQuery('')
      setSelected(0)
      if (action.href) router.push(action.href)
      else action.run?.()
    },
    [onOpenChange, router]
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

function formatUpdateDate(value?: string | null) {
  if (!value) return '未提供'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function GlobalUpdatePrompt() {
  const { pushToast } = useToast()
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null)
  const [dismissedKey, setDismissedKey] = useState('')
  const [contacting, setContacting] = useState(false)

  useEffect(() => {
    window.desktopUpdater?.getState?.().then(setUpdateState).catch(() => undefined)
    const removeStatus = window.desktopUpdater?.onStatus?.((state) => {
      setUpdateState(state)
    })
    return () => removeStatus?.()
  }, [])

  const updateKey = updateState?.latestVersion ? `${updateState.currentVersion || ''}->${updateState.latestVersion}` : ''
  const open = Boolean(updateState?.updateAvailable && updateKey && dismissedKey !== updateKey)
  const promptText = updateState?.mandatory
    ? '当前版本已停止维护，请联系开发者获取最新版本。'
    : updateState?.developerContactAvailable
      ? '请联系开发者获取最新版本'
      : '请联系软件开发者获取最新版本。'

  const closePrompt = useCallback(() => {
    setDismissedKey(updateKey)
    const dismiss = window.desktopUpdater?.dismissUpdate?.()
    dismiss?.catch(() => undefined)
  }, [updateKey])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closePrompt()
    }
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closePrompt, open])

  async function contactDeveloper() {
    setContacting(true)
    try {
      const result = await window.desktopUpdater?.contactDeveloper?.()
      if (result?.ok === false) {
        pushToast({ kind: 'warning', title: result.message || '请联系软件开发者获取最新版本。' })
        return
      }
      closePrompt()
    } catch (error) {
      pushToast({ kind: 'error', title: '无法打开联系方式', message: error instanceof Error ? error.message : '请稍后重试。' })
    } finally {
      setContacting(false)
    }
  }

  if (!open || !updateState) return null

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={closePrompt}>
      <section
        className={`confirm-dialog update-dialog ${updateState.mandatory ? 'is-mandatory' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={`confirm-icon ${updateState.mandatory ? 'danger' : 'default'}`}>
          <MaterialIcon name={updateState.mandatory ? 'priority_high' : 'deployed_code_update'} size={22} />
        </span>
        <div className="update-dialog-content">
          <h2 id="update-dialog-title" className="stitch-title-md">发现新版本</h2>
          <dl className="update-dialog-meta">
            <div><dt>当前版本</dt><dd>{updateState.currentVersion || '未知'}</dd></div>
            <div><dt>最新版本</dt><dd>{updateState.latestVersion || '未知'}</dd></div>
            <div><dt>发布时间</dt><dd>{formatUpdateDate(updateState.publishedAt)}</dd></div>
          </dl>
          <div className="update-dialog-notes">
            <p className="stitch-label">更新说明</p>
            <p>{updateState.releaseNotes || '暂无更新说明'}</p>
          </div>
          <p className={`update-dialog-prompt ${updateState.mandatory ? 'is-mandatory' : ''}`}>{promptText}</p>
        </div>
        <div className="confirm-actions">
          <button className="stitch-secondary-button" type="button" onClick={closePrompt}>
            我知道了
          </button>
          {updateState.developerContactAvailable ? (
            <button className="stitch-primary-button" type="button" onClick={contactDeveloper} disabled={contacting}>
              <MaterialIcon name={contacting ? 'progress_activity' : 'contact_support'} size={18} />
              联系开发者
            </button>
          ) : null}
        </div>
      </section>
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

  return (
    <ToastContext.Provider value={context}>
      <MotionContext.Provider value={motion}>
        <GlobalShortcuts onCommand={() => setCommandOpen(true)} />
        <NetworkBanner online={online} />
        <div className="route-stage" data-route-key={routeKey}>
          {children}
        </div>
        <GlobalUpdatePrompt />
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
          <h2 id="confirm-title" className="stitch-title-md">
            {title}
          </h2>
          <p id="confirm-message" className="stitch-body-md">
            {message}
          </p>
        </div>
        <div className="confirm-actions">
          <button className="stitch-secondary-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={tone === 'danger' ? 'danger-action-button' : 'stitch-primary-button'}
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
  className = 'stitch-primary-button',
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
      <h2 className="stitch-title-md">{title}</h2>
      <p className="stitch-body-md">{message}</p>
      {href && action ? (
        <Link className="stitch-primary-button" href={href}>
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
