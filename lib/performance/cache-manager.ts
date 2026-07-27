/**
 * Cache Manager - 三级缓存系统
 * 
 * 内存缓存 → sessionStorage → localStorage
 * 
 * 特性：
 * - userId 隔离
 * - TTL 过期
 * - 版本控制
 * - 退出登录清理
 */

type CacheEntry<T> = {
  data: T
  timestamp: number
  ttl: number
  version: string
  userId: string
}

type CacheLayer = 'memory' | 'session' | 'local'

const CACHE_PREFIX = 'ielts:'
const DEFAULT_VERSION = 'v1'

// 内存缓存
const memoryCache = new Map<string, CacheEntry<unknown>>()

// 缓存配置
const CACHE_CONFIG: Record<string, { ttl: number; layer: CacheLayer }> = {
  // 公共题库 - 较长缓存
  'question-bank': { ttl: 10 * 60 * 1000, layer: 'session' }, // 10分钟
  
  // 历史记录列表摘要 - 短缓存
  'history-summary': { ttl: 60 * 1000, layer: 'session' }, // 60秒
  
  // 错题本列表摘要 - 短缓存
  'error-notebook-summary': { ttl: 60 * 1000, layer: 'session' }, // 60秒
  
  // 学习规划摘要 - 短缓存
  'study-plan-summary': { ttl: 20 * 1000, layer: 'session' }, // 20秒
  
  // 学习分析概览 - 中等缓存
  'analytics-overview': { ttl: 2 * 60 * 1000, layer: 'session' }, // 2分钟
  
  // 账号资料 - 短缓存
  'profile': { ttl: 45 * 1000, layer: 'session' }, // 45秒
  
  // 许可证状态 - 极短缓存
  'license': { ttl: 20 * 1000, layer: 'memory' }, // 20秒，仅内存
  
  // 路由预加载状态
  'route-prefetched': { ttl: 5 * 60 * 1000, layer: 'memory' }, // 5分钟
}

/**
 * 生成缓存 key
 */
function buildCacheKey(userId: string, resource: string, params?: string): string {
  const paramsHash = params ? `:${hashString(params)}` : ''
  return `${CACHE_PREFIX}${userId}:${resource}:${DEFAULT_VERSION}${paramsHash}`
}

/**
 * 简单字符串哈希
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * 获取缓存配置
 */
function getConfig(resource: string) {
  return CACHE_CONFIG[resource] || { ttl: 60 * 1000, layer: 'session' }
}

/**
 * 从指定层读取缓存
 */
function readFromLayer<T>(key: string, layer: CacheLayer): CacheEntry<T> | null {
  try {
    let raw: string | null = null
    
    if (layer === 'memory') {
      return memoryCache.get(key) as CacheEntry<T> | null
    }
    
    if (layer === 'session') {
      raw = sessionStorage.getItem(key)
    } else if (layer === 'local') {
      raw = localStorage.getItem(key)
    }
    
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

/**
 * 写入指定层缓存
 */
function writeToLayer<T>(key: string, entry: CacheEntry<T>, layer: CacheLayer): void {
  try {
    if (layer === 'memory') {
      memoryCache.set(key, entry)
      return
    }
    
    const serialized = JSON.stringify(entry)
    
    if (layer === 'session') {
      sessionStorage.setItem(key, serialized)
    } else if (layer === 'local') {
      localStorage.setItem(key, serialized)
    }
  } catch {
    // 存储空间不足时静默失败
  }
}

/**
 * 检查缓存是否有效
 */
function isValid<T>(entry: CacheEntry<T> | null, userId: string): entry is CacheEntry<T> {
  if (!entry) return false
  if (entry.userId !== userId) return false
  if (Date.now() - entry.timestamp > entry.ttl) return false
  return true
}

/**
 * 读取缓存
 */
export function getCache<T>(userId: string, resource: string, params?: string): T | null {
  if (!userId) return null
  
  const key = buildCacheKey(userId, resource, params)
  const config = getConfig(resource)
  
  // 尝试从配置的层读取
  const entry = readFromLayer<T>(key, config.layer)
  if (isValid(entry, userId)) {
    return entry.data
  }
  
  // 如果配置层没有，尝试从内存缓存读取（更快）
  if (config.layer !== 'memory') {
    const memoryEntry = readFromLayer<T>(key, 'memory')
    if (isValid(memoryEntry, userId)) {
      return memoryEntry.data
    }
  }
  
  return null
}

/**
 * 写入缓存
 */
export function setCache<T>(userId: string, resource: string, data: T, params?: string): void {
  if (!userId) return
  
  const key = buildCacheKey(userId, resource, params)
  const config = getConfig(resource)
  
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: config.ttl,
    version: DEFAULT_VERSION,
    userId
  }
  
  // 写入配置的层
  writeToLayer(key, entry, config.layer)
  
  // 同时写入内存缓存（加速访问）
  if (config.layer !== 'memory') {
    writeToLayer(key, entry, 'memory')
  }
}

/**
 * 删除指定缓存
 */
export function deleteCache(userId: string, resource: string, params?: string): void {
  const key = buildCacheKey(userId, resource, params)
  
  memoryCache.delete(key)
  
  try {
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
  } catch {
    // 忽略错误
  }
}

/**
 * 清理用户所有缓存（退出登录时调用）
 */
export function clearUserCache(userId: string): void {
  if (!userId) return
  
  const prefix = `${CACHE_PREFIX}${userId}:`
  
  // 清理内存缓存
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
    }
  }
  
  // 清理 sessionStorage
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key))
  } catch {
    // 忽略错误
  }
  
  // 清理 localStorage
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch {
    // 忽略错误
  }
}

/**
 * 标记路由已预加载
 */
export function markRoutePrefetched(userId: string, route: string): void {
  setCache(userId, 'route-prefetched', true, route)
}

/**
 * 检查路由是否已预加载
 */
export function isRoutePrefetched(userId: string, route: string): boolean {
  return getCache<boolean>(userId, 'route-prefetched', route) === true
}

/**
 * 获取缓存统计信息（调试用）
 */
export function getCacheStats(): { memory: number; session: number; local: number } {
  let sessionCount = 0
  let localCount = 0
  
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) sessionCount++
    }
  } catch {}
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) localCount++
    }
  } catch {}
  
  return {
    memory: memoryCache.size,
    session: sessionCount,
    local: localCount
  }
}
