'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import {
  WritingRecordsUpdatedEvent,
  loadWritingRecordsLightweight,
  type WritingRecordListItem
} from '@/lib/writing-records'

export const UserRouteCacheKeys = {
  history: 'question_history',
  analytics: 'question_analytics'
} as const

export type UserRouteCacheKey = (typeof UserRouteCacheKeys)[keyof typeof UserRouteCacheKeys]

const pendingRecordLists = new Map<string, Promise<WritingRecordListItem[]>>()

export function userWritingRecordsCacheKey(key: UserRouteCacheKey, userId: string) {
  return ['user-writing-records', key, userId] as const
}

export function userWritingRecordListCacheKey(userId: string) {
  return ['writing-records-lightweight-list', userId] as const
}

export function clearUserRouteMemoryCaches(userId?: string) {
  if (userId) {
    pendingRecordLists.delete(userId)
    return
  }
  pendingRecordLists.clear()
}

export function subscribeToWritingRecordChanges(listener: (userId: string) => void) {
  const handler = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : null
    if (detail && typeof detail.userId === 'string') listener(detail.userId)
  }
  window.addEventListener(WritingRecordsUpdatedEvent, handler)
  return () => window.removeEventListener(WritingRecordsUpdatedEvent, handler)
}

function loadRecordListOnce(userId: string) {
  let pending = pendingRecordLists.get(userId)
  if (!pending) {
    pending = loadWritingRecordsLightweight().finally(() => {
      pendingRecordLists.delete(userId)
    })
    pendingRecordLists.set(userId, pending)
  }
  return pending
}

export function useWritingRecordList(userId: string | null) {
  const result = useSWR<WritingRecordListItem[]>(
    userId ? userWritingRecordListCacheKey(userId) : null,
    () => loadRecordListOnce(userId as string),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 60_000
    }
  )
  const mutateList = result.mutate

  const refreshList = useCallback(async () => {
    if (!userId) return
    const records = await loadRecordListOnce(userId)
    await mutateList(records, { revalidate: false })
  }, [mutateList, userId])

  return {
    records: result.data ?? [],
    isLoading: !userId || (!result.data && result.isLoading),
    refreshList
  }
}
