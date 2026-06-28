/**
 * 简单的内存限流器
 * 
 * 用于API端点的频率限制
 */

type RateLimitEntry = {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// 定期清理过期的限流记录
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key)
    }
  }
}, 60_000) // 每分钟清理一次

export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number
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
 * 检查请求是否被限流
 * 
 * @param key 限流键（如 IP 地址、用户ID 等）
 * @param config 限流配置
 * @returns 限流结果
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // 如果没有记录或已过期，创建新记录
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + config.windowMs
    rateLimitStore.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt
    }
  }

  // 如果未超过限制
  if (entry.count < config.maxRequests) {
    entry.count++
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt
    }
  }

  // 超过限制
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.resetAt,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000)
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
 * IP + 邮箱维度：
 * - 5分钟内最多5次尝试
 */
export const ADMIN_LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 5 * 60 * 1000, // 5分钟
  maxRequests: 5
}

/**
 * AI 分类限流配置
 * 
 * 管理员维度：
 * - 1小时内最多10次
 */
export const AI_CLASSIFY_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1小时
  maxRequests: 10
}
