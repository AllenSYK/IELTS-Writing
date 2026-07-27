'use client'

import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

type SWRProviderProps = {
  children: ReactNode
}

// 全局 fetcher
async function defaultFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`)
  }
  return response.json()
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        fetcher: defaultFetcher,
        // 全局配置
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        revalidateIfStale: true,
        shouldRetryOnError: false,
        errorRetryCount: 0,
        dedupingInterval: 2000,
        focusThrottleInterval: 5000,
        // 使用内存缓存
        provider: () => new Map(),
      }}
    >
      {children}
    </SWRConfig>
  )
}
