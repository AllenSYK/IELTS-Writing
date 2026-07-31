import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction = 
  | 'admin_login'
  | 'admin_logout'
  | 'reveal_license_code'
  | 'create_license'
  | 'update_license'
  | 'revoke_license'
  | 'delete_license'
  | 'bind_user'
  | 'batch_bind_users'
  | 'update_user'
  | 'update_binding'
  | 'delete_user'
  | 'publish_past_paper'
  | 'unpublish_past_paper'
  | 'archive_past_paper'
  | 'delete_past_paper'
  | 'ai_classify'
  | 'update_past_paper'
  | 'update_settings'
  | 'update_ai_models'
  | 'import_recalled'
  | 'batch_publish'
  | 'batch_archive'

export type ResourceType = 
  | 'license'
  | 'user'
  | 'past_paper'
  | 'settings'
  | 'binding'
  | 'batch_task'

export type AuditResult = 'success' | 'failure' | 'partial'

export interface AuditLogEntry {
  adminUserId: string
  action: AuditAction
  resourceType: ResourceType
  resourceId?: string
  requestId?: string
  result?: AuditResult
  changedFields?: Record<string, unknown>
  errorMessage?: string
  ipHash?: string
  userAgentSummary?: string
  metadata?: Record<string, unknown>
}

/**
 * 记录管理操作审计日志
 * 
 * 设计原则：
 * 1. 不保存密码、token、完整激活码等敏感数据
 * 2. changed_fields 只记录字段名和安全摘要
 * 3. 失败操作也记录结果
 * 4. 审计写入失败不应阻断主业务
 */
export async function logAdminAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: SupabaseClient<any, any, any>,
  entry: AuditLogEntry
): Promise<string | null> {
  try {
    const ipHash = entry.ipHash
      ? /^[a-f0-9]{64}$/i.test(entry.ipHash)
        ? entry.ipHash
        : await hashIpAddress(entry.ipHash)
      : null

    const { data, error } = await service.rpc('log_admin_action', {
      p_admin_user_id: entry.adminUserId,
      p_action: entry.action,
      p_resource_type: entry.resourceType,
      p_resource_id: entry.resourceId || null,
      p_request_id: entry.requestId || null,
      p_result: entry.result || 'success',
      p_changed_fields: entry.changedFields ? sanitizeChangedFields(entry.changedFields) : null,
      p_error_message: entry.errorMessage ? sanitizeErrorMessage(entry.errorMessage) : null,
      p_ip_hash: ipHash,
      p_user_agent_summary: entry.userAgentSummary ? sanitizeUserAgent(entry.userAgentSummary) : null,
      p_metadata: entry.metadata || {}
    })

    if (error) {
      console.error('[AuditLog] Failed to write audit log:', error.message)
      return null
    }

    return data
  } catch (error) {
    console.error('[AuditLog] Unexpected error:', error)
    return null
  }
}

/**
 * 清理变更字段，移除敏感值
 */
function sanitizeChangedFields(fields: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(fields)) {
    // 跳过敏感字段
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    
    // 只记录字段名和类型，不记录完整值
    if (value === null || value === undefined) {
      sanitized[key] = 'null'
    } else if (typeof value === 'object') {
      sanitized[key] = `[${typeof value}]`
    } else if (typeof value === 'string' && value.length > 50) {
      sanitized[key] = `[string:${value.length}chars]`
    } else {
      sanitized[key] = String(value)
    }
  }
  
  return sanitized
}

/**
 * 检查是否为敏感字段
 */
function isSensitiveField(key: string): boolean {
  const sensitivePatterns = [
    'password',
    'token',
    'secret',
    'key',
    'code_value',
    'code_hash',
    'authorization',
    'access_token',
    'refresh_token',
    'service_role',
    'api_key',
    'ai_key'
  ]
  
  const lowerKey = key.toLowerCase()
  return sensitivePatterns.some(pattern => lowerKey.includes(pattern))
}

/**
 * 清理错误消息，移除敏感信息
 */
function sanitizeErrorMessage(message: string): string {
  // 移除可能的激活码
  let sanitized = message.replace(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g, '[LICENSE_CODE]')
  
  // 移除可能的邮箱
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
  
  // 移除可能的UUID
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
  
  // 限制长度
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500) + '...'
  }
  
  return sanitized
}

/**
 * 清理 User-Agent，只保留浏览器和操作系统摘要
 */
function sanitizeUserAgent(userAgent: string): string {
  // 只保留前100个字符
  if (userAgent.length > 100) {
    return userAgent.substring(0, 100) + '...'
  }
  return userAgent
}

/**
 * 生成IP地址哈希
 */
export async function hashIpAddress(ip: string): Promise<string | null> {
  const salt = process.env.AUDIT_SALT?.trim()
  if (!salt) return null
  const encoder = new TextEncoder()
  const data = encoder.encode(`${ip}:${salt}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 从请求中提取审计信息
 */
export function extractAuditInfo(request: Request): {
  ip?: string
  userAgent?: string
  requestId?: string
} {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown'
  
  const userAgent = request.headers.get('user-agent') || 'unknown'
  const requestId = request.headers.get('x-request-id') || undefined
  
  return { ip, userAgent, requestId }
}
