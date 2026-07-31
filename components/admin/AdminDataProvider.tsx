'use client'

import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'

/**
 * 管理端 SWR 缓存策略
 * 
 * 设计原则：
 * 1. 静态或低频元数据 → 较长缓存 (60秒)
 * 2. 管理列表 → 短缓存 (5秒) + 按操作失效
 * 3. 任务进度 → 轮询或短间隔 (3秒)
 * 4. 昂贵统计 → 合理缓存 (30秒) + 写后失效
 * 
 * 写操作后使用精准 mutate()，不全局刷新
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        // 默认去重间隔 5 秒，列表数据较短
        dedupingInterval: 5_000,
        // 保留旧数据避免闪烁
        keepPreviousData: true,
        // 聚焦时不自动刷新，由各组件按需控制
        revalidateOnFocus: false,
        // 网络恢复时刷新
        revalidateOnReconnect: true,
        // 不自动重试，避免重复请求
        shouldRetryOnError: false,
        // 错误重试次数
        errorRetryCount: 0,
        // 自定义 fetcher 错误处理
        onError: (error) => {
          console.error('[AdminSWR]', error.message)
        }
      }}
    >
      {children}
    </SWRConfig>
  )
}

/**
 * 管理端缓存 key 常量
 * 用于精准 mutate，避免硬编码字符串
 */
export const ADMIN_CACHE_KEYS = {
  // 总览统计
  OVERVIEW: '/api/admin/overview',
  // 激活码列表
  LICENSES: '/api/admin/licenses',
  LICENSES_LIST: '/api/admin/licenses/list',
  // 用户列表
  USERS: '/api/admin/users',
  USERS_LIST: '/api/admin/users/list',
  // 邮箱绑定
  BINDINGS: '/api/admin/bindings',
  // 真题列表
  PAST_PAPERS: '/api/admin/past-papers',
  // 管理设置
  SETTINGS: '/api/admin/settings',
  // AI 模型配置
  MODELS: '/api/admin/models',
} as const

/**
 * 缓存失效策略配置
 * 
 * 每个写操作后应调用对应的失效函数
 */
export const CACHE_INVALIDATION = {
  // 激活码相关操作后
  afterLicenseChange: [
    ADMIN_CACHE_KEYS.LICENSES,
    ADMIN_CACHE_KEYS.LICENSES_LIST,
    ADMIN_CACHE_KEYS.OVERVIEW,
  ],
  // 用户相关操作后
  afterUserChange: [
    ADMIN_CACHE_KEYS.USERS,
    ADMIN_CACHE_KEYS.USERS_LIST,
    ADMIN_CACHE_KEYS.OVERVIEW,
  ],
  // 绑定相关操作后
  afterBindingChange: [
    ADMIN_CACHE_KEYS.BINDINGS,
    ADMIN_CACHE_KEYS.OVERVIEW,
  ],
  // 真题相关操作后
  afterPastPaperChange: [
    ADMIN_CACHE_KEYS.PAST_PAPERS,
    ADMIN_CACHE_KEYS.OVERVIEW,
  ],
  // 设置变更后
  afterSettingsChange: [
    ADMIN_CACHE_KEYS.SETTINGS,
  ],
  afterModelsChange: [
    ADMIN_CACHE_KEYS.MODELS,
  ],
} as const
