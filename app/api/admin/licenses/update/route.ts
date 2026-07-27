import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

/**
 * 旧版更新入口已停用。所有激活码变更统一走资源 PATCH，
 * 避免两套实现产生不同的状态和审计结果。
 */
export async function POST(request: Request) {
  try {
    await requireAdminService(request)
    return json({
      success: false,
      code: 'LEGACY_ENDPOINT_DISABLED',
      message: '该管理接口已升级，请刷新管理员页面后重试。'
    }, { status: 410 })
  } catch (error) {
    return adminApiError(error, '无法处理激活码更新')
  }
}
