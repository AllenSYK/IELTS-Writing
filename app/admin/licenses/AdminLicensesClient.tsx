'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Ban, CheckCircle2, Copy, Download, KeyRound, Loader2, Plus, RefreshCw, Search, Unlink } from 'lucide-react'
import { AdminLogoutButton } from '@/components/admin/AdminLogoutButton'

type ActivationRow = {
  id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  last_used_at: string | null
}

type LicenseRow = {
  id: string
  code_prefix: string
  plan: string
  duration_days: number
  max_activations: number
  activation_count: number
  status: string
  expires_at: string | null
  created_at: string
  updated_at: string
  license_activations?: ActivationRow[]
}

type GeneratedCode = LicenseRow & {
  code: string
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  return new Date(value).toLocaleString('zh-CN')
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function AdminLicensesClient() {
  const [licenses, setLicenses] = useState<LicenseRow[]>([])
  const [generated, setGenerated] = useState<GeneratedCode[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    count: 1,
    plan: 'standard',
    durationDays: 365,
    maxActivations: 1,
    expiresAt: ''
  })

  const csvRows = useMemo(() => {
    const header = ['code_prefix', 'plan', 'status', 'activation_count', 'max_activations', 'bound_email', 'activated_at', 'user_expires_at', 'code_expires_at']
    const rows = licenses.map((license) => {
      const activation = license.license_activations?.[0]
      return [
        license.code_prefix,
        license.plan,
        license.status,
        license.activation_count,
        license.max_activations,
        activation?.email || '',
        activation?.activated_at || '',
        activation?.expires_at || '',
        license.expires_at || ''
      ].map(csvEscape).join(',')
    })
    return [header.join(','), ...rows].join('\n')
  }, [licenses])

  async function loadLicenses() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '100', search, status })
      const response = await fetch(`/api/admin/licenses/list?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载激活码。')
      setLicenses(data.licenses || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载激活码。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadLicenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/licenses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: form.count,
          plan: form.plan,
          durationDays: form.durationDays,
          maxActivations: form.maxActivations,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
        })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '生成失败。')
      setGenerated(data.codes || [])
      setMessage('激活码已生成，明文只会在这里显示一次。')
      await loadLicenses()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失败。')
    } finally {
      setSubmitting(false)
    }
  }

  async function updateLicense(id: string, patch: Record<string, unknown>) {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/licenses/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '更新失败。')
      setMessage('已更新。')
      await loadLicenses()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新失败。')
    } finally {
      setSubmitting(false)
    }
  }

  async function revokeActivation(activationId: string, unbind = false) {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/licenses/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationId, unbind, reason: unbind ? '管理员解绑账号' : '管理员撤销激活' })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      setMessage(unbind ? '已解绑账号。' : '已撤销激活。')
      await loadLicenses()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败。')
    } finally {
      setSubmitting(false)
    }
  }

  async function extendActivation(activationId: string) {
    const raw = window.prompt('延长多少天？', '30')
    const days = Number(raw)
    if (!Number.isInteger(days) || days <= 0) return
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/admin/licenses/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationId, days })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '续期失败。')
      setMessage('已延长有效期。')
      await loadLicenses()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '续期失败。')
    } finally {
      setSubmitting(false)
    }
  }

  function exportGenerated() {
    const header = ['license_code', 'code_prefix', 'plan', 'duration_days', 'max_activations', 'expires_at']
    const rows = generated.map((item) => [
      item.code,
      item.code_prefix,
      item.plan,
      item.duration_days,
      item.max_activations,
      item.expires_at || ''
    ].map(csvEscape).join(','))
    downloadText(`generated-web-license-codes-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...rows].join('\n'))
  }

  return (
    <main className="admin-workspace web-admin-workspace" data-main-content tabIndex={-1}>
      <section className="admin-main-panel">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <KeyRound size={20} />
            <div>
              <strong>网页版激活码管理</strong>
              <span>生成、绑定、撤销和导出网页版激活码</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Link className="admin-secondary-button" href="/admin/users">用户管理</Link>
            <AdminLogoutButton />
          </div>
        </header>

        <div className="admin-main-content">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <h2>生成激活码</h2>
                <p className="admin-help">完整明文只会在生成成功后显示一次。</p>
              </div>
            </div>
            <form className="admin-generate-grid" onSubmit={createCodes}>
              <label className="admin-field"><span>数量</span><input type="number" min={1} max={500} value={form.count} onChange={(event) => setForm({ ...form, count: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>套餐</span><input value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} /></label>
              <label className="admin-field"><span>有效天数</span><input type="number" min={1} max={3650} value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>最大激活次数</span><input type="number" min={1} max={100} value={form.maxActivations} onChange={(event) => setForm({ ...form, maxActivations: Number(event.target.value) })} /></label>
              <label className="admin-field"><span>激活码整体过期时间</span><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
              <button className="admin-primary-button" type="submit" disabled={submitting}>{submitting ? <Loader2 className="admin-spin" size={16} /> : <Plus size={16} />}生成</button>
            </form>

            {generated.length ? (
              <div className="admin-generated-panel">
                <div className="admin-toolbar">
                  <strong>刚生成的激活码</strong>
                  <button className="admin-secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(generated.map((item) => item.code).join('\n'))}><Copy size={15} />复制全部</button>
                  <button className="admin-secondary-button" type="button" onClick={exportGenerated}><Download size={15} />下载 CSV</button>
                </div>
                <ul className="admin-generated-list">
                  {generated.map((item) => (
                    <li key={item.code}><code>{item.code}</code><span>{item.plan} · {item.duration_days} 天</span></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="admin-panel">
            <div className="admin-toolbar">
              <label className="admin-field"><span>搜索前缀或邮箱</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="IELTS-ABCD / user@example.com" /></label>
              <label className="admin-field"><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="unused">unused</option><option value="active">active</option><option value="exhausted">exhausted</option><option value="disabled">disabled</option><option value="expired">expired</option></select></label>
              <button className="admin-secondary-button" type="button" onClick={() => void loadLicenses()} disabled={loading}><Search size={16} />搜索</button>
              <button className="admin-icon-button" type="button" onClick={() => void loadLicenses()} disabled={loading} aria-label="刷新"><RefreshCw size={16} /></button>
              <button className="admin-secondary-button" type="button" onClick={() => downloadText(`web-license-codes-${new Date().toISOString().slice(0, 10)}.csv`, csvRows)}><Download size={16} />导出 CSV</button>
            </div>
            {message ? <p className="auth-success">{message}</p> : null}
            {error ? <p className="admin-error-text">{error}</p> : null}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>前缀</th><th>套餐</th><th>状态</th><th>绑定邮箱</th><th>激活次数</th><th>激活时间</th><th>用户到期</th><th>整体过期</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9}>正在加载...</td></tr>
                  ) : licenses.length ? licenses.map((license) => {
                    const activation = license.license_activations?.[0]
                    return (
                      <tr key={license.id}>
                        <td><code>{license.code_prefix}</code></td>
                        <td>{license.plan}</td>
                        <td><span className={`admin-status ${license.status === 'disabled' || license.status === 'expired' ? 'bad' : license.status === 'unused' ? 'neutral' : 'good'}`}>{license.status}</span></td>
                        <td>{activation?.email || '未绑定'}</td>
                        <td>{license.activation_count} / {license.max_activations}</td>
                        <td>{formatDate(activation?.activated_at)}</td>
                        <td>{formatDate(activation?.expires_at)}</td>
                        <td>{formatDate(license.expires_at)}</td>
                        <td>
                          <div className="admin-table-actions">
                            {license.status === 'disabled' ? (
                              <button type="button" onClick={() => void updateLicense(license.id, { status: license.activation_count > 0 ? 'active' : 'unused' })}><CheckCircle2 size={14} />启用</button>
                            ) : (
                              <button className="danger" type="button" onClick={() => void updateLicense(license.id, { status: 'disabled' })}><Ban size={14} />禁用</button>
                            )}
                            {activation ? <button type="button" onClick={() => void extendActivation(activation.id)}>续期</button> : null}
                            {activation ? <button className="danger" type="button" onClick={() => void revokeActivation(activation.id)}>撤销</button> : null}
                            {activation ? <button className="danger" type="button" onClick={() => void revokeActivation(activation.id, true)}><Unlink size={14} />解绑</button> : null}
                          </div>
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr><td colSpan={9}>暂无激活码。</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
