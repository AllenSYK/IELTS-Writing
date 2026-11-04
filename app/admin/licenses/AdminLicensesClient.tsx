'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  RefreshCw,
  Search,
  ShieldX,
  UsersRound
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { maskLicensePrefix } from '@/lib/admin/mask-license'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import { useAdminSettings } from '@/lib/admin/admin-settings'

type LicenseRow = {
  id: string
  code_prefix: string
  plan: string
  duration_days: number
  max_activations: number
  activation_count: number
  remaining_count: number
  status: string
  expires_at: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type LicensesResponse = {
  success: true
  licenses: LicenseRow[]
  total: number
}

type ConfirmState = {
  title: string
  message: string
  label: string
  verificationText?: string
  action: () => Promise<void>
} | null

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['\ufeff', rows.map((row) => row.map(csvEscape).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AdminLicensesClient() {
  const searchParams = useSearchParams()
  const focusedId = searchParams.get('licenseId') || searchParams.get('focus') || ''
  const { pushToast } = useToast()
  const { settings: adminSettings } = useAdminSettings()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [page, setPage] = useState(1)
  const [, setSubmitting] = useState(false)
  const [selection, setSelection] = useState<{ routeFocus: string; id: string | null }>({
    routeFocus: focusedId,
    id: focusedId || null
  })
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const licensesKey = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(Math.min(Math.max(adminSettings.pageSize, 10), 200)),
      search: debouncedSearch,
      status,
      plan
    })
    if (focusedId) params.set('licenseId', focusedId)
    return `/api/admin/licenses/list?${params.toString()}`
  }, [adminSettings.pageSize, debouncedSearch, focusedId, page, plan, status])

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<LicensesResponse>(licensesKey, adminJsonFetcher, { keepPreviousData: true })
  const licenses = data?.licenses || []
  const loading = !data && isLoading
  const selectedId = selection.routeFocus === focusedId ? selection.id : focusedId || null
  const selected = licenses.find((item) => item.id === selectedId) || null

  function setSelected(license: LicenseRow | null) {
    setSelection({ routeFocus: focusedId, id: license?.id || null })
  }

  async function updateLicense(id: string, patch: Record<string, unknown>, success: string) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/licenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '更新失败。')
      pushToast({ kind: 'success', title: success })
      setSelected(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '操作失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function copyText(value: string, title = '已复制') {
    await navigator.clipboard.writeText(value)
    pushToast({ kind: 'success', title })
  }

  async function exportAll() {
    // 按完整筛选条件导出，不再局限于当前已加载的一页数据。
    const params = new URLSearchParams({
      export: '1',
      pageSize: '200',
      search: debouncedSearch,
      status,
      plan
    })
    if (focusedId) params.set('licenseId', focusedId)
    try {
      const payload = await adminJsonFetcher<LicensesResponse>(`/api/admin/licenses/list?${params.toString()}`)
      const rows = payload.licenses || []
      downloadCsv(`license-codes-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['激活码', '套餐', '状态', '已使用次数', '最大激活次数', '剩余次数', '用户有效天数', '激活码整体到期时间', '创建时间', '备注'],
        ...rows.map((license) => [
          maskLicensePrefix(license.code_prefix),
          license.plan,
          license.status,
          license.activation_count,
          license.max_activations,
          license.remaining_count,
          license.duration_days,
          license.expires_at || '',
          license.created_at,
          license.note || ''
        ])
      ])
      pushToast({ kind: 'success', title: `已脱敏导出 ${rows.length} 条筛选结果` })
    } catch (caught) {
      pushToast({
        kind: 'error',
        title: '导出失败',
        message: caught instanceof Error ? caught.message : '请稍后重试。'
      })
    }
  }

  async function runConfirm() {
    const action = confirm?.action
    setConfirm(null)
    if (action) await action()
  }

  async function revealLicenseCode(id: string): Promise<string | null> {
    // 如果已经显示，则隐藏
    if (revealed.has(id)) {
      setRevealed((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      return null
    }
    
    // 否则通过 API 获取完整码
    try {
      const response = await fetch(`/api/admin/licenses/${id}/reveal`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || '获取完整激活码失败')
      }
      
      // 将完整码存储到临时状态
      setRevealedCodes(prev => ({ ...prev, [id]: data.code_value }))
      setRevealed((current) => {
        const next = new Set(current)
        next.add(id)
        return next
      })
      
      // 5 分钟后自动隐藏
      setTimeout(() => {
        setRevealedCodes(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setRevealed((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }, 5 * 60 * 1000)
      return data.code_value as string
    } catch (caught) {
      pushToast({ 
        kind: 'error', 
        title: '获取完整激活码失败', 
        message: caught instanceof Error ? caught.message : '请稍后重试' 
      })
      return null
    }
  }

  async function copyLicenseCode(id: string) {
    const code = revealedCodes[id] || await revealLicenseCode(id)
    if (code) await copyText(code)
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="LICENSE ASSETS"
        title="历史权益"
        description="查看和管理已有授权记录。激活码开通及生成功能已停用，现有有效权益继续保留。"
        actions={(
          <>
            <button className="admin-secondary-button" type="button" onClick={() => void exportAll()} disabled={!licenses.length}>
              <Download size={16} />导出全部筛选结果（已脱敏）
            </button>
            <span className="admin-meta">仅管理历史权益</span>
          </>
        )}
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar">
          <label className="admin-search-field">
            <Search size={17} aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="搜索完整激活码、前缀、套餐或备注" />
          </label>
          <label className="admin-select-field">
            <span>状态</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
              <option value="all">全部状态</option>
              <option value="unused">未使用</option>
              <option value="partial">部分使用</option>
              <option value="exhausted">已用完</option>
              <option value="expired">已过期</option>
              <option value="disabled">已禁用</option>
              <option value="revoked">已撤销</option>
            </select>
          </label>
          <label className="admin-select-field">
            <span>套餐</span>
            <select value={plan} onChange={(event) => { setPlan(event.target.value); setPage(1) }}>
              <option value="all">全部套餐</option>
              <option value="standard">Standard</option>
              <option value="pro">Pro</option>
              <option value="premium">Premium</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="admin-icon-button" type="button" onClick={() => void mutate()} disabled={isValidating} aria-label="刷新">
            <RefreshCw className={isValidating ? 'admin-spin' : ''} size={17} />
          </button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--admin-muted, #6b7280)' }}>
            共 {data?.total ?? licenses.length} 条
          </span>
        </div>

        {error ? <AdminError message={error.message || '无法加载激活码。'} onRetry={() => void mutate()} /> : null}
        {loading ? <AdminTableSkeleton columns={11} rows={7} /> : licenses.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table admin-license-table">
              <thead>
                <tr>
                  <th>激活码</th><th>套餐</th><th>状态</th><th>已使用次数</th><th>最大激活次数</th>
                  <th>剩余次数</th><th>用户有效天数</th><th>激活码整体到期时间</th><th>创建时间</th><th>备注</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => {
                  const visible = revealed.has(license.id)
                  const fullCode = revealedCodes[license.id]
                  return (
                    <tr key={license.id}>
                      <td data-label="激活码">
                        <div className="admin-code-cell">
                          <code>{visible && fullCode ? fullCode : maskLicensePrefix(license.code_prefix)}</code>
                          <button type="button" onClick={() => void revealLicenseCode(license.id)} aria-label={visible ? '隐藏激活码' : '显示激活码'}>
                            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {visible && fullCode ? <button type="button" onClick={() => void copyText(fullCode)} aria-label="复制激活码"><Copy size={14} /></button> : null}
                        </div>
                      </td>
                      <td data-label="套餐"><span className="admin-plan-pill">{license.plan}</span></td>
                      <td data-label="状态"><AdminBadge value={license.status} /></td>
                      <td data-label="已使用次数"><strong>{license.activation_count}</strong></td>
                      <td data-label="最大激活次数">{license.max_activations}</td>
                      <td data-label="剩余次数">{license.remaining_count}</td>
                      <td data-label="用户有效天数">{license.duration_days} 天</td>
                      <td data-label="激活码整体到期时间">{formatAdminDate(license.expires_at, '永不过期')}</td>
                      <td data-label="创建时间">{formatAdminDate(license.created_at)}</td>
                      <td data-label="备注"><span className="admin-note-cell" title={license.note || ''}>{license.note || '—'}</span></td>
                      <td data-label="操作">
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" onClick={() => setSelected(license)} aria-label="查看详情" title="查看详情"><FileText size={15} /></button>
                          <a className="admin-icon-button" href={`/admin/bindings?licenseId=${license.id}`} aria-label="查看绑定记录" title="查看绑定记录"><UsersRound size={15} /></a>
                          {license.status === 'disabled' ? (
                            <button className="admin-icon-button success" type="button" onClick={() => void updateLicense(license.id, { status: license.activation_count ? 'active' : 'unused' }, '激活码已启用')} aria-label="启用" title="启用">
                              <CheckCircle2 size={15} />
                            </button>
                          ) : license.status !== 'revoked' ? (
                            <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                              title: '禁用这个激活码？',
                              message: '已绑定用户将暂停使用权限，重新启用后可恢复。',
                              label: '确认禁用',
                              action: () => updateLicense(license.id, { status: 'disabled' }, '激活码已禁用')
                            })} aria-label="禁用" title="禁用"><Ban size={15} /></button>
                          ) : null}
                          {license.status !== 'revoked' ? (
                            <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                              title: '不可逆地撤销这个激活码？',
                              message: '该激活码及相关邮箱权限会立即失效，记录会保留且不能重新启用。',
                              label: '确认永久撤销',
                              verificationText: license.code_prefix,
                              action: () => updateLicense(license.id, { status: 'revoked' }, '激活码已撤销')
                            })} aria-label="撤销" title="撤销"><ShieldX size={15} /></button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminEmpty
            title="没有符合条件的历史权益"
            message="可以调整筛选条件查看已有记录。"
          />
        )}

        {(data?.total ?? 0) > Math.min(Math.max(adminSettings.pageSize, 10), 200) ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <button className="admin-secondary-button" type="button" disabled={page <= 1 || isValidating} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              上一页
            </button>
            <span style={{ fontSize: 13 }}>
              第 {page} / {Math.max(1, Math.ceil((data?.total ?? 0) / Math.min(Math.max(adminSettings.pageSize, 10), 200)))} 页，共 {data?.total ?? 0} 条
            </span>
            <button
              className="admin-secondary-button"
              type="button"
              disabled={isValidating || page >= Math.ceil((data?.total ?? 0) / Math.min(Math.max(adminSettings.pageSize, 10), 200))}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>

      <CenteredDialog
        open={Boolean(selected)}
        title="激活码详情"
        description="这里只展示激活码资产信息；邮箱关系在邮箱绑定页面管理。"
        className="admin-detail-dialog"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="admin-detail-stack">
            <section className="admin-license-hero">
              <span className="admin-list-icon"><KeyRound size={20} /></span>
              <div>
                <code>{revealedCodes[selected.id] || maskLicensePrefix(selected.code_prefix)}</code>
                <div><span className="admin-plan-pill">{selected.plan}</span><AdminBadge value={selected.status} /></div>
              </div>
              {selected.id ? (
                <button 
                  className="admin-secondary-button" 
                  type="button" 
                  onClick={() => void copyLicenseCode(selected.id)}
                >
                  <Copy size={15} />复制
                </button>
              ) : null}
            </section>
            <dl className="admin-definition-grid">
              <div><dt>用户有效天数</dt><dd>{selected.duration_days} 天</dd></div>
              <div><dt>最大激活次数</dt><dd>{selected.max_activations}</dd></div>
              <div><dt>已使用次数</dt><dd>{selected.activation_count}</dd></div>
              <div><dt>剩余次数</dt><dd>{selected.remaining_count}</dd></div>
              <div><dt>激活码整体到期</dt><dd>{formatAdminDate(selected.expires_at, '永不过期')}</dd></div>
              <div><dt>创建时间</dt><dd>{formatAdminDate(selected.created_at)}</dd></div>
              <div className="full"><dt>备注</dt><dd>{selected.note || '无备注'}</dd></div>
            </dl>
            <section className="admin-binding-summary">
              <div>
                <span className="admin-list-icon"><UsersRound size={18} /></span>
                <div><strong>当前已绑定 {selected.activation_count} 个邮箱</strong><p>邮箱、账号到期时间和权限状态在独立页面中管理。</p></div>
              </div>
              <a className="admin-primary-button" href={`/admin/bindings?licenseId=${selected.id}`}>查看全部绑定邮箱</a>
            </section>
            <div className="admin-danger-zone">
              <div><strong>危险操作</strong><p>撤销后会保留激活码、绑定历史和审计记录，但不能重新启用。</p></div>
              {selected.status !== 'revoked' ? (
                <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                  title: '不可逆地撤销这个激活码？',
                  message: '该激活码和相关邮箱权限都会立即失效。',
                  label: '确认永久撤销',
                  verificationText: selected.code_prefix,
                  action: () => updateLicense(selected.id, { status: 'revoked' }, '激活码已撤销')
                })}><ShieldX size={15} />撤销激活码</button>
              ) : <span className="admin-status bad">已永久撤销</span>}
            </div>
          </div>
        ) : null}
      </CenteredDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label}
        verificationText={confirm?.verificationText}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </main>
  )
}
