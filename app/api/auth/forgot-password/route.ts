import { randomUUID } from 'crypto'
import { createForgotPasswordPost } from '@/lib/auth/password-recovery-handler'
import {
  checkPasswordRecoveryRateLimit,
  updatePasswordRecoveryRequestStatus
} from '@/lib/auth/password-recovery-rate-limit'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'

export const POST = createForgotPasswordPost({
  createRequestId: randomUUID,
  checkRateLimit: checkPasswordRecoveryRateLimit,
  updateRequestStatus: updatePasswordRecoveryRequestStatus,
  async sendRecoveryOtp(email) {
    const supabase = createSupabasePublicServerClient()
    return supabase.auth.resetPasswordForEmail(email)
  }
})
