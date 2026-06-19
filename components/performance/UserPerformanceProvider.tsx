'use client'

import { useEffect, type ReactNode } from 'react'
import { SWRConfig, useSWRConfig } from 'swr'
import {
  UserRouteCacheKeys,
  replaceCachedUserWritingRecords,
  subscribeToWritingRecordChanges,
  warmAllUserRouteCaches
} from '@/lib/user-route-cache'
import { loadWritingRecords } from '@/lib/writing-records'

const persistentUserCache = new Map()

function UserCacheSynchronizer() {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    void warmAllUserRouteCaches(mutate)

    return subscribeToWritingRecordChanges(() => {
      const records = loadWritingRecords()
      replaceCachedUserWritingRecords(records)
      void Promise.all([
        mutate(UserRouteCacheKeys.history, records, { revalidate: false }),
        mutate(UserRouteCacheKeys.level0, records, { revalidate: false })
      ])
    })
  }, [mutate])

  return null
}

export function UserPerformanceProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => persistentUserCache,
        dedupingInterval: 30_000,
        keepPreviousData: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: false
      }}
    >
      <UserCacheSynchronizer />
      {children}
    </SWRConfig>
  )
}
