import { z } from 'zod'
import { AiConfigurationError, AiProviderError, evaluateEssayWithAi } from '@/lib/ai'
import { apiError, json } from '@/lib/http'

const EvaluateSchema = z.object({
  essay: z.string().min(50).max(12000),
  taskType: z.enum(['task1', 'task2']).default('task2'),
  prompt: z.string().max(4000).optional(),
  questionType: z.string().max(80).optional(),
  phase: z.enum(['quick', 'detailed', 'full']).default('full')
})

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return json({ error: 'license_required' }, { status: 401 })
    }

    const body = EvaluateSchema.parse(await request.json())
    const deviceId = request.headers.get('x-device-id') || ''

    // 合并验证：直接调用 edge function 验证，跳过本地验证
    const validation = await validateLicenseWithEdge(token, deviceId)
    if (!validation.ok) {
      return json({ error: validation.error || 'license_not_allowed' }, { status: 403 })
    }

    const evaluation = await evaluateEssayWithAi(body)

    return json({
      ...evaluation,
      protected: true
    })
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return json(
        {
          error: 'ai_not_configured',
          missing: error.missing
        },
        { status: 503 }
      )
    }
    if (error instanceof AiProviderError) {
      const statusCode = error.status || (error.code === 'ai_request_timeout' ? 504 : 502)
      return json(
        {
          error: error.code,
          message: error.message,
          providerStatus: error.status
        },
        { status: statusCode }
      )
    }
    return apiError(error, 'AI evaluation failed.')
  }
}

async function validateLicenseWithEdge(licenseToken: string, deviceId: string) {
  if (!deviceId) {
    return { ok: false, error: 'device_required' }
  }
  const endpoint = getLicenseServerUrl()

  const LICENSE_VALIDATION_TIMEOUT_MS = 10_000
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    LICENSE_VALIDATION_TIMEOUT_MS
  )
  try {
    const response = await fetch(`${endpoint}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseToken,
        deviceId,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
      }),
      signal: controller.signal,
      cache: 'no-store'
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, error: data.error }
  } finally {
    clearTimeout(timeout)
  }
}

function getLicenseServerUrl() {
  const explicit = process.env.LICENSE_SERVER_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('LICENSE_SERVER_URL must be configured.')
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/license`
}
