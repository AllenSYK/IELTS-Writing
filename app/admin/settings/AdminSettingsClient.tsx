'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Clock3, KeyRound, Loader2, Save, ShieldCheck, TableProperties } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'

type Settings = {
  defaultPlan: string
  defaultDurationDays: number
  defaultMaxActivations: number
  expiringReminderDays: number
  pageSize: number
  dateFormat: string
  timezone: string
}

const defaults: Settings = {
  defaultPlan: 'standard',
  defaultDurationDays: 365,
  defaultMaxActivations: 1,
  expiringReminderDays: 14,
  pageSize: 50,
  dateFormat: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

export function AdminSettingsClient() {
  const { pushToast } = useToast()
  const [settings, setSettings] = useState<Settings>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载设置。')
      setSettings({ ...defaults, ...(data.settings || {}) })
      setUpdatedAt(data.updatedAt || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载设置。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '保存失败。')
      setSettings({ ...defaults, ...(data.settings || {}) })
      setUpdatedAt(data.updatedAt || null)
      pushToast({ kind: 'success', title: '管理设置已保存' })
    } catch (caught) {
      pushToast({ kind: 'error', title: '设置保存失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="ADMIN SETTINGS"
        title="管理设置"
        description="配置激活码默认规则、提醒窗口和后台数据展示偏好。"
      />

      {error ? <AdminError message={error} onRetry={() => void load()} /> : null}
      {loading ? <AdminTableSkeleton columns={2} rows={6} /> : (
        <form className="admin-settings-layout" onSubmit={save}>
          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><KeyRound size={20} /></span>
              <div><h2>激活码默认值</h2><p>生成弹窗可使用这些默认规则，管理员仍可逐次修改。</p></div>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field"><span>默认套餐</span><select value={settings.defaultPlan} onChange={(event) => setSettings({ ...settings, defaultPlan: event.target.value })}><option value="standard">Standard</option><option value="pro">Pro</option><option value="premium">Premium</option><option value="admin">Admin</option></select></label>
              <label className="admin-field"><span>默认账号有效天数</span><input type="number" min={1} max={3650} value={settings.defaultDurationDays} onChange={(event) => setSettings({ ...settings, defaultDurationDays: Number(event.target.value) })} /><small>从用户成功激活当天开始计算。</small></label>
              <label className="admin-field"><span>默认最大激活次数</span><input type="number" min={1} max={100} value={settings.defaultMaxActivations} onChange={(event) => setSettings({ ...settings, defaultMaxActivations: Number(event.target.value) })} /></label>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><Clock3 size={20} /></span>
              <div><h2>到期提醒</h2><p>控制总览中“即将到期”的时间窗口。</p></div>
            </div>
            <label className="admin-field"><span>提前提醒天数</span><input type="number" min={1} max={365} value={settings.expiringReminderDays} onChange={(event) => setSettings({ ...settings, expiringReminderDays: Number(event.target.value) })} /></label>
          </section>

          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><TableProperties size={20} /></span>
              <div><h2>数据展示</h2><p>设置列表默认页容量和时间显示方式。</p></div>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field"><span>每页数据量</span><select value={settings.pageSize} onChange={(event) => setSettings({ ...settings, pageSize: Number(event.target.value) })}><option value={25}>25 条</option><option value={50}>50 条</option><option value={100}>100 条</option><option value={200}>200 条</option></select></label>
              <label className="admin-field"><span>日期格式</span><select value={settings.dateFormat} onChange={(event) => setSettings({ ...settings, dateFormat: event.target.value })}><option value="zh-CN">中文（2026/06/18）</option><option value="en-US">英文（06/18/2026）</option></select></label>
              <label className="admin-field full"><span>时区</span><select value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}><option value="Asia/Shanghai">Asia/Shanghai（中国标准时间）</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="America/New_York">America/New_York</option></select></label>
            </div>
          </section>

          <section className="admin-settings-savebar">
            <div><ShieldCheck size={18} /><span><strong>管理员专属设置</strong><small>{updatedAt ? `上次保存：${formatAdminDate(updatedAt)}` : '尚未保存'}</small></span></div>
            <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? <Loader2 className="admin-spin" size={16} /> : <Save size={16} />}{saving ? '正在保存' : '保存设置'}</button>
          </section>
        </form>
      )}
    </main>
  )
}
