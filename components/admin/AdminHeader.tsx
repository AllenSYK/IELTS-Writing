'use client'

import { LogOut, Menu, MonitorUp, RefreshCw } from 'lucide-react'

export function AdminHeader({
  message,
  loading,
  version,
  onMenu,
  onRefresh,
  onOpenUserApp,
  onLogout
}: {
  message?: string
  loading?: boolean
  version?: string
  onMenu: () => void
  onRefresh: () => void
  onOpenUserApp: () => void
  onLogout: () => void
}) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <button className="admin-icon-button admin-mobile-menu" type="button" aria-label="打开菜单" onClick={onMenu}>
          <Menu size={19} aria-hidden="true" />
        </button>
        <div>
          <strong>管理员工作台</strong>
          <span>{loading ? '正在处理请求……' : message || `当前版本：${version || '未知'} · 数据来自当前授权服务`}</span>
        </div>
      </div>
      <div className="admin-topbar-actions">
        <button className="admin-secondary-button" type="button" onClick={onOpenUserApp}>
          <MonitorUp size={16} aria-hidden="true" />
          打开用户端
        </button>
        <button className="admin-icon-button" type="button" aria-label="刷新数据" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
        <button className="admin-icon-button" type="button" aria-label="退出登录" onClick={onLogout}>
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
