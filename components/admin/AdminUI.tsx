import type { ReactNode } from 'react'
import { Inbox, RefreshCw } from 'lucide-react'

const labels: Record<string, string> = {
  unused: '未使用',
  active: '有效',
  partial: '部分使用',
  exhausted: '已用完',
  expired: '已过期',
  revoked: '已撤销',
  disabled: '已禁用',
  suspended: '已暂停',
  inactive: '未激活',
  admin: '管理员',
  user: '普通用户'
}

export function AdminBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase()
  const tone =
    ['active', 'admin'].includes(normalized)
      ? 'good'
      : ['expired', 'revoked', 'disabled', 'suspended'].includes(normalized)
        ? 'bad'
        : ['partial', 'exhausted'].includes(normalized)
          ? 'warning'
          : 'neutral'
  return <span className={`admin-status ${tone}`}>{labels[normalized] || value}</span>
}

export function AdminEmpty({
  title,
  message,
  action
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="admin-empty">
      <span><Inbox size={24} aria-hidden="true" /></span>
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  )
}

export function AdminError({
  message,
  onRetry
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="admin-error-card" role="alert">
      <div>
        <strong>加载失败</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button className="admin-secondary-button" type="button" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          重试
        </button>
      ) : null}
    </div>
  )
}

export function AdminTableSkeleton({ columns = 8, rows = 5 }: { columns?: number; rows?: number }) {
  return (
    <div className="admin-table-skeleton" aria-label="正在加载">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ gridTemplateColumns: `repeat(${columns}, minmax(80px, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => <span key={column} />)}
        </div>
      ))}
    </div>
  )
}

export function AdminMetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'blue'
}: {
  icon: ReactNode
  label: string
  value: number | string
  helper: string
  tone?: 'blue' | 'violet' | 'green' | 'amber' | 'red'
}) {
  return (
    <article className={`admin-stat-card tone-${tone}`}>
      <span className="admin-stat-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  )
}

export function formatAdminDate(value?: string | null, fallback = '暂无') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function maskLicenseCode(code?: string | null, prefix?: string) {
  if (!code) return `${prefix || 'IELTS-••••'}-••••-••••`
  const parts = code.split('-')
  if (parts.length !== 4) return code
  return `${parts[0]}-${parts[1]}-••••-${parts[3]}`
}
