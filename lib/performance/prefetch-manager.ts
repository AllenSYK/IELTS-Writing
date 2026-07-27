/**
 * Prefetch Manager - 智能预加载管理
 * 
 * 特性：
 * - 空闲时预加载
 * - 优先级队列
 * - 最大并发控制
 * - 网络感知
 * - 页面可见性感知
 */

import { markRoutePrefetched, isRoutePrefetched } from './cache-manager'

type PrefetchPriority = 'high' | 'normal' | 'low'

type PrefetchTask = {
  id: string
  priority: PrefetchPriority
  execute: () => Promise<void>
  timestamp: number
}

type PrefetchConfig = {
  maxConcurrent: number
  delayBetweenBatches: number
  idleTimeout: number
}

const DEFAULT_CONFIG: PrefetchConfig = {
  maxConcurrent: 2,
  delayBetweenBatches: 500,
  idleTimeout: 1200
}

// 任务队列
const taskQueue: PrefetchTask[] = []
let activeCount = 0
let isRunning = false
let isPaused = false
let currentUserId: string | null = null

// 路由优先级配置
const ROUTE_PRIORITIES: Record<string, PrefetchPriority> = {
  '/study-plan': 'high',
  '/practice': 'high',
  '/study-plan/errors': 'normal',
  '/history': 'normal',
  '/analytics': 'low',
  '/dashboard': 'low'
}

/**
 * 设置当前用户 ID
 */
export function setCurrentUserId(userId: string | null): void {
  if (currentUserId !== userId) {
    currentUserId = userId
    // 用户切换时清理队列
    taskQueue.length = 0
    activeCount = 0
  }
}

/**
 * 检查是否应该预加载
 */
function shouldPrefetch(): boolean {
  // 页面不可见时不预加载
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false
  }
  
  // Save-Data 模式不预加载
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) {
      return false
    }
  }
  
  // 慢速网络不预加载数据（只预加载路由代码）
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as { connection?: { effectiveType?: string } }).connection
    if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return false
    }
  }
  
  return true
}

/**
 * 检查浏览器是否空闲
 */
function requestIdleCallbackPolyfill(callback: () => void, timeout?: number): number {
  const t = timeout || 1000
  if (typeof window !== 'undefined') {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; setTimeout: (cb: () => void, delay: number) => number }
    if (w.requestIdleCallback) {
      return w.requestIdleCallback(callback, { timeout: t })
    }
    return w.setTimeout(callback, t)
  }
  return setTimeout(callback, t) as unknown as number
}

/**
 * 添加预加载任务
 */
export function addPrefetchTask(
  id: string,
  task: () => Promise<void>,
  priority: PrefetchPriority = 'normal'
): void {
  // 检查是否已存在
  if (taskQueue.some(t => t.id === id)) {
    return
  }
  
  // 检查是否已在运行
  if (activeCount > 0) {
    // 这里简化处理，实际应该追踪正在运行的任务 ID
  }
  
  taskQueue.push({
    id,
    priority,
    execute: task,
    timestamp: Date.now()
  })
  
  // 按优先级排序
  sortQueue()
  
  // 如果未运行，启动处理
  if (!isRunning) {
    startProcessing()
  }
}

/**
 * 按优先级排序队列
 */
function sortQueue(): void {
  const priorityOrder: Record<PrefetchPriority, number> = {
    high: 0,
    normal: 1,
    low: 2
  }
  
  taskQueue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

/**
 * 提升任务优先级
 */
export function promoteTask(id: string): void {
  const task = taskQueue.find(t => t.id === id)
  if (task) {
    task.priority = 'high'
    sortQueue()
  }
}

/**
 * 开始处理队列
 */
function startProcessing(): void {
  if (isRunning) return
  isRunning = true
  
  // 延迟启动，等待页面可交互
  requestIdleCallbackPolyfill(() => {
    processQueue()
  }, DEFAULT_CONFIG.idleTimeout)
}

/**
 * 处理队列
 */
async function processQueue(): Promise<void> {
  if (isPaused || !shouldPrefetch()) {
    isRunning = false
    return
  }
  
  while (taskQueue.length > 0 && activeCount < DEFAULT_CONFIG.maxConcurrent) {
    if (isPaused || !shouldPrefetch()) {
      break
    }
    
    const task = taskQueue.shift()
    if (!task) break
    
    activeCount++
    executeTask(task).finally(() => {
      activeCount--
      
      // 批次间延迟
      setTimeout(() => {
        if (taskQueue.length > 0 && !isPaused) {
          processQueue()
        } else {
          isRunning = false
        }
      }, DEFAULT_CONFIG.delayBetweenBatches)
    })
  }
  
  if (taskQueue.length === 0 && activeCount === 0) {
    isRunning = false
  }
}

/**
 * 执行单个任务
 */
async function executeTask(task: PrefetchTask): Promise<void> {
  try {
    await task.execute()
  } catch (error) {
    // 预加载失败静默处理
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Prefetch] ${task.id} failed:`, error)
    }
  }
}

/**
 * 暂停预加载
 */
export function pausePrefetch(): void {
  isPaused = true
}

/**
 * 恢复预加载
 */
export function resumePrefetch(): void {
  isPaused = false
  if (taskQueue.length > 0 && !isRunning) {
    startProcessing()
  }
}

/**
 * 清空队列
 */
export function clearPrefetchQueue(): void {
  taskQueue.length = 0
}

/**
 * 获取队列状态（调试用）
 */
export function getPrefetchStatus(): {
  queueLength: number
  activeCount: number
  isRunning: boolean
  isPaused: boolean
} {
  return {
    queueLength: taskQueue.length,
    activeCount,
    isRunning,
    isPaused
  }
}

/**
 * 预加载路由代码
 */
export function prefetchRoute(router: { prefetch: (route: string) => void }, route: string): void {
  if (!currentUserId) return
  
  // 检查是否已预加载
  if (isRoutePrefetched(currentUserId, route)) {
    return
  }
  
  addPrefetchTask(
    `route:${route}`,
    async () => {
      router.prefetch(route)
      markRoutePrefetched(currentUserId!, route)
    },
    ROUTE_PRIORITIES[route] || 'normal'
  )
}

/**
 * 预加载路由和轻量数据
 */
export function prefetchRouteWithData(
  router: { prefetch: (route: string) => void },
  route: string,
  dataFetcher: () => Promise<void>
): void {
  if (!currentUserId) return
  
  const cacheKey = `route-data:${route}`
  if (isRoutePrefetched(currentUserId, cacheKey)) {
    return
  }
  
  addPrefetchTask(
    cacheKey,
    async () => {
      // 先预加载路由代码
      router.prefetch(route)
      // 再预加载轻量数据
      await dataFetcher()
      markRoutePrefetched(currentUserId!, cacheKey)
    },
    ROUTE_PRIORITIES[route] || 'normal'
  )
}

/**
 * 监听页面可见性变化
 */
export function setupVisibilityListener(): () => void {
  if (typeof document === 'undefined') return () => {}
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      pausePrefetch()
    } else {
      resumePrefetch()
    }
  }
  
  document.addEventListener('visibilitychange', handleVisibilityChange)
  
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

/**
 * 监听网络状态变化
 */
export function setupNetworkListener(): () => void {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return () => {}
  }
  
  const connection = (navigator as { connection?: { addEventListener?: (event: string, handler: () => void) => void; removeEventListener?: (event: string, handler: () => void) => void } }).connection
  if (!connection?.addEventListener) return () => {}
  
  const handleNetworkChange = () => {
    // 网络变化时重新评估是否应该预加载
    if (!shouldPrefetch()) {
      pausePrefetch()
    } else {
      resumePrefetch()
    }
  }
  
  connection.addEventListener('change', handleNetworkChange)
  
  return () => {
    connection.removeEventListener?.('change', handleNetworkChange)
  }
}
