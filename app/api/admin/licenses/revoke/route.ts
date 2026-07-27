import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

/**
 * 撤销与解绑统一由绑定资源接口处理，禁止旧入口硬删除绑定记录。
 */
export async function POST(request: Request) {
  try {
    await requireAdminService(request)
    return json({
      success: false,
      code: 'LEGACY_ENDPOINT_DISABLED',
      message: '请在邮箱绑定管理中撤销或解绑。'
    }, { status: 410 })
  } catch (error) {
    return adminApiError(error, '无法处理绑定撤销')
  }
}
