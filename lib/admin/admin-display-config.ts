export type AdminDisplayPreferences = {
  dateFormat: string
  timezone: string
}

export const AdminDisplayDefaults: AdminDisplayPreferences = {
  dateFormat: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

// 最新展示配置（由 useAdminSettings 在渲染期间同步）。
// 供 formatAdminDate 等同步格式化函数读取，先于使用日期格式的子组件执行。
let activeDisplayPreferences: AdminDisplayPreferences = { ...AdminDisplayDefaults }

export function setActiveAdminDisplayPreferences(preferences: AdminDisplayPreferences) {
  activeDisplayPreferences = preferences
}

export function getActiveAdminDisplayPreferences() {
  return activeDisplayPreferences
}

export function formatAdminDateWithPreferences(
  value: string | null | undefined,
  fallback = '暂无',
  overrides?: Partial<AdminDisplayPreferences>
) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const { dateFormat, timezone } = { ...activeDisplayPreferences, ...(overrides ?? {}) }
  try {
    return new Intl.DateTimeFormat(dateFormat || 'zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone || undefined
    }).format(date)
  } catch {
    return date.toLocaleString('zh-CN', { hour12: false })
  }
}
