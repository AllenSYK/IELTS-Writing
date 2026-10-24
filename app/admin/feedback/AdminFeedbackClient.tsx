'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Eye, Loader2, RefreshCw, Search } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { ADMIN_CACHE_KEYS } from '@/components/admin/AdminDataProvider'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminApiRequest, AdminApiError, adminJsonFetcher } from '@/lib/admin/fetch-json'

type FeedbackStatus = 'pending' | 'reviewing' | 'resolved' | 'closed'

type FeedbackItem = {
  id: string
  displayId: string
  category: string
  subject: string
  message: string
  contactEmail: string | null
  userId: string | null
  status: FeedbackStatus
  priority: string
  adminNote: string | null
  resolutionNote: string | null
  appVersion: string | null
  platform: string | null
  osVersion: string | null
  diagnostics: Record<string, unknown> | null
  handledAt: string | null
  createdAt: string
  updatedAt: string
}

type FeedbackResponse = {
  success: true
  items: FeedbackItem[]
  total: number
  page: number
  limit: number
  stats: { total: number; pending: number; reviewing: number; resolved: number; closed: number }
}

const statusOptions = [
  ['all', '全部状态'],
  ['pending', '待处理'],
  ['reviewing', '处理中'],
  ['resolved', '已解决'],
  ['closed', '已关闭']
] as const

const priorityOptions = [
  ['all', '全部优先级'],
  ['urgent', '紧急'],
  ['high', '高'],
  ['normal', '普通'],
  ['low', '低']
] as const

const statusLabels: Record<string, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭'
}

const nextStatusActions: Array<{ status: FeedbackStatus; label: string }> = [
  { status: 'reviewing', label: '标记为处理中' },
  { status: 'resolved', label: '标记为已解决' },
  { status: 'closed', label: '关闭反馈' }
]

export function AdminFeedbackClient() {
  const { pushToast } = useToast()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [resolutionNote, setResolutionNote] = useState('')
  const [saving, setSaving] = useState(false)

  const listKey = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (status !== 'all') params.set('status', status)
    if (priority !== 'all') params.set('priority', priority)
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
    return `${ADMIN_CACHE_KEYS.FEEDBACK}?${params.toString()}`
  }, [debouncedSearch, page, priority, status])

  const { data, error, isLoading, mutate } = useSWR<FeedbackResponse>(
    listKey,
    adminJsonFetcher,
    { dedupingInterval: 5000, keepPreviousData: true }
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const limit = data?.limit ?? 20
  const loading = !data && isLoading
  const totalPages = Math.max(1, Math.ceil(total / limit))

  function openDetail(item: FeedbackItem) {
    setSelected(item)
    setAdminNote(item.adminNote || '')
    setResolutionNote(item.resolutionNote || '')
  }

  async function updateFeedback(statusValue?: FeedbackStatus) {
    if (!selected || saving) return
    setSaving(true)
    try {
      await adminApiRequest<{ success: boolean }>(`/api/admin/feedback`, 'PATCH', {
        id: selected.id,
        ...(statusValue ? { status: statusValue } : {}),
        adminNote,
        resolutionNote
      })
      pushToast({
        kind: 'success',
        title: statusValue ? `已${statusLabels[statusValue]}` : '处理记录已保存'
      })
      setSelected(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: '更新失败',
        message: caught instanceof AdminApiError ? caught.message : '请稍后重试。'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="SUPPORT FEEDBACK"
        title="用户反馈"
        description="查看用户提交的反馈工单，更新处理状态并记录处理结果。"
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar">
          <label className="admin-search-field">
            <Search size={17} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="搜索标题或描述"
              aria-label="搜索反馈"
            />
          </label>
          <div className="admin-filter-tabs" role="tablist" aria-label="反馈状态筛选">
            {statusOptions.map(([value, label]) => (
              <button
                key={value}
                className={status === value ? 'is-active' : ''}
                type="button"
                onClick={() => {
                  setStatus(value)
                  setPage(1)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            className="admin-field"
            style={{ width: 'auto', minWidth: 120 }}
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value)
              setPage(1)
            }}
            aria-label="按优先级筛选"
          >
            {priorityOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="admin-icon-button" type="button" onClick={() => void mutate()} aria-label="刷新" title="刷新">
            <RefreshCw size={15} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--admin-muted, #6b7280)' }}>共 {total} 条</span>
        </div>

        {error ? <AdminError message={error.message || '无法加载用户反馈。'} onRetry={() => void mutate()} /> : null}
        {loading ? <AdminTableSkeleton columns={7} rows={6} /> : items.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>分类</th>
                  <th>标题</th>
                  <th>提交用户</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="编号"><code>{item.displayId}</code></td>
                    <td data-label="分类">{item.category}</td>
                    <td data-label="标题"><strong>{item.subject}</strong></td>
                    <td data-label="提交用户">{item.contactEmail || (item.userId ? '已登录用户' : '匿名')}</td>
                    <td data-label="优先级"><AdminBadge value={item.priority} /></td>
                    <td data-label="状态"><AdminBadge value={statusLabels[item.status] || item.status} /></td>
                    <td data-label="提交时间">{formatAdminDate(item.createdAt)}</td>
                    <td data-label="操作">
                      <div className="admin-row-actions">
                        <button className="admin-icon-button" type="button" onClick={() => openDetail(item)} aria-label="查看与处理" title="查看与处理">
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <AdminEmpty title="没有符合条件的反馈" message="调整筛选条件，或等待用户提交新的反馈。" />}

        {totalPages > 1 ? (
          <div className="admin-pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="admin-secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              上一页
            </button>
            <span style={{ alignSelf: 'center', fontSize: 13 }}>{page} / {totalPages}</span>
            <button className="admin-secondary-button" type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              下一页
            </button>
          </div>
        ) : null}
      </section>

      <CenteredDialog
        open={Boolean(selected)}
        title={selected ? `${selected.displayId} · ${selected.subject}` : ''}
        onClose={() => setSelected(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="admin-secondary-button" type="button" disabled={saving} onClick={() => void updateFeedback()}>
              {saving ? <Loader2 className="admin-spin" size={15} /> : null}
              保存处理记录
            </button>
            {nextStatusActions
              .filter((action) => action.status !== selected?.status)
              .map((action) => (
                <button
                  key={action.status}
                  className="admin-primary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => void updateFeedback(action.status)}
                >
                  {action.label}
                </button>
              ))}
          </div>
        }
      >
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <section>
              <h3 className="admin-settings-heading" style={{ marginBottom: 6 }}>反馈内容</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{selected.message}</p>
            </section>
            <section>
              <h3 className="admin-settings-heading" style={{ marginBottom: 6 }}>提交信息</h3>
              <p style={{ margin: 0 }}>
                分类：{selected.category}｜优先级：{selected.priority}｜状态：{statusLabels[selected.status] || selected.status}
              </p>
              <p style={{ margin: '4px 0 0' }}>
                联系邮箱：{selected.contactEmail || '未提供'}｜提交时间：{formatAdminDate(selected.createdAt)}
              </p>
              <p style={{ margin: '4px 0 0' }}>
                环境：{selected.appVersion || '未提供'}｜{selected.platform || '未提供'}
              </p>
              {selected.handledAt ? (
                <p style={{ margin: '4px 0 0' }}>最近处理时间：{formatAdminDate(selected.handledAt)}</p>
              ) : null}
            </section>
            <label className="admin-field">
              <span>处理记录（内部备注）</span>
              <textarea
                rows={3}
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder="记录排查过程、处理方案等"
              />
            </label>
            <label className="admin-field">
              <span>回复用户内容（可选）</span>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                placeholder="用户将能看到这段说明"
              />
            </label>
          </div>
        ) : null}
      </CenteredDialog>
    </main>
  )
}
