'use client'

import { useRef, useCallback, useEffect } from 'react'

/**
 * 请求竞态保护 Hook
 * 
 * 解决问题：
 * 1. 旧搜索结果不能覆盖新搜索结果
 * 2. 旧分页请求不能覆盖新页
 * 3. 旧设置读取不能覆盖刚保存的新值
 * 4. 旧概览请求不能覆盖最新统计
 * 
 * 使用方式：
 * ```tsx
 * const { createGuardedRequest, isStaleRequest } = useRequestRaceGuard()
 * 
 * const loadData = createGuardedRequest(async () => {
 *   const result = await fetchData()
 *   setData(result)
 * })
 * ```
 */
export function useRequestRaceGuard() {
  const requestVersionRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // 组件卸载时取消所有进行中的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])
  
  /**
   * 创建受保护的请求函数
   * 
   * 如果在请求期间有新的请求发起，旧请求的结果将被忽略
   */
  const createGuardedRequest = useCallback(<T>(
    requestFn: (signal?: AbortSignal) => Promise<T>,
    onSuccess?: (result: T) => void,
    onError?: (error: Error) => void
  ) => {
    return async () => {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      // 创建新的 AbortController
      const controller = new AbortController()
      abortControllerRef.current = controller
      
      // 递增请求版本
      const version = ++requestVersionRef.current
      
      try {
        const result = await requestFn(controller.signal)
        
        // 检查是否为最新请求
        if (version !== requestVersionRef.current) {
          // 旧请求，忽略结果
          return null
        }
        
        onSuccess?.(result)
        return result
      } catch (error) {
        // 检查是否为 AbortError
        if (error instanceof DOMException && error.name === 'AbortError') {
          // 请求被取消，不处理
          return null
        }
        
        // 检查是否为最新请求
        if (version !== requestVersionRef.current) {
          // 旧请求的错误，忽略
          return null
        }
        
        const err = error instanceof Error ? error : new Error(String(error))
        onError?.(err)
        throw err
      }
    }
  }, [])
  
  /**
   * 检查请求是否已过时
   */
  const isStaleRequest = useCallback((version: number) => {
    return version !== requestVersionRef.current
  }, [])
  
  /**
   * 获取当前请求版本
   */
  const getRequestVersion = useCallback(() => {
    return requestVersionRef.current
  }, [])
  
  /**
   * 取消当前进行中的请求
   */
  const cancelCurrentRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])
  
  return {
    createGuardedRequest,
    isStaleRequest,
    getRequestVersion,
    cancelCurrentRequest
  }
}

/**
 * SWR 竞态保护配置
 * 
 * 用于 SWR 请求的竞态保护
 */
export function useSWRRaceGuard() {
  const requestIdRef = useRef(0)
  
  /**
   * 创建 SWR fetcher 包装器
   * 
   * 确保只有最新请求的结果会被使用
   */
  const createGuardedFetcher = useCallback(<T>(
    fetcher: (url: string) => Promise<T>
  ) => {
    return async (url: string): Promise<T> => {
      const requestId = ++requestIdRef.current
      const result = await fetcher(url)
      
      // 检查是否为最新请求
      if (requestId !== requestIdRef.current) {
        // 返回一个永远不会resolve的Promise，让SWR忽略这个结果
        return new Promise(() => {}) as unknown as T
      }
      
      return result
    }
  }, [])
  
  return { createGuardedFetcher }
}

/**
 * 搜索防抖 Hook
 * 
 * 用于搜索输入的防抖处理
 */
export function useSearchDebounce(
  callback: (value: string) => void,
  delay: number = 320
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const debouncedCallback = useCallback((value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    
    timerRef.current = setTimeout(() => {
      callback(value)
    }, delay)
  }, [callback, delay])
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])
  
  return debouncedCallback
}

/**
 * 分页竞态保护
 * 
 * 用于分页请求的竞态保护
 */
export function usePaginationRaceGuard() {
  const currentPageRef = useRef<number>(1)
  const requestVersionRef = useRef(0)
  
  /**
   * 创建受保护的分页请求
   */
  const createGuardedPageRequest = useCallback(
    async <T>(
      page: number,
      requestFn: () => Promise<T>,
      onSuccess: (result: T, page: number) => void
    ): Promise<T | null> => {
      // 更新当前页码
      currentPageRef.current = page
      
      // 递增请求版本
      const version = ++requestVersionRef.current
      
      try {
        const result = await requestFn()
        
        // 检查是否为最新请求且页码未变
        if (version !== requestVersionRef.current || page !== currentPageRef.current) {
          return null
        }
        
        onSuccess(result, page)
        return result
      } catch (error) {
        // 检查是否为最新请求
        if (version !== requestVersionRef.current) {
          return null
        }
        
        throw error
      }
    },
    []
  )
  
  return {
    createGuardedPageRequest,
    currentPageRef
  }
}
