import { z } from 'zod'
import { apiError, json } from '@/lib/http'
import { defaultSupportFeedbackPriority, normalizeSupportFeedbackCategory } from '@/lib/support-feedback'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

const FeedbackSchema = z.object({
  category: z.string().min(1).max(60),
  subject: z.string().min(2).max(120),
  message: z.string().min(10).max(5000),
  contactEmail: z.string().trim().email().or(z.literal('')).optional().default(''),
  includeDiagnostics: z.boolean().default(true),
  diagnostics: z.object({
    appVersion: z.string().max(80).optional().default('未提供'),
    platform: z.string().max(120).optional().default('未提供'),
    osVersion: z.string().max(500).optional().default('未提供'),
    recentErrorCode: z.string().max(160).optional().default('无')
  }).optional().default({})
})

function clean(value: string | undefined | null) {
  const trimmed = (value || '').trim()
  return trimmed || null
}

export async function POST(request: Request) {
  try {
    const body = FeedbackSchema.parse(await request.json())
    const category = normalizeSupportFeedbackCategory(body.category)
    const diagnostics = {
      appVersion: body.diagnostics.appVersion || '未提供',
      platform: body.diagnostics.platform || '未提供',
      osVersion: body.diagnostics.osVersion || '未提供',
      recentErrorCode: body.diagnostics.recentErrorCode || '无'
    }

    // 关联当前登录用户，便于后台处理与用户查询进度（未登录时允许匿名提交）。
    const currentUser = await getCurrentSupabaseUser().catch(() => null)

    const client = createSupabaseServiceRoleClient()
    const { data, error } = await client
      .from('support_feedback')
      .insert({
        category,
        subject: body.subject.trim(),
        message: body.message.trim(),
        contact_email: clean(body.contactEmail),
        user_id: currentUser?.id ?? null,
        app_version: body.includeDiagnostics ? diagnostics.appVersion : null,
        platform: body.includeDiagnostics ? diagnostics.platform : null,
        os_version: body.includeDiagnostics ? diagnostics.osVersion : null,
        diagnostics: body.includeDiagnostics ? diagnostics : {},
        status: 'pending',
        priority: defaultSupportFeedbackPriority(category)
      })
      .select('id, status, created_at')
      .single()

    if (error) throw error

    const feedback = data as { id: string; status: string; created_at: string }

    return json({
      ok: true,
      feedbackId: feedback.id,
      displayId: `FB-${String(feedback.id).slice(0, 8).toUpperCase()}`,
      status: feedback.status,
      createdAt: feedback.created_at
    })
  } catch (error) {
    return apiError(error, '反馈提交失败，请稍后重试。')
  }
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20)
})

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentSupabaseUser()
    if (!currentUser) {
      return json({ ok: false, code: 'unauthorized', message: '请先登录后查看反馈进度。' }, { status: 401 })
    }

    const url = new URL(request.url)
    const query = ListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()))

    const client = createSupabaseServiceRoleClient()
    const { data, error } = await client
      .from('support_feedback')
      .select('id, category, subject, status, priority, admin_note, resolution_note, created_at, updated_at, handled_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(query.limit)

    if (error) throw error

    const items = (data ?? []).map((row) => ({
      id: row.id as string,
      displayId: `FB-${String(row.id).slice(0, 8).toUpperCase()}`,
      category: row.category as string,
      subject: row.subject as string,
      status: row.status as string,
      priority: row.priority as string,
      adminNote: (row.admin_note as string | null) ?? null,
      resolutionNote: (row.resolution_note as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      handledAt: (row.handled_at as string | null) ?? null
    }))

    return json({ ok: true, items })
  } catch (error) {
    return apiError(error, '反馈进度读取失败，请稍后重试。')
  }
}
