'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { readStorageValue, userScopedStorageKey } from '@/lib/user-storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MaterialIcon } from '@/components/app-ui'
import type { WritingTaskType } from '@/lib/writing-records'
import { saveScrollPosition } from './scroll-restoration'

type CommandAction = {
  id: string
  title: string
  subtitle: string
  icon: string
  href?: string
  run?: () => void
  keywords: string
}

const CommandRecentsStorageKey = 'ielts-writing-command-recents-v1'

function getDraftMode(userId: string | null): WritingTaskType {
  if (!userId) return 'task2'
  const modes: WritingTaskType[] = ['task2', 'task1', 'mock']
  const found = modes.find((mode) => window.localStorage.getItem(userScopedStorageKey(`ielts-writing-draft-${mode}`, userId))?.trim())
  return found ?? 'task2'
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

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const { userId } = useUserSession()
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
      { id: 'settings', title: '打开设置', subtitle: '账号、快捷键和偏好', icon: 'settings', href: '/settings', keywords: 'settings preference 设置' },
      {
        id: 'draft',
        title: '查看当前草稿',
        subtitle: '打开最近有内容的写作任务',
        icon: 'draft',
        run: () => router.push(`/write/${getDraftMode(userId)}`),
        keywords: 'draft 草稿 current'
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
    [query, router, userId]
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
      saveScrollPosition(`${pathname}${window.location.search}`)
      onOpenChange(false)
      setQuery('')
      setSelected(0)
      if (action.href) router.push(action.href)
      else action.run?.()
    },
    [onOpenChange, pathname, router]
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
