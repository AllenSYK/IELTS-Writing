import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError, json } from '@/lib/http'
import { defaultSupportFeedbackPriority, normalizeSupportFeedbackCategory } from '@/lib/support-feedback'

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

let supportClient: ReturnType<typeof createClient> | null = null

function getSupportClient() {
  if (supportClient) return supportClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase service configuration is missing.')
  }
  supportClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
  return supportClient
}

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

    const client = getSupportClient() as ReturnType<typeof createClient> & {
      from: (table: 'support_feedback') => {
        insert: (row: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{ data: unknown; error: Error | null }>
          }
        }
      }
    }
    const { data, error } = await client
      .from('support_feedback')
      .insert({
        category,
        subject: body.subject.trim(),
        message: body.message.trim(),
        contact_email: clean(body.contactEmail),
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
