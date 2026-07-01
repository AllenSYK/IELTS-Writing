import { json, apiError } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const { data: profile, error } = await service
    .from('profiles')
    .select('display_name, email')
    .eq('id', check.user.id)
    .maybeSingle()

  if (error) {
    return apiError(error, '读取个人资料失败')
  }

  return json({
    success: true,
    profile: {
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? check.user.email ?? null
    }
  })
}

export async function PATCH(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ success: false, message: '请求格式错误' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' && 'displayName' in body
    ? (body as Record<string, unknown>).displayName
    : undefined

  if (raw === undefined) {
    return json({ success: false, message: '缺少 displayName 字段' }, { status: 400 })
  }

  if (raw !== null && typeof raw !== 'string') {
    return json({ success: false, message: 'displayName 必须是字符串或 null' }, { status: 400 })
  }

  const trimmed = raw === null ? null : raw.trim()

  if (trimmed !== null) {
    if (trimmed.length === 0) {
      return json({ success: false, message: '昵称不能为空' }, { status: 400 })
    }
    if (trimmed.length > 20) {
      return json({ success: false, message: '昵称不能超过 20 个字符' }, { status: 400 })
    }
    if (/\n|\r/.test(trimmed)) {
      return json({ success: false, message: '昵称不能包含换行' }, { status: 400 })
    }
    if (/<[^>]/.test(trimmed)) {
      return json({ success: false, message: '昵称不能包含 HTML' }, { status: 400 })
    }
  }

  const service = createSupabaseServiceRoleClient()

  const { data: existing, error: selectError } = await service
    .from('profiles')
    .select('id')
    .eq('id', check.user.id)
    .maybeSingle()

  if (selectError) {
    return apiError(selectError, '查询用户资料失败')
  }

  if (!existing) {
    const { error: insertError } = await service
      .from('profiles')
      .insert({ id: check.user.id, email: check.user.email, display_name: trimmed })

    if (insertError) {
      return apiError(insertError, '创建用户资料失败')
    }
  } else {
    const { error: updateError } = await service
      .from('profiles')
      .update({ display_name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', check.user.id)

    if (updateError) {
      return apiError(updateError, '保存昵称失败')
    }
  }

  return json({
    success: true,
    profile: {
      displayName: trimmed,
      email: check.user.email ?? null
    }
  })
}
