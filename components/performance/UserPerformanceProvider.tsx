'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useSWRConfig } from 'swr'
import { useAuth } from '@/components/auth/UserSessionProvider'
import { clearUserRouteMemoryCaches } from '@/lib/user-route-cache'

export function UserPerformanceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const { cache } = useSWRConfig()
  const prevUserIdRef = useRef(userId)

  useEffect(() => {
    const previousUserId = prevUserIdRef.current
    if (previousUserId === userId) return

    if (previousUserId) {
      clearUserRouteMemoryCaches(previousUserId)
      for (const key of cache.keys()) {
        if (String(key).includes(previousUserId)) cache.delete(key)
      }
    }
    prevUserIdRef.current = userId
  }, [cache, userId])

  return children
}
