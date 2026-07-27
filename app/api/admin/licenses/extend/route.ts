import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

/**
 * 续期属于绑定关系操作，统一由 /api/admin/bindings/[id] 处理。
 */
export async function POST(request: Request) {
  try {
    await requireAdminService(request)
    return json({
      success: false,
      code: 'LEGACY_ENDPOINT_DISABLED',
      message: '请在邮箱绑定管理中延长账号有效期。'
    }, { status: 410 })
  } catch (error) {
    return adminApiError(error, '无法处理账号续期')
  }
}
