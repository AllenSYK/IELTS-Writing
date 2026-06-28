import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { logAdminAudit, extractAuditInfo } from '@/lib/admin/audit-log'

/**
 * 验证 IANA 时区
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const SettingsSchema = z.object({
  defaultPlan: z.string().min(1).max(80),
  defaultDurationDays: z.number().int().min(1).max(3650),
  defaultMaxActivations: z.number().int().min(1).max(100),
  expiringReminderDays: z.number().int().min(1).max(365),
  pageSize: z.number().int().min(10).max(200),
  dateFormat: z.string().min(1).max(30),
  timezone: z.string().min(1).max(80).refine(isValidTimezone, {
    message: '无效的时区，请使用 IANA 时区格式（如 Asia/Shanghai）'
  }),
  // 乐观锁字段
  expectedUpdatedAt: z.string().datetime().optional()
})

// 安全的默认设置
const DEFAULT_SETTINGS = {
  defaultPlan: 'standard',
  defaultDurationDays: 365,
  defaultMaxActivations: 1,
  expiringReminderDays: 14,
  pageSize: 50,
  dateFormat: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

export async function GET(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  
  try {
    const { service } = await requireAdminService()
    const { data, error } = await service
      .from('admin_settings')
      .select('value, updated_at')
      .eq('id', 'default')
      .single()
    
    // 如果查询失败或数据为空，返回默认设置
    if (error || !data) {
      return json({ 
        success: true, 
        settings: DEFAULT_SETTINGS, 
        updatedAt: null,
        requestId
      })
    }
    
    // 合并默认值和存储的值
    const settings = { ...DEFAULT_SETTINGS, ...(data.value || {}) }
    return json({ success: true, settings, updatedAt: data.updated_at, requestId })
  } catch (error) {
    return adminApiError(error, '无法加载管理设置')
  }
}

export async function PATCH(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  const auditInfo = extractAuditInfo(request)
  
  try {
    const { user, service } = await requireAdminService()
    const body = await request.json()
    const { expectedUpdatedAt, ...patch } = SettingsSchema.parse(body)
    
    // 并发保护：检查版本
    if (expectedUpdatedAt) {
      const { data: current } = await service
        .from('admin_settings')
        .select('updated_at')
        .eq('id', 'default')
        .single()
      
      if (current && current.updated_at !== expectedUpdatedAt) {
        // 记录冲突审计日志
        await logAdminAudit(service, {
          adminUserId: user.id,
          action: 'update_settings',
          resourceType: 'settings',
          resourceId: 'default',
          requestId,
          result: 'failure',
          errorMessage: '设置已被其他管理员更新',
          ipHash: auditInfo.ip,
          userAgentSummary: auditInfo.userAgent
        })
        
        return json({ 
          success: false, 
          code: 'CONFLICT', 
          message: '设置已被其他管理员更新，请刷新后重新编辑。',
          requestId
        }, { status: 409 })
      }
    }
    
    // 使用 upsert 确保默认行存在
    const { data, error } = await service
      .from('admin_settings')
      .upsert({
        id: 'default',
        value: patch,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select('value, updated_at')
      .single()
    
    if (error) throw error
    
    // 记录成功审计日志
    const changedFieldNames = Object.keys(patch).filter(k => k !== 'expectedUpdatedAt')
    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'update_settings',
      resourceType: 'settings',
      resourceId: 'default',
      requestId,
      result: 'success',
      changedFields: { fields: changedFieldNames },
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })
    
    return json({ 
      success: true, 
      settings: data.value, 
      updatedAt: data.updated_at,
      requestId
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ 
        success: false, 
        code: 'INVALID_INPUT', 
        message: '设置参数无效',
        requestId
      }, { status: 400 })
    }
    
    // 记录失败审计日志
    try {
      const { user, service } = await requireAdminService()
      await logAdminAudit(service, {
        adminUserId: user.id,
        action: 'update_settings',
        resourceType: 'settings',
        resourceId: 'default',
        requestId,
        result: 'failure',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        ipHash: auditInfo.ip,
        userAgentSummary: auditInfo.userAgent
      })
    } catch {
      // 审计日志写入失败不影响错误响应
    }
    
    return adminApiError(error, '无法保存管理设置')
  }
}
