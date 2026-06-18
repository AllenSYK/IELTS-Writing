'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CalendarPlus, Eye, RefreshCw, Search, ShieldX, Unlink } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate, maskLicenseCode } from '@/components/admin/AdminUI'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'

type LicenseRef = {
  id: string
  code_value: string | null
  code_prefix: string
  plan: string
  status: string
}

type Activation = {
  id: string
  license_id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  last_used_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
  license_codes: LicenseRef | LicenseRef[] | null
}

type ConfirmState = { title: string; message: string; label: string; action: () => Promise<void> } | null

export function AdminActivationsClient() {
  const searchParams = useSearchParams()
  const { pushToast } = useToast()
  const [activations, setActivations] = useState<Activation[]>([])
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Activation | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '200', search: debouncedSearch, status })
      const response = await fetch(`/api/admin/activations?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载激活记录。')
      setActivations(data.activations || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载激活记录。')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function patchActivation(id: string, action: 'extend' | 'revoke' | 'restore', days?: number) {
    try {
      const response = await fetch(`/api/admin/activations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      pushToast({ kind: 'success', title: action === 'extend' ? '有效期已延长' : action === 'revoke' ? '激活权限已撤销' : '激活权限已恢复' })
      setSelected(null)
      await load()
    } catch (caught) {
      pushToast({ kind: 'error', title: '操作失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    }
  }

  async function unbind(id: string) {
    try {
      const response = await fetch(`/api/admin/activations/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '解绑失败。')
      pushToast({ kind: 'success', title: '绑定关系已解除' })
      setSelected(null)
      await load()
    } catch (caught) {
      pushToast({ kind: 'error', title: '解绑失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    }
  }

  async function runConfirm() {
    const action = confirm?.action
    setConfirm(null)
    if (action) await action()
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="ACTIVATION RELATIONSHIPS"
        title="激活记录"
        description="清楚查看哪个激活码绑定了哪些邮箱，以及每个账号的独立有效期。"
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar">
          <label className="admin-search-field">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱、完整激活码或前缀" />
          </label>
          <label className="admin-select-field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">全部记录</option>
              <option value="active">有效</option>
              <option value="expiring">即将到期</option>
              <option value="expired">已过期</option>
              <option value="revoked">已撤销</option>
              <option value="suspended">已暂停</option>
            </select>
          </label>
          <button className="admin-icon-button" type="button" onClick={() => void load()} aria-label="刷新">
            <RefreshCw className={loading ? 'admin-spin' : ''} size={17} />
          </button>
        </div>

        {error ? <AdminError message={error} onRetry={() => void load()} /> : null}
        {loading ? <AdminTableSkeleton columns={9} rows={7} /> : activations.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户邮箱</th><th>激活码</th><th>套餐</th><th>激活时间</th><th>账号到期时间</th>
                  <th>状态</th><th>最近使用</th><th>用户 ID</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {activations.map((activation) => {
                  const license = Array.isArray(activation.license_codes) ? activation.license_codes[0] : activation.license_codes
                  return (
                    <tr key={activation.id}>
                      <td><strong>{activation.email}</strong></td>
                      <td><code>{maskLicenseCode(license?.code_value, license?.code_prefix)}</code></td>
                      <td><span className="admin-plan-pill">{license?.plan || '—'}</span></td>
                      <td>{formatAdminDate(activation.activated_at)}</td>
                      <td>{formatAdminDate(activation.expires_at)}</td>
                      <td><AdminBadge value={activation.status} /></td>
                      <td>{formatAdminDate(activation.last_used_at)}</td>
                      <td><code className="admin-id-cell">{activation.user_id}</code></td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" aria-label="查看详情" onClick={() => setSelected(activation)}><Eye size={15} /></button>
                          <button className="admin-icon-button success" type="button" aria-label="延长30天" onClick={() => void patchActivation(activation.id, 'extend', 30)}><CalendarPlus size={15} /></button>
                          <button className="admin-icon-button warning" type="button" aria-label="撤销" onClick={() => setConfirm({
                            title: '撤销这条激活记录？',
                            message: `${activation.email} 将立即失去使用权限。`,
                            label: '确认撤销',
                            action: () => patchActivation(activation.id, 'revoke')
                          })}><ShieldX size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <AdminEmpty title="没有符合条件的激活记录" message="用户成功绑定激活码后，关系会显示在这里。" />}
      </section>

      <CenteredDialog open={Boolean(selected)} title="激活记录详情" description="账号有效期与激活码整体到期时间是两个独立概念。" className="admin-detail-dialog" onClose={() => setSelected(null)}>
        {selected ? (() => {
          const license = Array.isArray(selected.license_codes) ? selected.license_codes[0] : selected.license_codes
          return (
            <div className="admin-detail-stack">
              <section className="admin-license-hero">
                <span className="admin-list-icon"><Eye size={20} /></span>
                <div><strong>{selected.email}</strong><small>{selected.user_id}</small></div>
                <AdminBadge value={selected.status} />
              </section>
              <dl className="admin-definition-grid">
                <div><dt>激活码</dt><dd><code>{maskLicenseCode(license?.code_value, license?.code_prefix)}</code></dd></div>
                <div><dt>套餐</dt><dd>{license?.plan || '—'}</dd></div>
                <div><dt>激活时间</dt><dd>{formatAdminDate(selected.activated_at)}</dd></div>
                <div><dt>账号到期时间</dt><dd>{formatAdminDate(selected.expires_at)}<small>决定该用户可使用到何时</small></dd></div>
                <div><dt>最近使用时间</dt><dd>{formatAdminDate(selected.last_used_at)}</dd></div>
                <div><dt>撤销原因</dt><dd>{selected.revoked_reason || '—'}</dd></div>
              </dl>
              <div className="admin-dialog-action-grid">
                <Link className="admin-secondary-button" href={`/admin/users?search=${encodeURIComponent(selected.email)}`}>查看用户</Link>
                <Link className="admin-secondary-button" href={`/admin/licenses?focus=${license?.id || selected.license_id}`}>查看激活码</Link>
                <button className="admin-secondary-button" type="button" onClick={() => void patchActivation(selected.id, 'extend', 30)}><CalendarPlus size={15} />延长 30 天</button>
                <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                  title: '撤销这条激活记录？',
                  message: `${selected.email} 将立即失去使用权限。`,
                  label: '确认撤销',
                  action: () => patchActivation(selected.id, 'revoke')
                })}><ShieldX size={15} />撤销激活</button>
                <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                  title: '解绑这个账号？',
                  message: '绑定记录将永久删除，并释放一次激活名额。',
                  label: '确认解绑',
                  action: () => unbind(selected.id)
                })}><Unlink size={15} />解绑</button>
              </div>
            </div>
          )
        })() : null}
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
