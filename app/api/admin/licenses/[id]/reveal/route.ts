import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

/**
 * 获取激活码完整值
 * 
 * 安全要求：
 * 1. 需要管理员鉴权
 * 2. 记录审计日志
 * 3. 返回完整码用于复制
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, service } = await requireAdminService()
    const { id } = await context.params
    
    // 获取激活码
    const { data: license, error } = await service
      .from('license_codes')
      .select('id, code_value, code_prefix, plan')
      .eq('id', id)
      .single()
    
    if (error) throw error
    if (!license) {
      return json({ success: false, message: '激活码不存在' }, { status: 404 })
    }
    
    // 记录审计日志（异步，不阻塞响应）
    // 使用 Promise.resolve 包装以确保有 .then 和 .catch 方法
    Promise.resolve(
      service
        .from('admin_audit_logs')
        .insert({
          admin_user_id: user.id,
          action: 'reveal_license_code',
          target_type: 'license',
          target_id: id,
          details: {
            code_prefix: license.code_prefix,
            plan: license.plan,
            timestamp: new Date().toISOString()
          }
        })
        .select()
        .single()
    ).then(() => {}).catch(() => {})
    
    return json({
      success: true,
      code_value: license.code_value
    })
  } catch (error) {
    return adminApiError(error, '无法获取激活码')
  }
}
