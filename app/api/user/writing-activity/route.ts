import { json } from '@/lib/http'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { loadWritingActivityForUser } from '@/lib/writing-activity'

const AllowedRanges = new Set([30, 183, 365])

export async function GET(request: Request) {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json(
      { success: false, message: '请先登录' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  try {
    const requestedDays = Number(new URL(request.url).searchParams.get('days') || 365)
    const days = AllowedRanges.has(requestedDays) ? requestedDays : 365
    const activity = await loadWritingActivityForUser(user.id, new Date(), days)
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
