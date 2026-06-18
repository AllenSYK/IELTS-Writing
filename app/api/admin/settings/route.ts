import { z } from 'zod'
import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

const SettingsSchema = z.object({
  defaultPlan: z.string().min(1).max(80),
  defaultDurationDays: z.number().int().min(1).max(3650),
  defaultMaxActivations: z.number().int().min(1).max(100),
  expiringReminderDays: z.number().int().min(1).max(365),
  pageSize: z.number().int().min(10).max(200),
  dateFormat: z.string().min(1).max(30),
  timezone: z.string().min(1).max(80)
})

export async function GET() {
  try {
    const { service } = await requireAdminService()
    const { data, error } = await service.from('admin_settings').select('value, updated_at').eq('id', 'default').single()
    if (error) throw error
    return json({ success: true, settings: data.value, updatedAt: data.updated_at })
  } catch (error) {
    return adminApiError(error, '无法加载管理设置')
  }
}

export async function PATCH(request: Request) {
  try {
    const { service } = await requireAdminService()
    const patch = SettingsSchema.parse(await request.json())
    const { data: current, error: loadError } = await service.from('admin_settings').select('value').eq('id', 'default').single()
    if (loadError) throw loadError
    const { data, error } = await service
      .from('admin_settings')
      .update({ value: { ...(current.value || {}), ...patch } })
      .eq('id', 'default')
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
