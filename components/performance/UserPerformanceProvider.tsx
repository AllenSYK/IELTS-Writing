'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'

export function UserPerformanceProvider({ children }: { children: ReactNode }) {
  const { userId } = useUserSession()
  const prevUserIdRef = useRef(userId)
  const cacheRef = useRef<Map<string, unknown>>()

  if (!cacheRef.current) {
    cacheRef.current = new Map()
  }

  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      clearUserRouteMemoryCaches()
      cacheRef.current?.clear()
      prevUserIdRef.current = userId
    }
  }, [userId])

  return (
    <SWRConfig
      value={{
        provider: () => cacheRef.current!,
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
