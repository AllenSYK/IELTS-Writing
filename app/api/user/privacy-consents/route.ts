import { z } from 'zod'
import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { requireActiveWebLicense } from '@/lib/web-license/auth'
import { PrivacyPolicyVersion } from '@/lib/legal-content'

const GrantSchema = z.object({
  consentType: z.enum(['cross_border_transfer', 'privacy_policy', 'terms', 'minor_guardian']),
  policyVersion: z.string().optional()
})

export async function GET() {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data, error } = await service
    .from('privacy_consents')
    .select('id, consent_type, policy_version, consent_status, consented_at, withdrawn_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return json({ success: false, message: error.message }, { status: 500 })

  const consents = (data ?? []).map((row) => ({
    id: row.id,
    consentType: row.consent_type,
    policyVersion: row.policy_version,
    consentStatus: row.consent_status,
    consentedAt: row.consented_at,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at
  }))

  return json({ success: true, consents, currentPolicyVersion: PrivacyPolicyVersion })
}

export async function POST(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = GrantSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id
  const policyVersion = body.policyVersion ?? PrivacyPolicyVersion

  const { data: existing } = await service
    .from('privacy_consents')
    .select('id, consent_status')
    .eq('user_id', userId)
    .eq('consent_type', body.consentType)
    .eq('consent_status', 'granted')
    .maybeSingle()

  if (existing) {
    return json({ success: true, consentId: existing.id, status: 'already_granted' })
  }

  const { data: withdrawn } = await service
    .from('privacy_consents')
    .update({ consent_status: 'withdrawn', withdrawn_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('consent_type', body.consentType)
    .eq('consent_status', 'granted')
    .select('id')

  const { data: newConsent, error: insertError } = await service
    .from('privacy_consents')
    .insert({
      user_id: userId,
      consent_type: body.consentType,
      policy_version: policyVersion,
      consent_status: 'granted',
      consented_at: new Date().toISOString(),
      source: 'web'
    })
    .select('id, consent_type, policy_version, consent_status, consented_at')
    .single()

  if (insertError) return json({ success: false, message: insertError.message }, { status: 500 })

  return json({ success: true, consent: newConsent, status: 'granted' })
}

export async function PATCH(request: Request) {
  const check = await requireActiveWebLicense()
  if (!check.ok) return json({ success: false, message: check.message }, { status: check.status })

  let body
  try {
    body = GrantSchema.parse(await request.json())
  } catch {
    return json({ success: false, message: 'Invalid input' }, { status: 400 })
  }

  const service = createSupabaseServiceRoleClient()
  const userId = check.user.id

  const { data: active } = await service
    .from('privacy_consents')
    .select('id')
    .eq('user_id', userId)
    .eq('consent_type', body.consentType)
    .eq('consent_status', 'granted')
    .maybeSingle()

  if (!active) {
    return json({ success: false, message: 'No active consent to withdraw' }, { status: 404 })
  }

  const { error } = await service
    .from('privacy_consents')
    .update({
      consent_status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', active.id)

  if (error) return json({ success: false, message: error.message }, { status: 500 })

  return json({ success: true, status: 'withdrawn' })
}
