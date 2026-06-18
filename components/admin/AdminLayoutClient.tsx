'use client'

import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { AdminHeader } from './AdminHeader'
import { AdminSidebar } from './AdminSidebar'

export function AdminLayoutClient({
  children,
  adminEmail
}: {
  children: ReactNode
  adminEmail?: string
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isLogin = pathname === '/admin/login'

  if (isLogin) return <>{children}</>

  return (
    <div className="admin-workspace">
      <AdminSidebar open={sidebarOpen} adminEmail={adminEmail} onClose={() => setSidebarOpen(false)} />
      <section className="admin-main-panel">
        <AdminHeader adminEmail={adminEmail} onMenu={() => setSidebarOpen(true)} />
        <div className="admin-main-content">{children}</div>
      </section>
    </div>
  )
}
