'use client'

import type { ReactNode } from 'react'
import { AdminHeader } from './AdminHeader'
import { AdminSidebar, type AdminSection } from './AdminSidebar'

export function AdminShell({
  active,
  sidebarOpen,
  message,
  loading,
  version,
  children,
  onMenu,
  onCloseSidebar,
  onNavigate,
  onRefresh,
  onOpenUserApp,
  onLogout
}: {
  active: AdminSection
  sidebarOpen: boolean
  message?: string
  loading?: boolean
  version?: string
  children: ReactNode
  onMenu: () => void
  onCloseSidebar: () => void
  onNavigate: (section: AdminSection) => void
  onRefresh: () => void
  onOpenUserApp: () => void
  onLogout: () => void
}) {
  return (
    <main className={`admin-workspace ${sidebarOpen ? 'sidebar-open' : ''}`} data-main-content tabIndex={-1}>
      <div className="admin-sidebar-backdrop" role="presentation" onClick={onCloseSidebar} />
      <AdminSidebar active={active} collapsed={!sidebarOpen} onNavigate={onNavigate} onClose={onCloseSidebar} />
      <section className="admin-main-panel">
        <AdminHeader
          message={message}
          loading={loading}
          version={version}
          onMenu={onMenu}
          onRefresh={onRefresh}
          onOpenUserApp={onOpenUserApp}
          onLogout={onLogout}
        />
        <div className="admin-main-content">{children}</div>
      </section>
    </main>
  )
}
