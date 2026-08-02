'use client'

import { SWRConfig } from 'swr'
import { useRef, type ReactNode } from 'react'

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

// 全局缓存 Map（单例）
const globalCache = new Map()

export function SWRProvider({ children }: SWRProviderProps) {
  const cacheRef = useRef(globalCache)

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
        dedupingInterval: 5000,
        focusThrottleInterval: 10000,
        keepPreviousData: true,
        // 使用稳定的内存缓存
        provider: () => cacheRef.current,
      }}
    >
      {children}
    </SWRConfig>
  )
}
