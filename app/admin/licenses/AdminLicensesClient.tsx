'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Unlink,
  UsersRound
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate, maskLicenseCode } from '@/components/admin/AdminUI'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'

type ActivationRow = {
  id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  last_used_at: string | null
  revoked_at?: string | null
  revoked_reason?: string | null
}

type LicenseRow = {
  id: string
  code_value: string | null
  code_prefix: string
  plan: string
  duration_days: number
  max_activations: number
  activation_count: number
  status: string
  expires_at: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  license_activations?: ActivationRow[]
}

type GeneratedCode = LicenseRow & { code: string }

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
  const { pushToast } = useToast()
  const [licenses, setLicenses] = useState<LicenseRow[]>([])
  const [generated, setGenerated] = useState<GeneratedCode[]>([])
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1')
  const [resultOpen, setResultOpen] = useState(false)
  const [selected, setSelected] = useState<LicenseRow | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
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

  const loadLicenses = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '200', search: debouncedSearch, status })
      const response = await fetch(`/api/admin/licenses/list?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载激活码。')
      const rows = (data.licenses || []) as LicenseRow[]
      setLicenses(plan === 'all' ? rows : rows.filter((item) => item.plan.toLowerCase() === plan))
      const focus = searchParams.get('focus')
      if (focus) setSelected(rows.find((item) => item.id === focus) || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载激活码。')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, plan, searchParams, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLicenses(), 0)
    return () => window.clearTimeout(timer)
  }, [loadLicenses])

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
      const response = await fetch('/api/admin/licenses/create', {
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
      await loadLicenses()
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
      await loadLicenses()
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
      await loadLicenses()
    } catch (caught) {
      pushToast({ kind: 'error', title: '删除失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function activationAction(id: string, action: 'extend' | 'revoke' | 'restore', days?: number) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/activations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      pushToast({ kind: 'success', title: action === 'extend' ? '用户有效期已延长' : action === 'revoke' ? '用户权限已撤销' : '用户权限已恢复' })
      setSelected(null)
      await loadLicenses()
    } catch (caught) {
      pushToast({ kind: 'error', title: '操作失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function unbindActivation(id: string) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/activations/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '解绑失败。')
      pushToast({ kind: 'success', title: '用户与激活码已解绑' })
      setSelected(null)
      await loadLicenses()
    } catch (caught) {
      pushToast({ kind: 'error', title: '解绑失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
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
      ['激活码', '套餐', '状态', '已激活次数', '最大次数', '绑定邮箱', '用户有效期', '激活码整体到期', '创建时间', '备注'],
      ...licenses.map((license) => [
        license.code_value || license.code_prefix,
        license.plan,
        license.status,
        license.activation_count,
        license.max_activations,
        (license.license_activations || []).map((item) => item.email).join(' | '),
        (license.license_activations || []).map((item) => item.expires_at).join(' | '),
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

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="LICENSE MANAGEMENT"
        title="激活码管理"
        description="生成、查看、绑定、撤销和管理所有激活码。"
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索完整激活码、前缀、套餐、备注或邮箱" />
          </label>
          <label className="admin-select-field">
            <span>状态</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="unused">未使用</option>
              <option value="active">部分使用</option>
              <option value="exhausted">已用完</option>
              <option value="expired">已过期</option>
              <option value="revoked">已撤销</option>
              <option value="disabled">已禁用</option>
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
          <button className="admin-icon-button" type="button" onClick={() => void loadLicenses()} disabled={loading} aria-label="刷新">
            <RefreshCw className={loading ? 'admin-spin' : ''} size={17} />
          </button>
        </div>

        {error ? <AdminError message={error} onRetry={() => void loadLicenses()} /> : null}
        {loading ? <AdminTableSkeleton columns={9} rows={7} /> : licenses.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table admin-license-table">
              <thead>
                <tr>
                  <th>激活码</th>
                  <th>套餐</th>
                  <th>状态</th>
                  <th>激活次数</th>
                  <th>绑定邮箱</th>
                  <th>用户有效期</th>
                  <th>激活码整体到期</th>
                  <th>创建时间</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((license) => {
                  const activations = license.license_activations || []
                  const visible = revealed.has(license.id)
                  const displayStatus =
                    license.status === 'active' && license.activation_count < license.max_activations ? 'partial' : license.status
                  return (
                    <tr key={license.id}>
                      <td>
                        <div className="admin-code-cell">
                          <code>{visible && license.code_value ? license.code_value : maskLicenseCode(license.code_value, license.code_prefix)}</code>
                          <button type="button" onClick={() => setRevealed((current) => {
                            const next = new Set(current)
                            if (next.has(license.id)) next.delete(license.id)
                            else next.add(license.id)
                            return next
                          })} aria-label={visible ? '隐藏激活码' : '显示激活码'}>
                            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          {license.code_value ? <button type="button" onClick={() => void copyText(license.code_value || '')} aria-label="复制激活码"><Copy size={14} /></button> : null}
                        </div>
                      </td>
                      <td><span className="admin-plan-pill">{license.plan}</span></td>
                      <td><AdminBadge value={displayStatus} /></td>
                      <td><strong>{license.activation_count}</strong> / {license.max_activations}</td>
                      <td>
                        {activations.length
                          ? <button className="admin-email-stack" type="button" onClick={() => setSelected(license)}>
                              <UsersRound size={14} />
                              <span>{activations[0].email}{activations.length > 1 ? ` 等 ${activations.length} 人` : ''}</span>
                            </button>
                          : <span className="admin-muted">未绑定</span>}
                      </td>
                      <td>{activations.length ? formatAdminDate(activations[0].expires_at) : '—'}</td>
                      <td>{formatAdminDate(license.expires_at, '永不过期')}</td>
                      <td>{formatAdminDate(license.created_at)}</td>
                      <td><span className="admin-note-cell" title={license.note || ''}>{license.note || '—'}</span></td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" onClick={() => setSelected(license)} aria-label="查看详情"><FileText size={15} /></button>
                          {license.status === 'disabled' ? (
                            <button className="admin-icon-button success" type="button" onClick={() => void updateLicense(license.id, { status: license.activation_count ? 'active' : 'unused' }, '激活码已启用')} aria-label="启用">
                              <CheckCircle2 size={15} />
                            </button>
                          ) : (
                            <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                              title: '禁用这个激活码？',
                              message: '已绑定用户将暂停使用权限，重新启用后可恢复。',
                              label: '确认禁用',
                              action: () => updateLicense(license.id, { status: 'disabled' }, '激活码已禁用')
                            })} aria-label="禁用"><Ban size={15} /></button>
                          )}
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
              <span>账号有效天数</span>
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
              <small>一个激活码最多可以绑定多少个账号。</small>
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
            <p>每个账号激活后有效 {resolvedForm.durationDays} 天</p>
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
        description="查看激活码本身的规则，以及每个绑定账号的独立有效期。"
        className="admin-detail-dialog"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="admin-detail-stack">
            <section className="admin-license-hero">
              <span className="admin-list-icon"><KeyRound size={20} /></span>
              <div>
                <code>{selected.code_value || maskLicenseCode(null, selected.code_prefix)}</code>
                <div><span className="admin-plan-pill">{selected.plan}</span><AdminBadge value={selected.status} /></div>
              </div>
              {selected.code_value ? <button className="admin-secondary-button" type="button" onClick={() => void copyText(selected.code_value || '')}><Copy size={15} />复制</button> : null}
            </section>
            <dl className="admin-definition-grid">
              <div><dt>账号有效天数</dt><dd>{selected.duration_days} 天<small>从每个用户激活当天起算</small></dd></div>
              <div><dt>最大激活次数</dt><dd>{selected.max_activations}</dd></div>
              <div><dt>当前激活次数</dt><dd>{selected.activation_count}</dd></div>
              <div><dt>激活码整体到期</dt><dd>{formatAdminDate(selected.expires_at, '永不过期')}<small>到期后不能再产生新激活</small></dd></div>
              <div><dt>创建时间</dt><dd>{formatAdminDate(selected.created_at)}</dd></div>
              <div><dt>创建人</dt><dd className="admin-break">{selected.created_by || '系统'}</dd></div>
              <div className="full"><dt>备注</dt><dd>{selected.note || '无备注'}</dd></div>
            </dl>
            <section>
              <div className="admin-panel-heading"><div><p className="admin-eyebrow">BOUND ACCOUNTS</p><h3>绑定记录</h3></div></div>
              {selected.license_activations?.length ? (
                <div className="admin-bound-list">
                  {selected.license_activations.map((activation) => (
                    <article key={activation.id}>
                      <div>
                        <strong>{activation.email}</strong>
                        <small>激活：{formatAdminDate(activation.activated_at)}</small>
                      </div>
                      <div><span>账号有效期</span><strong>{formatAdminDate(activation.expires_at)}</strong></div>
                      <AdminBadge value={activation.status} />
                      <div className="admin-row-actions">
                        <button className="admin-secondary-button compact" type="button" onClick={() => void activationAction(activation.id, 'extend', 30)}>延长 30 天</button>
                        <button className="admin-secondary-button compact danger" type="button" onClick={() => setConfirm({
                          title: '撤销该用户权限？',
                          message: `${activation.email} 将立即失去当前激活权限。`,
                          label: '确认撤销',
                          action: () => activationAction(activation.id, 'revoke')
                        })}><ShieldX size={14} />撤销</button>
                        <button className="admin-secondary-button compact danger" type="button" onClick={() => setConfirm({
                          title: '解绑这个用户？',
                          message: '绑定记录将被删除，同时释放一次激活名额。',
                          label: '确认解绑',
                          action: () => unbindActivation(activation.id)
                        })}><Unlink size={14} />解绑</button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : <AdminEmpty title="暂无绑定账号" message="该激活码尚未被任何邮箱使用。" />}
            </section>
            <div className="admin-danger-zone">
              <div><strong>危险操作</strong><p>撤销会保留记录但立即停用；删除会永久移除激活码及绑定记录。</p></div>
              <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                title: '撤销这个激活码？',
                message: '所有已绑定用户都将立即失去权限，此操作需要手动恢复。',
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
