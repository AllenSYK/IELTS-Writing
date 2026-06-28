'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { PageSkeleton } from '@/components/loading/PageSkeleton'

type AuthGuardProps = {
  children: ReactNode
  fallback?: ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter()
  const { userId, status } = useUserSession()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [status, router])

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
