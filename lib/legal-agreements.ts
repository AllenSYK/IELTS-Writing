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

const AgreementConsentStorageKey = 'ielts-writing-agreement-consent-v1'

/**
 * 记录本浏览器已同意的协议版本（登录成功后调用）。
 * 仅用于减少重复勾选，不替代服务端的同意记录。
 */
export function rememberAgreementConsent() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AgreementConsentStorageKey, JSON.stringify(CurrentAgreementVersions))
  } catch {
    // 存储不可用时忽略
  }
}

/**
 * 若本浏览器已同意的协议版本与当前版本一致，则登录页无需再次勾选；
 * 协议版本更新后会自动要求重新确认。
 */
export function hasRememberedAgreementConsent(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(AgreementConsentStorageKey)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<typeof CurrentAgreementVersions>
    return parsed?.terms === CurrentAgreementVersions.terms
      && parsed?.privacy === CurrentAgreementVersions.privacy
  } catch {
    return false
  }
}
