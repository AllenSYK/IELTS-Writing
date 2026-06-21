'use client'

import { useEffect, type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'

export function UserPerformanceProvider({ children }: { children: ReactNode }) {
  const { userId } = useUserSession()

  useEffect(() => {
    clearUserRouteMemoryCaches()
  }, [userId])

  return (
    <SWRConfig
      key={userId ?? 'anonymous'}
      value={{
        provider: () => new Map(),
        dedupingInterval: 30_000,
        keepPreviousData: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false
      }}
    >
      {children}
    </SWRConfig>
  )
}
