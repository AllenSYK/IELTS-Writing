'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  CalendarPlus,
  Eye,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldX,
  Unlink,
  UserRound,
  X
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { maskLicenseCode } from '@/lib/admin/mask-license'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'

type LicenseRef = {
  id: string
  code_value: string | null
  code_prefix: string
  plan: string
  status: string
  expires_at: string | null
  duration_days: number
}

type BindingRow = {
  id: string
  license_id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  binding_status: string
  last_used_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  user_role: string
  license_codes: LicenseRef | null
}

type ConfirmState = {
  title: string
  message: string
  label: string
  action: () => Promise<void>
} | null

type FilterLabels = {
  license: string
  email: string
  user: string
}

type BindingsResponse = {
  success: true
  bindings: BindingRow[]
  total: number
  filterLabels: FilterLabels
}

const statusFilters = [
  ['all', '全部绑定'],
  ['active', '有效绑定'],
  ['expiring', '即将到期'],
  ['expired', '已过期'],
  ['revoked', '已撤销'],
  ['unbound', '已解绑']
] as const

export function AdminBindingsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const licenseId = searchParams.get('licenseId') || ''
  const email = searchParams.get('email') || ''
  const userId = searchParams.get('userId') || ''
  const { pushToast } = useToast()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<BindingRow | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const bindingsKey = useMemo(() => {
    const params = new URLSearchParams({
      pageSize: '200',
      search: debouncedSearch,
      status
    })
    if (licenseId) params.set('licenseId', licenseId)
    if (email) params.set('email', email)
    if (userId) params.set('userId', userId)
    return `/api/admin/bindings?${params.toString()}`
  }, [debouncedSearch, email, licenseId, status, userId])

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<BindingsResponse>(bindingsKey, adminJsonFetcher, { keepPreviousData: true })
  const bindings = data?.bindings || []
  const labels = data?.filterLabels || { license: '', email: '', user: '' }
  const loading = !data && isLoading

  function clearFilter(key: 'licenseId' | 'email' | 'userId') {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(key)
    router.replace(`/admin/bindings${params.size ? `?${params.toString()}` : ''}`)
  }

  async function patchBinding(id: string, action: 'extend' | 'revoke' | 'rebind', days?: number) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/bindings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      pushToast({
        kind: 'success',
        title: action === 'extend' ? '账号有效期已延长' : action === 'revoke' ? '邮箱权限已撤销' : '邮箱已重新绑定'
      })
      setSelected(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '操作失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function unbind(id: string) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/bindings/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '解绑失败。')
      pushToast({ kind: 'success', title: '邮箱已解绑', message: '绑定历史已保留，激活码次数已释放。' })
      setSelected(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '解绑失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function runConfirm() {
    const action = confirm?.action
    setConfirm(null)
    if (action) await action()
  }

  function rebindButton(binding: BindingRow) {
    if (!['unbound', 'revoked', 'expired'].includes(binding.binding_status)) return null
    if (!binding.license_codes || ['disabled', 'revoked', 'expired'].includes(binding.license_codes.status)) return null
    return (
      <button className="admin-icon-button success" type="button" disabled={submitting} onClick={() => void patchBinding(binding.id, 'rebind')} aria-label="重新绑定" title="重新绑定">
        <RotateCcw size={15} />
      </button>
    )
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="EMAIL ACCESS RELATIONSHIPS"
        title="邮箱绑定管理"
        description="查看和管理用户邮箱与激活码之间的绑定关系"
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar admin-binding-filter">
          <label className="admin-search-field">
            <Search size={17} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱、激活码、激活码前缀或用户 ID" />
          </label>
          <div className="admin-filter-tabs" role="tablist" aria-label="邮箱绑定筛选">
            {statusFilters.map(([value, label]) => (
              <button key={value} className={status === value ? 'is-active' : ''} type="button" onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
          <button className="admin-icon-button" type="button" onClick={() => void mutate()} disabled={isValidating} aria-label="刷新">
            <RefreshCw className={isValidating ? 'admin-spin' : ''} size={17} />
          </button>
        </div>

        {licenseId || email || userId ? (
          <div className="admin-filter-tags" aria-label="当前筛选条件">
            {licenseId ? (
              <span>激活码：{maskLicenseCode(labels.license || licenseId)}<button type="button" onClick={() => clearFilter('licenseId')} aria-label="清除激活码筛选"><X size={13} /></button></span>
            ) : null}
            {email ? (
              <span>邮箱：{labels.email || email}<button type="button" onClick={() => clearFilter('email')} aria-label="清除邮箱筛选"><X size={13} /></button></span>
            ) : null}
            {userId ? (
              <span>用户：{labels.user || userId}<button type="button" onClick={() => clearFilter('userId')} aria-label="清除用户筛选"><X size={13} /></button></span>
            ) : null}
          </div>
        ) : null}

        {error ? <AdminError message={error.message || '无法加载邮箱绑定。'} onRetry={() => void mutate()} /> : null}
        {loading ? <AdminTableSkeleton columns={10} rows={7} /> : bindings.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table admin-binding-table">
              <thead>
                <tr>
                  <th>用户邮箱</th><th>激活码</th><th>套餐</th><th>绑定状态</th><th>激活时间</th>
                  <th>账号到期时间</th><th>激活码整体到期时间</th><th>最近使用时间</th><th>用户角色</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((binding) => {
                  const license = binding.license_codes
                  return (
                    <tr key={binding.id}>
                      <td data-label="用户邮箱">
                        <Link className="admin-table-link" href={`/admin/users?userId=${binding.user_id}`}><strong>{binding.email}</strong></Link>
                      </td>
                      <td data-label="激活码">
                        <Link className="admin-table-link" href={`/admin/licenses?licenseId=${license?.id || binding.license_id}`}>
                          <code>{maskLicenseCode(license?.code_value)}</code>
                        </Link>
                      </td>
                      <td data-label="套餐"><span className="admin-plan-pill">{license?.plan || '—'}</span></td>
                      <td data-label="绑定状态"><AdminBadge value={binding.binding_status} /></td>
                      <td data-label="激活时间">{formatAdminDate(binding.activated_at)}</td>
                      <td data-label="账号到期时间">{formatAdminDate(binding.expires_at)}</td>
                      <td data-label="激活码整体到期时间">{formatAdminDate(license?.expires_at, '永不过期')}</td>
                      <td data-label="最近使用时间">{formatAdminDate(binding.last_used_at)}</td>
                      <td data-label="用户角色"><AdminBadge value={binding.user_role} /></td>
                      <td data-label="操作">
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" onClick={() => setSelected(binding)} aria-label="查看详情" title="查看详情"><Eye size={15} /></button>
                          <Link className="admin-icon-button" href={`/admin/users?userId=${binding.user_id}`} aria-label="查看用户" title="查看用户"><UserRound size={15} /></Link>
                          <Link className="admin-icon-button" href={`/admin/licenses?licenseId=${license?.id || binding.license_id}`} aria-label="查看激活码" title="查看激活码"><KeyRound size={15} /></Link>
                          {['active', 'expiring', 'expired'].includes(binding.binding_status) ? (
                            <button className="admin-icon-button success" type="button" disabled={submitting} onClick={() => void patchBinding(binding.id, 'extend', 30)} aria-label="延长有效期" title="延长有效期 30 天"><CalendarPlus size={15} /></button>
                          ) : null}
                          {['active', 'expiring'].includes(binding.binding_status) ? (
                            <button className="admin-icon-button warning" type="button" disabled={submitting} onClick={() => setConfirm({
                              title: '撤销该邮箱的使用权限？',
                              message: `${binding.email} 将立即失去当前激活权限。`,
                              label: '确认撤销',
                              action: () => patchBinding(binding.id, 'revoke')
                            })} aria-label="撤销权限" title="撤销权限"><ShieldX size={15} /></button>
                          ) : null}
                          {binding.binding_status !== 'unbound' ? (
                            <button className="admin-icon-button danger" type="button" disabled={submitting} onClick={() => setConfirm({
                              title: '解绑这个邮箱？',
                              message: '绑定历史会保留，同时释放激活码的一次使用名额。',
                              label: '确认解绑',
                              action: () => unbind(binding.id)
                            })} aria-label="解绑邮箱" title="解绑邮箱"><Unlink size={15} /></button>
                          ) : null}
                          {rebindButton(binding)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <AdminEmpty title="没有符合条件的邮箱绑定" message="调整筛选条件，或等待用户使用激活码完成绑定。" />}
      </section>

      <CenteredDialog
        open={Boolean(selected)}
        title="邮箱绑定详情"
        description="这里管理邮箱与激活码之间的权限关系。"
        className="admin-detail-dialog"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="admin-detail-stack">
            <section className="admin-user-detail-hero">
              <span className="admin-user-avatar large">{selected.email.slice(0, 1).toUpperCase()}</span>
              <div><strong>{selected.email}</strong><small>{selected.user_id}</small></div>
              <AdminBadge value={selected.binding_status} />
            </section>
            <dl className="admin-definition-grid">
              <div><dt>激活码</dt><dd><code>{maskLicenseCode(selected.license_codes?.code_value)}</code></dd></div>
              <div><dt>套餐</dt><dd>{selected.license_codes?.plan || '—'}</dd></div>
              <div><dt>激活时间</dt><dd>{formatAdminDate(selected.activated_at)}</dd></div>
              <div><dt>账号到期时间</dt><dd>{formatAdminDate(selected.expires_at)}</dd></div>
              <div><dt>激活码整体到期时间</dt><dd>{formatAdminDate(selected.license_codes?.expires_at, '永不过期')}</dd></div>
              <div><dt>最近使用时间</dt><dd>{formatAdminDate(selected.last_used_at)}</dd></div>
              <div><dt>用户角色</dt><dd>{selected.user_role === 'admin' ? '管理员' : '普通用户'}</dd></div>
              <div><dt>撤销或解绑原因</dt><dd>{selected.binding_status === 'unbound' ? '管理员已解绑邮箱' : selected.revoked_reason || '—'}</dd></div>
            </dl>
            <div className="admin-dialog-action-grid">
              <Link className="admin-secondary-button" href={`/admin/users?userId=${selected.user_id}`}><UserRound size={15} />查看用户</Link>
              <Link className="admin-secondary-button" href={`/admin/licenses?licenseId=${selected.license_codes?.id || selected.license_id}`}><KeyRound size={15} />查看激活码</Link>
              {['active', 'expiring', 'expired'].includes(selected.binding_status) ? (
                <button className="admin-secondary-button" type="button" disabled={submitting} onClick={() => void patchBinding(selected.id, 'extend', 30)}><CalendarPlus size={15} />延长有效期 30 天</button>
              ) : null}
              {['active', 'expiring'].includes(selected.binding_status) ? (
                <button className="admin-secondary-button danger" type="button" disabled={submitting} onClick={() => setConfirm({
                  title: '撤销该邮箱的使用权限？',
                  message: `${selected.email} 将立即失去当前激活权限。`,
                  label: '确认撤销',
                  action: () => patchBinding(selected.id, 'revoke')
                })}><ShieldX size={15} />撤销权限</button>
              ) : null}
              {selected.binding_status !== 'unbound' ? (
                <button className="admin-secondary-button danger" type="button" disabled={submitting} onClick={() => setConfirm({
                  title: '解绑这个邮箱？',
                  message: '绑定历史会保留，同时释放激活码的一次使用名额。',
                  label: '确认解绑',
                  action: () => unbind(selected.id)
                })}><Unlink size={15} />解绑邮箱</button>
              ) : null}
              {['unbound', 'revoked', 'expired'].includes(selected.binding_status)
                && selected.license_codes
                && !['disabled', 'revoked', 'expired'].includes(selected.license_codes.status) ? (
                <button className="admin-primary-button" type="button" disabled={submitting} onClick={() => void patchBinding(selected.id, 'rebind')}><RotateCcw size={15} />重新绑定</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </CenteredDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </main>
  )
}
