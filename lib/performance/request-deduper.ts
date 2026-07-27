/**
 * Request Deduplicator - 请求去重
 * 
 * 相同请求在 in-flight 期间复用同一个 Promise
 * 避免重复发送网络请求
 */

type InFlightRequest<T> = {
  promise: Promise<T>
  controller: AbortController
  timestamp: number
}

// 正在进行的请求
const inFlightRequests = new Map<string, InFlightRequest<unknown>>()

// 请求超时时间（30秒）
const REQUEST_TIMEOUT = 30 * 1000

/**
 * 生成请求 key
 */
export function buildRequestKey(
  endpoint: string,
  options?: {
    method?: string
    params?: Record<string, string>
    body?: unknown
  }
): string {
  const method = options?.method?.toUpperCase() || 'GET'
  const paramsStr = options?.params ? JSON.stringify(options.params) : ''
  const bodyStr = options?.body ? JSON.stringify(options.body) : ''
  return `${method}:${endpoint}:${paramsStr}:${bodyStr}`
}

/**
 * 获取去重后的请求
 * 
 * 如果相同请求正在进行，返回已有的 Promise
 * 否则创建新请求
 */
export function dedupedFetch<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: {
    timeout?: number
    priority?: 'high' | 'normal' | 'low'
  }
): Promise<T> {
  // 检查是否有相同的 in-flight 请求
  const existing = inFlightRequests.get(key)
  if (existing) {
    return existing.promise as Promise<T>
  }
  
  // 创建新的 AbortController
  const controller = new AbortController()
  const timeout = options?.timeout || REQUEST_TIMEOUT
  
  // 设置超时
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeout)
  
  // 创建请求 Promise
  const promise = fetcher(controller.signal)
    .finally(() => {
      clearTimeout(timeoutId)
      inFlightRequests.delete(key)
    })
  
  // 存储 in-flight 请求
  inFlightRequests.set(key, {
    promise: promise as Promise<unknown>,
    controller,
    timestamp: Date.now()
  })
  
  return promise
}

/**
 * 取消指定请求
 */
export function cancelRequest(key: string): void {
  const request = inFlightRequests.get(key)
  if (request) {
    request.controller.abort()
    inFlightRequests.delete(key)
  }
}

/**
 * 取消所有请求
 */
export function cancelAllRequests(): void {
  for (const [key, request] of inFlightRequests.entries()) {
    request.controller.abort()
    inFlightRequests.delete(key)
  }
}

/**
 * 取消指定前缀的请求
 */
export function cancelRequestsByPrefix(prefix: string): void {
  for (const [key, request] of inFlightRequests.entries()) {
    if (key.startsWith(prefix)) {
      request.controller.abort()
      inFlightRequests.delete(key)
    }
  }
}

/**
 * 清理过期的 in-flight 请求
 */
export function cleanupStaleRequests(): void {
  const now = Date.now()
  for (const [key, request] of inFlightRequests.entries()) {
    if (now - request.timestamp > REQUEST_TIMEOUT) {
      request.controller.abort()
      inFlightRequests.delete(key)
    }
  }
}

/**
 * 获取正在进行的请求数量（调试用）
 */
export function getInFlightCount(): number {
  return inFlightRequests.size
}

/**
 * 检查是否有指定请求正在进行
 */
export function hasInFlightRequest(key: string): boolean {
  return inFlightRequests.has(key)
}

/**
 * 带去重的 fetch 封装
 */
export async function dedupedJsonFetch<T>(
  endpoint: string,
  options?: RequestInit & {
    params?: Record<string, string>
    cacheKey?: string
    timeout?: number
  }
): Promise<T> {
  const method = options?.method?.toUpperCase() || 'GET'
  const key = options?.cacheKey || buildRequestKey(endpoint, { 
    method, 
    params: options?.params,
    body: options?.body ? JSON.parse(options.body as string) : undefined
  })
  
  return dedupedFetch<T>(
    key,
    async (signal) => {
      // 构建完整 URL
      let url = endpoint
      if (options?.params) {
        const searchParams = new URLSearchParams(options.params)
        url = `${endpoint}?${searchParams.toString()}`
      }
      
      // 发起请求
      const response = await fetch(url, {
        ...options,
        signal
      })
      
      if (!response.ok) {
        throw new Error(`请求失败 (${response.status})`)
      }
      
      return response.json()
    },
    { timeout: options?.timeout }
  )
}
