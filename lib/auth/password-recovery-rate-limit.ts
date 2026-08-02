import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'

export type PasswordRecoveryRequestStatus = 'accepted' | 'completed' | 'failed'

export type PasswordRecoveryRateLimitResult = {
  allowed: boolean
  retryAfter: number
  reason: string
}

export class PasswordRecoveryRateLimitError extends Error {
  constructor() {
    super('Password recovery rate limit is unavailable.')
    this.name = 'PasswordRecoveryRateLimitError'
  }
}

export async function checkPasswordRecoveryRateLimit(input: {
  emailHash: string
  ipHash: string | null
  requestId: string
}): Promise<PasswordRecoveryRateLimitResult> {
  const service = createSupabaseServiceRoleClient()
  const { data, error } = await service.rpc('check_password_recovery_rate_limit', {
    p_email_hash: input.emailHash,
    p_ip_hash: input.ipHash,
    p_request_id: input.requestId
  })

  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PasswordRecoveryRateLimitError()
  }

  const result = data as Record<string, unknown>
  if (typeof result.allowed !== 'boolean') {
    throw new PasswordRecoveryRateLimitError()
  }

  return {
    allowed: result.allowed,
    retryAfter: typeof result.retry_after === 'number' ? Math.max(1, Math.ceil(result.retry_after)) : 60,
    reason: typeof result.reason === 'string' ? result.reason : 'unknown'
  }
}

export async function updatePasswordRecoveryRequestStatus(
  requestId: string,
  status: PasswordRecoveryRequestStatus
) {
  const service = createSupabaseServiceRoleClient()
  const { error } = await service
    .from('password_recovery_requests')
    .update({ status })
    .eq('request_id', requestId)

  return !error
}
