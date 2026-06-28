import { json } from '@/lib/http'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import type { DraftDeleteQuota } from '@/lib/writing-drafts'

function normalizeQuota(value: unknown): DraftDeleteQuota {
  const input = value && typeof value === 'object' ? value as Partial<DraftDeleteQuota> : {}
  return {
    timezone: 'Asia/Shanghai',
    dailyLimit: 8,
    used: Math.max(0, Number(input.used) || 0),
    remaining: Math.max(0, Math.min(8, Number(input.remaining) || 0)),
    date: typeof input.date === 'string' ? input.date : ''
  }
}

export async function GET() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    return json({ success: false, message: '请先登录' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_writing_draft_delete_quota')

  if (error) {
    return json({ success: false, message: '删除额度读取失败' }, { status: 500 })
  }

  return json({ success: true, quota: normalizeQuota(data) })
}
