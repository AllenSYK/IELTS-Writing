import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

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
  })
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

export async function GET() {
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
        updatedAt: null 
      })
    }
    
    // 合并默认值和存储的值
    const settings = { ...DEFAULT_SETTINGS, ...(data.value || {}) }
    return json({ success: true, settings, updatedAt: data.updated_at })
  } catch (error) {
    return adminApiError(error, '无法加载管理设置')
  }
}

export async function PATCH(request: Request) {
  try {
    const { service } = await requireAdminService()
    const patch = SettingsSchema.parse(await request.json())
    
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
    return json({ success: true, settings: data.value, updatedAt: data.updated_at })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, code: 'INVALID_INPUT', message: '设置参数无效' }, { status: 400 })
    }
    return adminApiError(error, '无法保存管理设置')
  }
}
