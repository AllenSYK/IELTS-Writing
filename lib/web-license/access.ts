import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiObservation } from '@/lib/api-observability'
import { billingScope, hasPaidSubscriptionAccess, hasTrialSubscriptionAccess } from '@/lib/billing/config'

export type WebProfile = {
  id: string
  email: string | null
  phone: string | null
  role: string
  license_status: string
  license_expires_at: string | null
  display_name: string | null
  manual_average_score: number | null
}

export type WebLicenseActivation = {
  source?: 'license' | 'stripe' | 'stripe_payment' | 'stripe_trial'
  id: string
  license_id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  last_used_at: string | null
}

export type WebLicenseCode = {
  id: string
  plan: string
  status: string
  expires_at: string | null
}

export type WebLicenseAccessSnapshot = {
  profile: WebProfile | null
  activation: WebLicenseActivation | null
  license: WebLicenseCode | null
}

type AccessRpcRow = {
  profile_id: string | null
  profile_email: string | null
  profile_phone: string | null
  profile_role: string | null
  profile_license_status: string | null
  profile_license_expires_at: string | null
  profile_display_name: string | null
  profile_manual_average_score: number | null
  activation_id: string | null
  activation_license_id: string | null
  activation_email: string | null
  activation_activated_at: string | null
  activation_expires_at: string | null
  activation_status: string | null
  activation_last_used_at: string | null
  license_id: string | null
  license_plan: string | null
  license_status: string | null
  license_expires_at: string | null
}

function isMissingAccessRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === 'PGRST202'
    || error.code === '42883'
    || /get_web_license_access_state.*does not exist|schema cache/i.test(error.message || '')
}

let accessRpcMissingUntil = 0

function snapshotFromRpc(row: AccessRpcRow | null, userId: string): WebLicenseAccessSnapshot {
  const profile = row?.profile_id ? {
    id: row.profile_id,
    email: row.profile_email,
    phone: row.profile_phone,
    role: row.profile_role || 'user',
    license_status: row.profile_license_status || 'inactive',
    license_expires_at: row.profile_license_expires_at,
    display_name: row.profile_display_name,
    manual_average_score: row.profile_manual_average_score === null
      ? null
      : Number(row.profile_manual_average_score)
  } satisfies WebProfile : null

  const activation = row?.activation_id && row.activation_license_id && row.activation_email
    && row.activation_activated_at && row.activation_expires_at && row.activation_status
    ? {
        id: row.activation_id,
        license_id: row.activation_license_id,
        user_id: userId,
        email: row.activation_email,
        activated_at: row.activation_activated_at,
        expires_at: row.activation_expires_at,
        status: row.activation_status,
        last_used_at: row.activation_last_used_at
      } satisfies WebLicenseActivation
    : null

  const license = row?.license_id && row.license_plan && row.license_status
    ? {
        id: row.license_id,
        plan: row.license_plan,
        status: row.license_status,
        expires_at: row.license_expires_at
      } satisfies WebLicenseCode
    : null

  return { profile, activation, license }
}

function snapshotFromQueries(
  profile: WebProfile | null,
  activation: (WebLicenseActivation & { license_codes?: WebLicenseCode | WebLicenseCode[] | null }) | null
): WebLicenseAccessSnapshot {
  const joinedLicense = Array.isArray(activation?.license_codes)
    ? activation.license_codes[0] ?? null
    : activation?.license_codes ?? null
  if (!activation) return { profile, activation: null, license: null }
  const cleanActivation: WebLicenseActivation = {
    id: activation.id,
    license_id: activation.license_id,
    user_id: activation.user_id,
    email: activation.email,
    activated_at: activation.activated_at,
    expires_at: activation.expires_at,
    status: activation.status,
    last_used_at: activation.last_used_at
  }
  return { profile, activation: cleanActivation, license: joinedLicense }
}

export async function loadWebLicenseAccessSnapshot(
  service: SupabaseClient,
  userId: string,
  observation?: ApiObservation,
  options: { tryRpc?: boolean } = {}
): Promise<WebLicenseAccessSnapshot> {
  const snapshot = await loadManualLicenseAccessSnapshot(service, userId, observation, options)
  const scope = billingScope()
  if (!scope || isActiveWebLicenseSnapshot(snapshot) || !snapshot.profile
    || snapshot.profile.role === 'admin' || snapshot.profile.license_status === 'suspended') return snapshot
  const { data, error } = await service.from('stripe_billing_subscriptions')
    .select('stripe_subscription_id, status, paid_through, risk_hold, created_at, last_used_at, trial_offer, trial_start, trial_end')
    .eq('user_id', userId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
    .in('status', ['active', 'past_due', 'trialing']).eq('risk_hold', false)
    .or(`paid_through.gt.${new Date().toISOString()},trial_end.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false }).limit(10)
  if (error) throw error
  const subscription = data?.find((row) => hasPaidSubscriptionAccess(row))
    || data?.find((row) => hasTrialSubscriptionAccess(row))
  if (!subscription) {
    const { data: payment, error: paymentError } = await service.from('stripe_billing_payments')
      .select('checkout_session_id, paid_at, expires_at, last_used_at')
      .eq('user_id', userId).eq('stripe_account_id', scope.account).eq('livemode', scope.livemode)
      .eq('risk_hold', false).gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false }).limit(1).maybeSingle()
    if (paymentError) throw paymentError
    if (!payment) return snapshot
    const id = payment.checkout_session_id as string
    return {
      profile: { ...snapshot.profile, license_status: 'active', license_expires_at: payment.expires_at },
      activation: {
        source: 'stripe_payment', id, license_id: id, user_id: userId,
        email: snapshot.profile.email || snapshot.profile.phone || userId,
        activated_at: payment.paid_at, expires_at: payment.expires_at, status: 'active', last_used_at: payment.last_used_at
      },
      license: { id, plan: 'standard', status: 'active', expires_at: payment.expires_at }
    }
  }
  const trial = hasTrialSubscriptionAccess(subscription)
  const expiresAt = trial ? subscription.trial_end : subscription.paid_through
  const id = subscription.stripe_subscription_id as string
  return {
    profile: { ...snapshot.profile, license_status: 'active', license_expires_at: expiresAt },
    activation: {
      source: trial ? 'stripe_trial' : 'stripe', id, license_id: id, user_id: userId,
      email: snapshot.profile.email || snapshot.profile.phone || userId,
      activated_at: trial ? subscription.trial_start : subscription.created_at, expires_at: expiresAt, status: 'active', last_used_at: subscription.last_used_at
    },
    license: { id, plan: 'standard', status: 'active', expires_at: expiresAt }
  }
}

async function loadManualLicenseAccessSnapshot(
  service: SupabaseClient,
  userId: string,
  observation?: ApiObservation,
  options: { tryRpc?: boolean } = {}
): Promise<WebLicenseAccessSnapshot> {
  if (options.tryRpc !== false && Date.now() >= accessRpcMissingUntil) {
    const rpcStartedAt = performance.now()
    const rpcResult = await service
      .rpc('get_web_license_access_state', { p_user_id: userId })
      .maybeSingle()
    const rpcDuration = performance.now() - rpcStartedAt

    if (!rpcResult.error) {
      accessRpcMissingUntil = 0
      observation?.record('database', rpcDuration)
      observation?.record('profile', 0)
      observation?.record('activation', 0)
      return snapshotFromRpc(rpcResult.data as AccessRpcRow | null, userId)
    }
    if (!isMissingAccessRpc(rpcResult.error)) throw rpcResult.error
    accessRpcMissingUntil = Date.now() + 60_000
    observation?.record('database', rpcDuration)
  }

  const nowIso = new Date().toISOString()
  const measured = async <T>(name: 'profile' | 'activation', query: PromiseLike<T>) => {
    const startedAt = performance.now()
    try {
      return await query
    } finally {
      const durationMs = performance.now() - startedAt
      observation?.record(name, durationMs)
      observation?.record('database', durationMs)
    }
  }
  const [profileResult, activationResult] = await Promise.all([
    measured('profile', service
      .from('profiles')
      .select('id, email, phone, role, license_status, license_expires_at, display_name, manual_average_score')
      .eq('id', userId)
      .maybeSingle()),
    measured('activation', service
      .from('license_activations')
      .select('id, license_id, user_id, email, activated_at, expires_at, status, last_used_at, license_codes(id, plan, status, expires_at)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle())
  ])

  if (profileResult.error) throw profileResult.error
  if (activationResult.error) throw activationResult.error
  return snapshotFromQueries(
    profileResult.data as WebProfile | null,
    activationResult.data as (WebLicenseActivation & { license_codes?: WebLicenseCode | WebLicenseCode[] | null }) | null
  )
}

export function isActiveWebLicenseSnapshot(snapshot: WebLicenseAccessSnapshot, now = Date.now()) {
  const profileExpiresAt = snapshot.profile?.license_expires_at
    ? new Date(snapshot.profile.license_expires_at).getTime()
    : Number.NaN
  const activationExpiresAt = snapshot.activation?.expires_at
    ? new Date(snapshot.activation.expires_at).getTime()
    : Number.NaN
  const codeExpiresAt = snapshot.license?.expires_at
    ? new Date(snapshot.license.expires_at).getTime()
    : Number.POSITIVE_INFINITY

  return snapshot.profile?.license_status === 'active'
    && Number.isFinite(profileExpiresAt)
    && profileExpiresAt > now
    && snapshot.activation?.status === 'active'
    && Number.isFinite(activationExpiresAt)
    && activationExpiresAt > now
    && snapshot.license !== null
    && snapshot.license.status !== 'disabled'
    && snapshot.license.status !== 'expired'
    && snapshot.license.status !== 'revoked'
    && codeExpiresAt > now
}
