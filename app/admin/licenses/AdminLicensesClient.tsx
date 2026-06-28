'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useState } from 'react'
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
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldX,
  Trash2,
  UsersRound
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { maskLicenseCode } from '@/lib/admin/mask-license'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'

type LicenseRow = {
  id: string
  code_value: string | null
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

type GeneratedCode = LicenseRow & { code: string }

type LicensesResponse = {
  success: true
  licenses: LicenseRow[]
  total: number
}

type ConfirmState = {
  title: string
  message: string
  label: string
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
  const [generated, setGenerated] = useState<GeneratedCode[]>([])
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1')
  const [resultOpen, setResultOpen] = useState(false)
  const [selection, setSelection] = useState<{ routeFocus: string; id: string | null }>({
    routeFocus: focusedId,
    id: focusedId || null
  })
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [form, setForm] = useState({
    countPreset: '1',
    customCount: 1,
    plan: 'standard',
    durationPreset: '365',
    customDuration: 365,
    maxActivations: '1',
    expiryMode: 'never',
    expiresAt: '',
    note: ''
  })

  const licensesKey = useMemo(() => {
    const params = new URLSearchParams({
      pageSize: '200',
      search: debouncedSearch,
      status,
      plan
    })
    if (focusedId) params.set('licenseId', focusedId)
    return `/api/admin/licenses/list?${params.toString()}`
  }, [debouncedSearch, focusedId, plan, status])

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

  const resolvedForm = useMemo(() => {
    const count = form.countPreset === 'custom' ? form.customCount : Number(form.countPreset)
    const durationDays = form.durationPreset === 'custom' ? form.customDuration : Number(form.durationPreset)
    const maxActivations = form.maxActivations === 'unlimited' ? 100 : Number(form.maxActivations)
    const expiresAt = form.expiryMode === 'custom' ? form.expiresAt : ''
    const expiryDays = ['7', '30', '90'].includes(form.expiryMode) ? Number(form.expiryMode) : 0
    return { count, durationDays, maxActivations, expiresAt, expiryDays }
  }, [form])

  async function createCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: resolvedForm.count,
          plan: form.plan,
          durationDays: resolvedForm.durationDays,
          maxActivations: resolvedForm.maxActivations,
          expiresAt: resolvedForm.expiryDays
            ? new Date(Date.now() + resolvedForm.expiryDays * 24 * 60 * 60 * 1000).toISOString()
            : resolvedForm.expiresAt
              ? new Date(resolvedForm.expiresAt).toISOString()
              : null,
          note: form.note
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '生成失败。')
      setGenerated(data.codes || [])
      setCreateOpen(false)
      setResultOpen(true)
      pushToast({ kind: 'success', title: `已生成 ${data.codes?.length || 0} 个激活码`, message: '请妥善保存完整明文。' })
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '生成激活码失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
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

  async function deleteLicense(id: string) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/licenses/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '删除失败。')
      pushToast({ kind: 'success', title: '激活码已删除' })
      setSelected(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '删除失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function copyText(value: string, title = '已复制') {
    await navigator.clipboard.writeText(value)
    pushToast({ kind: 'success', title })
  }

  function exportAll() {
    downloadCsv(`license-codes-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['激活码', '套餐', '状态', '已使用次数', '最大激活次数', '剩余次数', '用户有效天数', '激活码整体到期时间', '创建时间', '备注'],
      ...licenses.map((license) => [
        license.code_value || license.code_prefix,
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
    pushToast({ kind: 'success', title: '激活码数据已导出' })
  }

  async function runConfirm() {
    const action = confirm?.action
    setConfirm(null)
    if (action) await action()
  }

  async function revealLicenseCode(id: string) {
    // 如果已经显示，则隐藏
    if (revealed.has(id)) {
      setRevealed((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      return
    }
    
    // 否则通过 API 获取完整码
    try {
      const response = await fetch(`/api/admin/licenses/${id}/reveal`)
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
    } catch (caught) {
      pushToast({ 
        kind: 'error', 
        title: '获取完整激活码失败', 
        message: caught instanceof Error ? caught.message : '请稍后重试' 
      })
    }
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="LICENSE ASSETS"
        title="激活码管理"
        description="生成、查看、禁用、撤销和管理所有激活码"
        actions={(
          <>
            <button className="admin-secondary-button" type="button" onClick={exportAll} disabled={!licenses.length}>
              <Download size={16} />导出 CSV
            </button>
            <button className="admin-primary-button" type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />生成激活码
            </button>
          </>
        )}
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar">
          <label className="admin-search-field">
            <Search size={17} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索完整激活码、前缀、套餐或备注" />
          </label>
          <label className="admin-select-field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
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
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
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
                          <code>{visible && fullCode ? fullCode : maskLicenseCode(license.code_value)}</code>
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
                          {license.code_value ? <button className="admin-icon-button" type="button" onClick={() => void copyText(license.code_value || '')} aria-label="复制" title="复制"><Copy size={15} /></button> : null}
                          <button className="admin-icon-button" type="button" onClick={() => setSelected(license)} aria-label="查看详情" title="查看详情"><FileText size={15} /></button>
                          <Link className="admin-icon-button" href={`/admin/bindings?licenseId=${license.id}`} aria-label="查看绑定记录" title="查看绑定记录"><UsersRound size={15} /></Link>
                          {['disabled', 'revoked'].includes(license.status) ? (
                            <button className="admin-icon-button success" type="button" onClick={() => void updateLicense(license.id, { status: license.activation_count ? 'active' : 'unused' }, '激活码已启用')} aria-label="启用" title="启用">
                              <CheckCircle2 size={15} />
                            </button>
                          ) : (
                            <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                              title: '禁用这个激活码？',
                              message: '已绑定用户将暂停使用权限，重新启用后可恢复。',
                              label: '确认禁用',
                              action: () => updateLicense(license.id, { status: 'disabled' }, '激活码已禁用')
                            })} aria-label="禁用" title="禁用"><Ban size={15} /></button>
                          )}
                          <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                            title: '撤销这个激活码？',
                            message: '该激活码会停止使用，相关邮箱权限也会被撤销。',
                            label: '确认撤销',
                            action: () => updateLicense(license.id, { status: 'revoked' }, '激活码已撤销')
                          })} aria-label="撤销" title="撤销"><ShieldX size={15} /></button>
                          <button className="admin-icon-button danger" type="button" onClick={() => setConfirm({
                            title: '永久删除这个激活码？',
                            message: '激活码及其绑定记录都会被永久删除，且无法恢复。',
                            label: '永久删除',
                            action: () => deleteLicense(license.id)
                          })} aria-label="删除" title="删除"><Trash2 size={15} /></button>
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
            title="没有符合条件的激活码"
            message="调整筛选条件，或生成一批新的激活码。"
            action={<button className="admin-primary-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={16} />生成激活码</button>}
          />
        )}
      </section>

      <CenteredDialog
        open={createOpen}
        title="生成激活码"
        description="分别设置账号有效天数与激活码本身的整体到期时间。"
        className="admin-create-dialog"
        onClose={() => !submitting && setCreateOpen(false)}
        footer={(
          <>
            <button className="admin-secondary-button" type="button" onClick={() => setCreateOpen(false)} disabled={submitting}>取消</button>
            <button className="admin-primary-button" type="submit" form="create-license-form" disabled={submitting}>
              {submitting ? <Loader2 className="admin-spin" size={16} /> : <Plus size={16} />}
              {submitting ? '正在生成' : '确认生成'}
            </button>
          </>
        )}
      >
        <form id="create-license-form" className="admin-generate-form" onSubmit={createCodes}>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>生成数量</span>
              <select value={form.countPreset} onChange={(event) => setForm({ ...form, countPreset: event.target.value })}>
                <option value="1">1 个</option><option value="5">5 个</option><option value="10">10 个</option>
                <option value="20">20 个</option><option value="custom">自定义</option>
              </select>
            </label>
            {form.countPreset === 'custom' ? (
              <label className="admin-field"><span>自定义数量</span><input type="number" min={1} max={500} value={form.customCount} onChange={(event) => setForm({ ...form, customCount: Number(event.target.value) })} /></label>
            ) : null}
            <label className="admin-field">
              <span>套餐类型</span>
              <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })}>
                <option value="standard">Standard</option><option value="pro">Pro</option>
                <option value="premium">Premium</option><option value="admin">Admin</option>
              </select>
            </label>
            <label className="admin-field">
              <span>用户激活后的有效天数</span>
              <select value={form.durationPreset} onChange={(event) => setForm({ ...form, durationPreset: event.target.value })}>
                <option value="30">30 天</option><option value="90">90 天</option><option value="180">180 天</option>
                <option value="365">365 天</option><option value="custom">自定义</option>
              </select>
              <small>从用户成功激活当天开始计算。</small>
            </label>
            {form.durationPreset === 'custom' ? (
              <label className="admin-field"><span>自定义有效天数</span><input type="number" min={1} max={3650} value={form.customDuration} onChange={(event) => setForm({ ...form, customDuration: Number(event.target.value) })} /></label>
            ) : null}
            <label className="admin-field">
              <span>最大激活次数</span>
              <select value={form.maxActivations} onChange={(event) => setForm({ ...form, maxActivations: event.target.value })}>
                <option value="1">1 个账号</option><option value="2">2 个账号</option><option value="3">3 个账号</option>
                <option value="5">5 个账号</option><option value="unlimited">近似无限制（100）</option>
              </select>
            </label>
            <label className="admin-field">
              <span>激活码整体到期时间</span>
              <select value={form.expiryMode} onChange={(event) => setForm({ ...form, expiryMode: event.target.value })}>
                <option value="never">永不过期</option><option value="7">7 天后</option>
                <option value="30">30 天后</option><option value="90">90 天后</option><option value="custom">指定日期和时间</option>
              </select>
              <small>超过该时间后，即使仍有次数，也不能继续激活。</small>
            </label>
            {form.expiryMode === 'custom' ? (
              <label className="admin-field"><span>指定日期和时间</span><input type="datetime-local" required value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
            ) : null}
            <label className="admin-field full"><span>备注</span><textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="例如：2026 暑期活动、内部测试、渠道 A" /></label>
          </div>
          <div className="admin-confirm-summary">
            <strong>生成确认</strong>
            <p>将生成 {resolvedForm.count} 个 {form.plan} 激活码</p>
            <p>每个用户激活后有效 {resolvedForm.durationDays} 天</p>
            <p>每个码最多激活 {form.maxActivations === 'unlimited' ? '100' : form.maxActivations} 次</p>
            <p>激活码本身{resolvedForm.expiryDays ? `将在 ${resolvedForm.expiryDays} 天后到期` : resolvedForm.expiresAt ? `于 ${formatAdminDate(resolvedForm.expiresAt)} 到期` : '永不过期'}</p>
          </div>
        </form>
      </CenteredDialog>

      <CenteredDialog
        open={resultOpen}
        title="激活码生成成功"
        description={`已生成 ${generated.length} 个激活码，完整明文可在下方复制或导出。`}
        className="admin-result-dialog"
        onClose={() => setResultOpen(false)}
        footer={(
          <>
            <button className="admin-secondary-button" type="button" onClick={() => void copyText(generated.map((item) => item.code).join('\n'), '全部激活码已复制')}><Copy size={16} />复制全部</button>
            <button className="admin-secondary-button" type="button" onClick={() => downloadCsv('generated-license-codes.csv', [['激活码', '套餐', '有效天数', '最大激活次数', '整体到期'], ...generated.map((item) => [item.code, item.plan, item.duration_days, item.max_activations, item.expires_at || ''])])}><Download size={16} />导出 CSV</button>
            <button className="admin-primary-button" type="button" onClick={() => setResultOpen(false)}>完成</button>
          </>
        )}
      >
        <div className="admin-generated-list">
          {generated.map((item) => (
            <div key={item.code}>
              <span><code>{item.code}</code><small>{item.plan} · {item.duration_days} 天</small></span>
              <button className="admin-icon-button" type="button" onClick={() => void copyText(item.code)} aria-label="复制"><Copy size={15} /></button>
            </div>
          ))}
        </div>
      </CenteredDialog>

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
                <code>{revealedCodes[selected.id] || maskLicenseCode(selected.code_value)}</code>
                <div><span className="admin-plan-pill">{selected.plan}</span><AdminBadge value={selected.status} /></div>
              </div>
              {selected.code_value ? (
                <button 
                  className="admin-secondary-button" 
                  type="button" 
                  onClick={() => {
                    if (revealedCodes[selected.id]) {
                      void copyText(revealedCodes[selected.id])
                    } else {
                      void revealLicenseCode(selected.id).then(() => {
                        // 获取后复制
                        setTimeout(() => {
                          if (revealedCodes[selected.id]) {
                            void copyText(revealedCodes[selected.id])
                          }
                        }, 100)
                      })
                    }
                  }}
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
              <Link className="admin-primary-button" href={`/admin/bindings?licenseId=${selected.id}`}>查看全部绑定邮箱</Link>
            </section>
            <div className="admin-danger-zone">
              <div><strong>危险操作</strong><p>撤销会停止激活码使用；删除会永久移除激活码及其绑定记录。</p></div>
              <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                title: '撤销这个激活码？',
                message: '该激活码和相关邮箱权限都会被撤销。',
                label: '确认撤销',
                action: () => updateLicense(selected.id, { status: 'revoked' }, '激活码已撤销')
              })}><ShieldX size={15} />撤销激活码</button>
              <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                title: '永久删除这个激活码？',
                message: '激活码和全部绑定记录都会被删除，且无法恢复。',
                label: '永久删除',
                action: () => deleteLicense(selected.id)
              })}><Trash2 size={15} />删除</button>
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
