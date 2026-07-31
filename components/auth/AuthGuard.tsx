'use client'

import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@/components/auth/UserSessionProvider'
import { PageSkeleton } from '@/components/loading/PageSkeleton'

type AuthGuardProps = {
  children: ReactNode
  fallback?: ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { userId, status } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [status])

  if (status === 'loading') {
    return fallback ?? <PageSkeleton />
  }

  if (status === 'unauthenticated') {
    return fallback ?? <PageSkeleton />
  }

  if (!userId) {
    return fallback ?? <PageSkeleton />
  }

  return <>{children}</>
}
