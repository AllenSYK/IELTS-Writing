/**
 * 分布式限流器
 *
 * 使用 PostgreSQL 原子 RPC 实现跨实例限流
 * 支持 Vercel Serverless 多实例环境
 */

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export interface RateLimitConfig {
  /** 时间窗口（秒） */
  windowSeconds: number
  /** 窗口内最大请求数 */
  maxRequests: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

/**
 * 通过 PostgreSQL RPC 检查限流
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service.rpc('check_rate_limit', {
    p_key: key,
    p_window_seconds: config.windowSeconds,
    p_max_requests: config.maxRequests
  })

  if (error) {
    // 限流检查失败时放行，不阻断业务
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowSeconds * 1000 }
  }

  const result = Array.isArray(data) ? data[0] : data
  return {
    allowed: result?.allowed ?? true,
    remaining: result?.remaining ?? config.maxRequests,
    resetAt: result?.reset_at ? new Date(result.reset_at as string).getTime() : Date.now() + config.windowSeconds * 1000,
    retryAfter: result?.retry_after as number | undefined
  }
}

/**
 * 获取客户端 IP 地址
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * 创建限流响应
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后重试。',
      retryAfter: result.retryAfter
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter || 60),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000))
      }
    }
  )
}

/**
 * 管理登录限流配置
 *
 * IP + 邮箱维度：5分钟内最多5次失败尝试
 */
export const ADMIN_LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowSeconds: 5 * 60,
  maxRequests: 5
}

/**
 * AI 分类限流配置
 *
 * 管理员维度：1小时内最多10次
 */
export const AI_CLASSIFY_RATE_LIMIT: RateLimitConfig = {
  windowSeconds: 60 * 60,
  maxRequests: 10
}
