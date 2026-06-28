'use client'

import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import { Clock3, KeyRound, Loader2, Save, ShieldCheck, TableProperties } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { adminJsonFetcher, adminApiRequest, AdminApiError } from '@/lib/admin/fetch-json'
import { ADMIN_CACHE_KEYS } from '@/components/admin/AdminDataProvider'
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

/**
 * 验证 IANA 时区
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * 常用时区列表（用于前端选择器）
 */
const COMMON_TIMEZONES = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（中国标准时间）' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo（日本标准时间）' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore（新加坡时间）' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong（香港时间）' },
  { value: 'UTC', label: 'UTC（协调世界时）' },
  { value: 'America/New_York', label: 'America/New_York（美国东部时间）' },
  { value: 'America/Chicago', label: 'America/Chicago（美国中部时间）' },
  { value: 'America/Denver', label: 'America/Denver（美国山地时间）' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles（美国太平洋时间）' },
  { value: 'Europe/London', label: 'Europe/London（英国时间）' },
  { value: 'Europe/Paris', label: 'Europe/Paris（中欧时间）' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin（德国时间）' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney（澳大利亚东部时间）' },
]

export function AdminSettingsClient() {
  const { pushToast } = useToast()
  const [settings, setSettings] = useState<Settings>(defaults)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // 使用 SWR 加载设置
  const { data, error, isLoading, mutate } = useSWR(
    ADMIN_CACHE_KEYS.SETTINGS,
    adminJsonFetcher<{ settings?: Settings; updatedAt?: string }>,
    {
      onSuccess: (data) => {
        if (data?.settings) {
          setSettings({ ...defaults, ...data.settings })
          setUpdatedAt(data.updatedAt || null)
        }
      },
      // 设置页使用较长缓存
      dedupingInterval: 30_000,
    }
  )

  // 使用 SWR mutation 保存设置
  const { trigger: saveSettings, isMutating: saving } = useSWRMutation(
    ADMIN_CACHE_KEYS.SETTINGS,
    async () => {
      // 前端验证
      const errors: Record<string, string> = {}
      
      if (!settings.timezone || !isValidTimezone(settings.timezone)) {
        errors.timezone = '请选择有效的时区'
      }
      if (settings.defaultDurationDays < 1 || settings.defaultDurationDays > 3650) {
        errors.defaultDurationDays = '有效天数应在 1-3650 之间'
      }
      if (settings.defaultMaxActivations < 1 || settings.defaultMaxActivations > 100) {
        errors.defaultMaxActivations = '最大激活次数应在 1-100 之间'
      }
      if (settings.expiringReminderDays < 1 || settings.expiringReminderDays > 365) {
        errors.expiringReminderDays = '提醒天数应在 1-365 之间'
      }
      
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors)
        throw new Error('请检查输入项')
      }
      setValidationErrors({})
      
      // 发送保存请求
      return adminApiRequest<{ settings?: Settings; updatedAt?: string }>('/api/admin/settings', 'PATCH', settings)
    },
    {
      onSuccess: (data) => {
        if (data?.settings) {
          setSettings({ ...defaults, ...data.settings })
          setUpdatedAt(data.updatedAt || null)
        }
        // 保存成功后更新缓存
        mutate(data, { revalidate: false })
        pushToast({ kind: 'success', title: '管理设置已保存' })
      },
      onError: (error) => {
        if (error instanceof AdminApiError) {
          pushToast({ kind: 'error', title: '设置保存失败', message: error.message })
        } else if (error.message !== '请检查输入项') {
          pushToast({ kind: 'error', title: '设置保存失败', message: '请稍后重试。' })
        }
      },
      // 不重新验证，因为mutation已经更新了缓存
      revalidate: false,
    }
  )

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 防抖：如果正在保存，忽略点击
    if (saving) return
    saveSettings()
  }

  function updateSetting(key: keyof Settings, value: string | number) {
    setSettings(prev => ({ ...prev, [key]: value }))
    // 清除该字段的验证错误
    if (validationErrors[key]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="ADMIN SETTINGS"
        title="管理设置"
        description="配置激活码默认规则、提醒窗口和后台数据展示偏好。"
      />

      {error && !isLoading ? (
        <AdminError 
          message={error instanceof AdminApiError ? error.message : '无法加载设置。'} 
          onRetry={() => mutate()} 
        />
      ) : null}
      
      {isLoading ? <AdminTableSkeleton columns={2} rows={6} /> : (
        <form className="admin-settings-layout" onSubmit={handleSave}>
          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><KeyRound size={20} /></span>
              <div><h2>激活码默认值</h2><p>生成弹窗可使用这些默认规则，管理员仍可逐次修改。</p></div>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>默认套餐</span>
                <select 
                  value={settings.defaultPlan} 
                  onChange={(event) => updateSetting('defaultPlan', event.target.value)}
                >
                  <option value="standard">Standard</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="admin-field">
                <span>默认账号有效天数</span>
                <input 
                  type="number" 
                  min={1} 
                  max={3650} 
                  value={settings.defaultDurationDays} 
                  onChange={(event) => updateSetting('defaultDurationDays', Number(event.target.value))}
                  aria-invalid={!!validationErrors.defaultDurationDays}
                />
                {validationErrors.defaultDurationDays && (
                  <small className="admin-field-error">{validationErrors.defaultDurationDays}</small>
                )}
                <small>从用户成功激活当天开始计算。</small>
              </label>
              <label className="admin-field">
                <span>默认最大激活次数</span>
                <input 
                  type="number" 
                  min={1} 
                  max={100} 
                  value={settings.defaultMaxActivations} 
                  onChange={(event) => updateSetting('defaultMaxActivations', Number(event.target.value))}
                  aria-invalid={!!validationErrors.defaultMaxActivations}
                />
                {validationErrors.defaultMaxActivations && (
                  <small className="admin-field-error">{validationErrors.defaultMaxActivations}</small>
                )}
              </label>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><Clock3 size={20} /></span>
              <div><h2>到期提醒</h2><p>控制总览中&quot;即将到期&quot;的时间窗口。</p></div>
            </div>
            <label className="admin-field">
              <span>提前提醒天数</span>
              <input 
                type="number" 
                min={1} 
                max={365} 
                value={settings.expiringReminderDays} 
                onChange={(event) => updateSetting('expiringReminderDays', Number(event.target.value))}
                aria-invalid={!!validationErrors.expiringReminderDays}
              />
              {validationErrors.expiringReminderDays && (
                <small className="admin-field-error">{validationErrors.expiringReminderDays}</small>
              )}
            </label>
          </section>

          <section className="admin-panel">
            <div className="admin-settings-heading">
              <span><TableProperties size={20} /></span>
              <div><h2>数据展示</h2><p>设置列表默认页容量和时间显示方式。</p></div>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>每页数据量</span>
                <select 
                  value={settings.pageSize} 
                  onChange={(event) => updateSetting('pageSize', Number(event.target.value))}
                >
                  <option value={25}>25 条</option>
                  <option value={50}>50 条</option>
                  <option value={100}>100 条</option>
                  <option value={200}>200 条</option>
                </select>
              </label>
              <label className="admin-field">
                <span>日期格式</span>
                <select 
                  value={settings.dateFormat} 
                  onChange={(event) => updateSetting('dateFormat', event.target.value)}
                >
                  <option value="zh-CN">中文（2026/06/18）</option>
                  <option value="en-US">英文（06/18/2026）</option>
                </select>
              </label>
              <label className="admin-field full">
                <span>时区</span>
                <select 
                  value={settings.timezone} 
                  onChange={(event) => updateSetting('timezone', event.target.value)}
                  aria-invalid={!!validationErrors.timezone}
                >
                  {COMMON_TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                {validationErrors.timezone && (
                  <small className="admin-field-error">{validationErrors.timezone}</small>
                )}
              </label>
            </div>
          </section>

          <section className="admin-settings-savebar">
            <div>
              <ShieldCheck size={18} />
              <span>
                <strong>管理员专属设置</strong>
                <small>{updatedAt ? `上次保存：${formatAdminDate(updatedAt)}` : '尚未保存'}</small>
              </span>
            </div>
            <button 
              className="admin-primary-button" 
              type="submit" 
              disabled={saving || isLoading}
            >
              {saving ? <Loader2 className="admin-spin" size={16} /> : <Save size={16} />}
              {saving ? '正在保存' : '保存设置'}
            </button>
          </section>
        </form>
      )}
    </main>
  )
}
