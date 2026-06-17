'use client'

import {
  Activity,
  BookOpen,
  FileClock,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  MonitorSmartphone,
  Rocket,
  Settings,
  X
} from 'lucide-react'

export type AdminSection = 'overview' | 'licenses' | 'devices' | 'releases' | 'feedback' | 'logs' | 'settings'

const navigation = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'licenses', label: '激活码管理', icon: KeyRound },
  { id: 'devices', label: '设备管理', icon: MonitorSmartphone },
  { id: 'releases', label: '版本发布', icon: Rocket },
  { id: 'feedback', label: '用户反馈', icon: MessageSquareText },
  { id: 'logs', label: '操作日志', icon: FileClock },
  { id: 'settings', label: '系统设置', icon: Settings }
] satisfies Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }>

export function AdminSidebar({
  active,
  collapsed,
  onNavigate,
  onClose
}: {
  active: AdminSection
  collapsed: boolean
  onNavigate: (section: AdminSection) => void
  onClose: () => void
}) {
  return (
    <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="管理后台导航">
      <div className="admin-sidebar-brand">
        <span className="admin-sidebar-mark">
          <BookOpen size={19} aria-hidden="true" />
        </span>
        <div>
          <strong>管理后台</strong>
          <span>IELTS Writing</span>
        </div>
        <button className="admin-icon-button admin-sidebar-close" type="button" aria-label="收起菜单" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <nav className="admin-sidebar-nav">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`admin-sidebar-item ${active === item.id ? 'is-active' : ''}`}
              type="button"
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="admin-sidebar-status">
        <Activity size={16} aria-hidden="true" />
        <span>所有写操作均通过服务端完成</span>
      </div>
    </aside>
  )
}
