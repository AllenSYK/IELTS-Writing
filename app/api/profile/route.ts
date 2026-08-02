import { apiError } from '@/lib/http'
import { createApiObservation } from '@/lib/api-observability'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'

export async function GET(request: Request) {
  const observation = createApiObservation('/api/profile', request)
  const check = await observation.time('license', () => requireActiveWebLicense(observation))
  if (!check.ok) return observation.respond({ success: false, message: check.message }, { status: check.status })

  const profile = check.profile

  return observation.respond({
    success: true,
    profile: {
      displayName: profile.display_name ?? null,
      email: profile.email ?? check.user.email ?? null,
      manualAverageScore: profile.manual_average_score === null || profile.manual_average_score === undefined
        ? null
        : Number(profile.manual_average_score)
    }
  })
}

export async function PATCH(request: Request) {
  const observation = createApiObservation('/api/profile', request)
  const check = await observation.time('license', () => requireActiveWebLicense(observation))
  if (!check.ok) return observation.respond({ success: false, message: check.message }, { status: check.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return observation.respond({ success: false, message: '请求格式错误' }, { status: 400 })
  }

  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const hasDisplayName = Object.hasOwn(input, 'displayName')
  const hasManualAverageScore = Object.hasOwn(input, 'manualAverageScore')
  const raw = hasDisplayName ? input.displayName : undefined
  const rawManualAverage = hasManualAverageScore ? input.manualAverageScore : undefined

  if (!hasDisplayName && !hasManualAverageScore) {
    return observation.respond({ success: false, message: '没有可保存的个人资料字段' }, { status: 400 })
  }

  if (hasDisplayName && raw !== null && typeof raw !== 'string') {
    return observation.respond({ success: false, message: 'displayName 必须是字符串或 null' }, { status: 400 })
  }

  const trimmed = !hasDisplayName ? undefined : raw === null ? null : (raw as string).trim()

  if (trimmed !== undefined && trimmed !== null) {
    if (trimmed.length === 0) {
      return observation.respond({ success: false, message: '昵称不能为空' }, { status: 400 })
    }
    if (trimmed.length > 20) {
      return observation.respond({ success: false, message: '昵称不能超过 20 个字符' }, { status: 400 })
    }
    if (/\n|\r/.test(trimmed)) {
      return observation.respond({ success: false, message: '昵称不能包含换行' }, { status: 400 })
    }
    if (/<[^>]/.test(trimmed)) {
      return observation.respond({ success: false, message: '昵称不能包含 HTML' }, { status: 400 })
    }
  }

  let manualAverageScore: number | null | undefined
  if (hasManualAverageScore) {
    if (rawManualAverage === null) {
      manualAverageScore = null
    } else if (
      typeof rawManualAverage === 'number'
      && Number.isFinite(rawManualAverage)
      && rawManualAverage >= 0
      && rawManualAverage <= 9
      && Number.isInteger(rawManualAverage * 2)
    ) {
      manualAverageScore = rawManualAverage
    } else {
      return observation.respond({ success: false, message: '平均分必须是 0 到 9 之间的 0.5 分档，或恢复为自动计算' }, { status: 400 })
    }
  }

  const service = createSupabaseServiceRoleClient()

  const { data: existing, error: selectError } = await observation.time('database', () => service
      .from('profiles')
      .select('id')
      .eq('id', check.user.id)
      .maybeSingle())

  if (selectError) {
    return observation.finish(apiError(selectError, '查询用户资料失败'))
  }

  if (!existing) {
    const insertPayload: Record<string, unknown> = { id: check.user.id, email: check.user.email }
    if (trimmed !== undefined) insertPayload.display_name = trimmed
    if (manualAverageScore !== undefined) insertPayload.manual_average_score = manualAverageScore
    const { error: insertError } = await observation.time('database', () => service
        .from('profiles')
        .insert(insertPayload))

    if (insertError) {
      return observation.finish(apiError(insertError, '创建用户资料失败'))
    }
  } else {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (trimmed !== undefined) updates.display_name = trimmed
    if (manualAverageScore !== undefined) updates.manual_average_score = manualAverageScore
    const { error: updateError } = await observation.time('database', () => service
        .from('profiles')
        .update(updates)
        .eq('id', check.user.id))

    if (updateError) {
      return observation.finish(apiError(updateError, '保存个人资料失败'))
    }
  }

  const { data: savedProfile, error: savedProfileError } = await observation.time('database', () => service
      .from('profiles')
      .select('display_name, email, manual_average_score')
      .eq('id', check.user.id)
      .maybeSingle())

  if (savedProfileError) {
    return observation.finish(apiError(savedProfileError, '读取已保存的个人资料失败'))
  }

  return observation.respond({
    success: true,
    profile: {
      displayName: savedProfile?.display_name ?? null,
      email: savedProfile?.email ?? check.user.email ?? null,
      manualAverageScore: savedProfile?.manual_average_score === null || savedProfile?.manual_average_score === undefined
        ? null
        : Number(savedProfile.manual_average_score)
    }
  })
}
