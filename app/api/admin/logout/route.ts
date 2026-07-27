import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { assertTrustedAdminMutationRequest, requireWebAdmin } from '@/lib/web-license/auth'
import { extractAuditInfo, logAdminAudit } from '@/lib/admin/audit-log'

export async function POST(request: Request) {
  try {
    assertTrustedAdminMutationRequest(request)
  } catch (error) {
    return json(
      { success: false, code: 'FORBIDDEN', message: '请求来源不受信任。' },
      { status: error instanceof Response ? error.status : 403 }
    )
  }
  try {
    const { user, service } = await requireWebAdmin()
    const auditInfo = extractAuditInfo(request)
    await logAdminAudit(service, {
      adminUserId: user.id,
      action: 'admin_logout',
      resourceType: 'user',
      resourceId: user.id,
      requestId: auditInfo.requestId,
      ipHash: auditInfo.ip,
      userAgentSummary: auditInfo.userAgent
    })
  } catch {
    // 会话已经失效时仍继续清理本地 Cookie。
  }
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => null)
  return json({ success: true })
}
