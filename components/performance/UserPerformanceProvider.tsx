'use client'

import { useEffect, type ReactNode } from 'react'
import { SWRConfig, useSWRConfig } from 'swr'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import {
  UserRouteCacheKeys,
  clearUserRouteMemoryCaches,
  replaceCachedUserWritingRecords,
  subscribeToWritingRecordChanges,
  userWritingRecordsCacheKey,
  warmAllUserRouteCaches
} from '@/lib/user-route-cache'
import { loadWritingRecordsFromServer } from '@/lib/writing-records'

function UserCacheSynchronizer({ userId }: { userId: string | null }) {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    if (!userId) return
    void warmAllUserRouteCaches(userId, mutate)

    return subscribeToWritingRecordChanges((changedUserId) => {
      if (changedUserId !== userId) return
      void loadWritingRecordsFromServer(userId).then((records) => {
        replaceCachedUserWritingRecords(userId, records)
        return Promise.all([
          mutate(userWritingRecordsCacheKey(UserRouteCacheKeys.history, userId), records, { revalidate: false }),
          mutate(userWritingRecordsCacheKey(UserRouteCacheKeys.analytics, userId), records, { revalidate: false })
        ])
      })
    })
  }, [mutate, userId])

  return null
}

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
        revalidateOnReconnect: true,
        shouldRetryOnError: false
      }}
    >
      <UserCacheSynchronizer userId={userId} />
      {children}
    </SWRConfig>
  )
}
