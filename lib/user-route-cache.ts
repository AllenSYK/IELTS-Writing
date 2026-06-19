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
  key: UserRouteCacheKey,
  data: WritingRecord[],
  options: { revalidate: false }
) => Promise<unknown>

const recordCacheKeys = [
  UserRouteCacheKeys.history,
  UserRouteCacheKeys.level0
] as const

let cachedRecords: WritingRecord[] | null = null
let pendingRecords: Promise<WritingRecord[]> | null = null

function loadRecordsOnce() {
  if (cachedRecords) return Promise.resolve(cachedRecords)

  if (!pendingRecords) {
    pendingRecords = Promise.resolve()
      .then(() => loadWritingRecords())
      .then((records) => {
        cachedRecords = records
        return records
      })
      .finally(() => {
        pendingRecords = null
      })
  }
  return pendingRecords
}

export async function warmUserRouteCache(key: UserRouteCacheKey, mutate: CacheMutator) {
  const records = await loadRecordsOnce()
  await Promise.all(recordCacheKeys.map((cacheKey) => mutate(cacheKey, records, { revalidate: false })))
}

export async function warmAllUserRouteCaches(mutate: CacheMutator) {
  const records = await loadRecordsOnce()
  await Promise.all(recordCacheKeys.map((cacheKey) => mutate(cacheKey, records, { revalidate: false })))
}

export function replaceCachedUserWritingRecords(records: WritingRecord[]) {
  cachedRecords = records
}

export function useUserWritingRecords(
  key: typeof UserRouteCacheKeys.history | typeof UserRouteCacheKeys.level0
) {
  const result = useSWR<WritingRecord[]>(key, loadRecordsOnce, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateIfStale: true,
    dedupingInterval: 30_000
  })

  return {
    records: result.data ?? [],
    isLoading: !result.data && result.isLoading,
    isValidating: result.isValidating,
    refresh: result.mutate
  }
}

export function subscribeToWritingRecordChanges(listener: () => void) {
  window.addEventListener(WritingRecordsUpdatedEvent, listener)
  return () => window.removeEventListener(WritingRecordsUpdatedEvent, listener)
}
