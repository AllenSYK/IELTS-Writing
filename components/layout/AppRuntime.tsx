'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { UserPerformanceProvider } from '@/components/performance/UserPerformanceProvider'
import { AppShell } from './AppShell'

const publicAuthRoutes = ['/login', '/register', '/forgot-password', '/reset-password']

function isPublicAuthRoute(pathname: string) {
  return publicAuthRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function AppRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isPublicAuthRoute(pathname)) {
    return <AppShell>{children}</AppShell>
  }

  return (
    <UserPerformanceProvider>
      <AppShell>{children}</AppShell>
    </UserPerformanceProvider>
  )
}
