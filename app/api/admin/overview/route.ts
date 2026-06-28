import { json } from '@/lib/http'
import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'

export async function GET(request: Request) {
  const requestId = request.headers.get('X-Request-Id') || undefined
  
  try {
    const { service } = await requireAdminService()
    
    // 使用数据库 RPC 进行精确统计，而不是读取大量记录后在内存中统计
    const [statsResult, recentResult] = await Promise.all([
      service.rpc('get_admin_overview_stats'),
      service.rpc('get_admin_recent_records')
    ])

    if (statsResult.error) throw statsResult.error
    if (recentResult.error) throw recentResult.error

    const stats = statsResult.data || {}
    const recent = recentResult.data || {}

    return json({
      success: true,
      stats: {
        totalLicenses: stats.totalLicenses || 0,
        availableLicenses: stats.availableLicenses || 0,
        exhaustedLicenses: stats.exhaustedLicenses || 0,
        totalBindings: stats.totalBindings || 0,
        activeBindings: stats.activeBindings || 0,
        unboundUsers: stats.unboundUsers || 0
      },
      recentLicenses: recent.recentLicenses || [],
      recentBindings: recent.recentBindings || [],
      recentUsers: recent.recentUsers || [],
      requestId
    })
  } catch (error) {
    return adminApiError(error, '无法加载管理总览')
  }
}
