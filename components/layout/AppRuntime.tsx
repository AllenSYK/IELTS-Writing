'use client'

import type { ReactNode } from 'react'
import { AdminPreviewBanner } from '@/components/admin/AdminPreviewBanner'
import { UserPerformanceProvider } from '@/components/performance/UserPerformanceProvider'
import { UserProfileProvider } from '@/stores/user-profile-store'
import { AppShell } from './AppShell'

export function AppRuntime({ children }: { children: ReactNode }) {
  return (
    <UserPerformanceProvider>
      <UserProfileProvider>
        <AdminPreviewBanner />
        <AppShell>{children}</AppShell>
      </UserProfileProvider>
    </UserPerformanceProvider>
  )
}
