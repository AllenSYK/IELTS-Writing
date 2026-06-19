'use client'

import useSWR from 'swr'
import {
  WritingRecordsUpdatedEvent,
  loadWritingRecords,
  type WritingRecord
} from '@/lib/writing-records'

export const UserRouteCacheKeys = {
  history: 'question_history',
  level0: 'question_level0'
} as const

export type UserRouteCacheKey = (typeof UserRouteCacheKeys)[keyof typeof UserRouteCacheKeys]

type CacheMutator = (
  key: readonly ['user-writing-records', UserRouteCacheKey, string],
  data: WritingRecord[],
  options: { revalidate: false }
) => Promise<unknown>

const recordCacheKeys = [
  UserRouteCacheKeys.history,
  UserRouteCacheKeys.level0
] as const

const cachedRecords = new Map<string, WritingRecord[]>()
const pendingRecords = new Map<string, Promise<WritingRecord[]>>()

export function userWritingRecordsCacheKey(key: UserRouteCacheKey, userId: string) {
  return ['user-writing-records', key, userId] as const
}

function loadRecordsOnce(userId: string) {
  const cached = cachedRecords.get(userId)
  if (cached) return Promise.resolve(cached)

  let pending = pendingRecords.get(userId)
  if (!pending) {
    pending = Promise.resolve()
      .then(() => loadWritingRecords(userId))
      .then((records) => {
        cachedRecords.set(userId, records)
        return records
      })
      .finally(() => {
        pendingRecords.delete(userId)
      })
    pendingRecords.set(userId, pending)
  }
  return pending
}

export async function warmUserRouteCache(userId: string, key: UserRouteCacheKey, mutate: CacheMutator) {
  const records = await loadRecordsOnce(userId)
  await Promise.all(recordCacheKeys.map((cacheKey) => mutate(userWritingRecordsCacheKey(cacheKey, userId), records, { revalidate: false })))
}

export async function warmAllUserRouteCaches(userId: string, mutate: CacheMutator) {
  const records = await loadRecordsOnce(userId)
  await Promise.all(recordCacheKeys.map((cacheKey) => mutate(userWritingRecordsCacheKey(cacheKey, userId), records, { revalidate: false })))
}

export function replaceCachedUserWritingRecords(userId: string, records: WritingRecord[]) {
  cachedRecords.set(userId, records)
}

export function clearUserRouteMemoryCaches(userId?: string) {
  if (userId) {
    cachedRecords.delete(userId)
    pendingRecords.delete(userId)
    return
  }
  cachedRecords.clear()
  pendingRecords.clear()
}

export function useUserWritingRecords(
  key: typeof UserRouteCacheKeys.history | typeof UserRouteCacheKeys.level0,
  userId: string | null
) {
  const result = useSWR<WritingRecord[]>(
    userId ? userWritingRecordsCacheKey(key, userId) : null,
    () => loadRecordsOnce(userId as string),
    {
      keepPreviousData: false,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      dedupingInterval: 30_000
    }
  )

  return {
    records: result.data ?? [],
    isLoading: !userId || (!result.data && result.isLoading),
    isValidating: result.isValidating,
    refresh: result.mutate
  }
}

export function subscribeToWritingRecordChanges(listener: (userId: string) => void) {
  const handler = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : null
    if (detail && typeof detail.userId === 'string') listener(detail.userId)
  }
  window.addEventListener(WritingRecordsUpdatedEvent, handler)
  return () => window.removeEventListener(WritingRecordsUpdatedEvent, handler)
}
