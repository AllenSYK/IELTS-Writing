import type { SupabaseClient } from '@supabase/supabase-js'

export const TermsAgreementVersion = '2026-06'
export const PrivacyAgreementVersion = '2026-08'

export const CurrentAgreementVersions = {
  terms: TermsAgreementVersion,
  privacy: PrivacyAgreementVersion
} as const

export async function recordUserAgreements(
  service: SupabaseClient,
  userId: string,
  source: 'register' | 'login'
) {
  const acceptedAt = new Date().toISOString()
  const { error } = await service
    .from('user_agreements')
    .upsert(
      [
        {
          user_id: userId,
          agreement_type: 'terms',
          agreement_version: TermsAgreementVersion,
          accepted_at: acceptedAt,
          source
        },
        {
          user_id: userId,
          agreement_type: 'privacy',
          agreement_version: PrivacyAgreementVersion,
          accepted_at: acceptedAt,
          source
        }
      ],
      { onConflict: 'user_id,agreement_type,agreement_version' }
    )

  if (error) throw error
}
