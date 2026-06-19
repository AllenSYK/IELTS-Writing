'use client'

import { usePathname } from 'next/navigation'
import { Suspense, useState, type ReactNode } from 'react'
import { AdminDataProvider } from './AdminDataProvider'
import { AdminHeader } from './AdminHeader'
import { AdminRouteSkeleton } from './AdminRouteSkeleton'
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
    <AdminDataProvider>
      <div className="admin-workspace">
        <AdminSidebar open={sidebarOpen} adminEmail={adminEmail} onClose={() => setSidebarOpen(false)} />
        <section className="admin-main-panel">
          <AdminHeader adminEmail={adminEmail} onMenu={() => setSidebarOpen(true)} />
          <div className="admin-main-content">
            <Suspense fallback={<AdminRouteSkeleton />}>
              {children}
            </Suspense>
          </div>
        </section>
      </div>
    </AdminDataProvider>
  )
}
