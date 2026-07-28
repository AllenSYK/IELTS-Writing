'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { useAuth } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'

export function UserPerformanceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const prevUserIdRef = useRef(userId)
  const cacheRef = useRef(new Map())

  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      clearUserRouteMemoryCaches(userId ?? undefined)
      cacheRef.current.clear()
      prevUserIdRef.current = userId
    }
  }, [userId])

  return (
    <SWRConfig
      value={{
        provider: () => cacheRef.current,
        dedupingInterval: 30_000,
        keepPreviousData: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false
      }}
    >
      {children}
    </SWRConfig>
  )
}
