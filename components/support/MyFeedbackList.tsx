'use client'

import { useCallback, useEffect, useState } from 'react'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { recordRecentErrorCode } from '@/lib/recent-error-code'

type FeedbackProgressItem = {
  id: string
  displayId: string
  category: string
  subject: string
  status: string
  priority: string
  resolutionNote: string | null
  createdAt: string
  updatedAt: string
  handledAt: string | null
}

const StatusLabels: Record<string, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭'
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN')
  } catch {
    return value
  }
}

export function MyFeedbackList({ refreshToken = 0 }: { refreshToken?: number }) {
  const { userId, status } = useUserSession()
  const [items, setItems] = useState<FeedbackProgressItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/support/feedback?limit=10', { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as {
        ok?: boolean
        items?: FeedbackProgressItem[]
        message?: string
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.message || '反馈进度读取失败，请稍后重试。')
      }
      setItems(data.items ?? [])
    } catch (caught) {
      recordRecentErrorCode('读取我的反馈', caught instanceof Error ? caught.name : 'unknown')
      setError(caught instanceof Error ? caught.message : '反馈进度读取失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    window.queueMicrotask(() => {
      void load()
    })
  }, [load, refreshToken, userId])

  if (status === 'loading') return null
  if (!userId) return null

  return (
    <GlassPanel className="settings-section">
      <div className="settings-section-header">
        <h2 className="ui-title-md">我的反馈</h2>
        <button className="ui-secondary-button" type="button" onClick={() => void load()} disabled={loading}>
          <MaterialIcon name="refresh" size={18} />
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>
      {error ? (
        <div className="settings-message is-error" role="alert">
          {error}
          <button className="ui-secondary-button" type="button" style={{ marginLeft: 12 }} onClick={() => void load()}>重试</button>
        </div>
      ) : null}
      {!error && loading && items.length === 0 ? (
        <p className="ui-body-md">正在读取反馈进度…</p>
      ) : null}
      {!error && !loading && items.length === 0 ? (
        <p className="ui-body-md">暂无反馈记录。提交反馈后，可以在这里查看处理进度。</p>
      ) : null}
      {items.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                border: '1px solid var(--outline-variant, #d6d9e0)',
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 12 }}>{item.displayId}</code>
                <strong className="ui-title-md" style={{ fontSize: 15 }}>{item.subject}</strong>
                <span
                  className="task-badge"
                  style={{
                    marginLeft: 'auto',
                    background: item.status === 'resolved' ? 'rgba(24, 128, 78, 0.1)' : 'rgba(0, 88, 188, 0.1)',
                    color: item.status === 'resolved' ? '#187a4e' : '#0058bc',
                    borderColor: 'transparent'
                  }}
                >
                  {StatusLabels[item.status] || item.status}
                </span>
              </div>
              <div className="ui-label" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{item.category}</span>
                <span>提交于 {formatDateTime(item.createdAt)}</span>
                {item.handledAt ? <span>最近处理 {formatDateTime(item.handledAt)}</span> : null}
              </div>
              {item.resolutionNote ? (
                <p className="ui-body-md" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  <MaterialIcon name="reply" size={16} /> 回复：{item.resolutionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </GlassPanel>
  )
}
