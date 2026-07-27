/**
 * SWR 全局配置
 * 
 * 统一的缓存和去重策略
 */

import type { SWRConfiguration } from 'swr'

// 默认 fetcher
export const defaultFetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`)
  }
  return response.json()
}

// 全局 SWR 配置
export const swrConfig: SWRConfiguration = {
  // 默认 fetcher
  fetcher: defaultFetcher,
  
  // 重新验证
  revalidateOnFocus: false,      // 切换标签页时不重新验证
  revalidateOnReconnect: true,   // 断网重连时重新验证
  revalidateIfStale: true,       // 数据过期时重新验证
  
  // 重试配置
  shouldRetryOnError: false,     // 不自动重试错误
  errorRetryCount: 0,            // 重试次数
  
  // 去重
  dedupingInterval: 2000,        // 2秒内相同请求只发一次
  
  // 缓存
  provider: () => new Map(),     // 内存缓存
  
  // 焦点时重新验证间隔
  focusThrottleInterval: 5000,   // 5秒内只触发一次焦点验证
}

// 页面级 SWR 配置
export const pageSwrConfig: SWRConfiguration = {
  ...swrConfig,
  // 页面数据缓存更久
  dedupingInterval: 5000,        // 5秒去重
}

// 列表数据配置
export const listSwrConfig: SWRConfiguration = {
  ...swrConfig,
  // 列表数据使用 stale-while-revalidate
  revalidateIfStale: true,
  dedupingInterval: 3000,
}

// 实时数据配置（如状态轮询）
export const realtimeSwrConfig: SWRConfiguration = {
  ...swrConfig,
  revalidateOnFocus: true,
  refreshInterval: 30000,        // 30秒刷新一次
}
