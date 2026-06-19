import { json } from '@/lib/http'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { loadWritingActivityForUser } from '@/lib/writing-activity'

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json(
      { success: false, message: '请先登录' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  try {
    const activity = await loadWritingActivityForUser(user.id)
    return json(
      { success: true, activity },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    console.error('[writing-activity]', error instanceof Error ? error.message : error)
    return json(
      { success: false, message: '写作活动加载失败' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }
}
