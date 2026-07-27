import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

/**
 * 获取激活码完整值
 * 
 * 安全要求：
 * 1. 需要管理员鉴权
 * 2. 记录审计日志
 * 3. 返回完整码用于复制
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, service } = await requireAdminService(request)
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
    
    const auditInfo = extractAuditInfo(request)
    const auditId = await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'reveal_license_code',
      resourceType: 'license',
      resourceId: id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent,
      metadata: {
        codePrefix: license.code_prefix,
        plan: license.plan
      }
    })
    if (!auditId) {
      return json({
        success: false,
        code: 'AUDIT_UNAVAILABLE',
        message: '审计日志暂时不可用，完整激活码未显示。'
      }, { status: 503 })
    }
    
    return json({
      success: true,
      code_value: license.code_value
    })
  } catch (error) {
    return adminApiError(error, '无法获取激活码')
  }
}
