import { z } from 'npm:zod@3.25.76'
import semver from 'npm:semver@7.7.2'
import { corsHeaders, withCors } from '../_shared/cors.ts'
import { clientIp, getServiceClient } from '../_shared/supabase.ts'
import { hashLicenseKey, sha256Hex, signLicenseToken, verifyLicenseToken } from '../_shared/crypto.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

const ActivateSchema = z.object({
  licenseKey: z.string().min(10).max(64),
  deviceId: z.string().min(16).max(128),
  deviceName: z.string().max(120).optional(),
  platform: z.string().max(40),
  appVersion: z.string().max(32)
})

const ValidateSchema = z.object({
  licenseToken: z.string().min(40),
  deviceId: z.string().min(16).max(128),
  appVersion: z.string().max(32)
})

const DeactivateSchema = z.object({
  licenseToken: z.string().min(40),
  deviceId: z.string().min(16).max(128)
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const path = new URL(request.url).pathname
    if (request.method === 'POST' && path.endsWith('/activate')) {
      return await activate(request)
    }
    if (request.method === 'POST' && path.endsWith('/validate')) {
      return await validate(request)
    }
    if (request.method === 'POST' && path.endsWith('/deactivate')) {
      return await deactivate(request)
    }
    return withCors({ error: 'not_found' }, { status: 404 })
  } catch (error) {
    console.error('license_function_error', error instanceof Error ? error.message : error)
    return withCors({ error: 'server_error' }, { status: 500 })
  }
})

async function activate(request: Request) {
  const body = ActivateSchema.parse(await request.json())
  const supabase = getServiceClient()
  const keyHash = await hashLicenseKey(body.licenseKey)
  const ip = clientIp(request)
  const ipHash = await sha256Hex(ip)
  const rate = await checkRateLimit('license_activate', `${ip}:${body.licenseKey.slice(0, 9)}`, 12, 15 * 60)
  if (!rate.allowed) {
    return withCors({ error: 'rate_limited' }, { status: 429 })
  }

  const { data: license, error } = await supabase.from('license_keys').select('*').eq('key_hash', keyHash).single()
  if (error || !license) {
    await logEvent(null, null, 'activate', false, 'invalid_key', body.appVersion, { keyPrefix: body.licenseKey.slice(0, 4) })
    return withCors({ error: 'invalid_license', message: 'Activation code is invalid.' }, { status: 403 })
  }

  const now = new Date()
  const blockedStatuses = ['suspended', 'revoked', 'disabled', 'expired']
  if (blockedStatuses.includes(license.status)) {
    await logEvent(license.id, null, 'activate', false, `status_${license.status}`, body.appVersion)
    return withCors({ error: 'license_not_allowed', status: license.status }, { status: 403 })
  }

  if (!isVersionAllowed(body.appVersion, license.minimum_app_version, license.maximum_app_version)) {
    await logEvent(license.id, null, 'activate', false, 'version_not_allowed', body.appVersion, {
      minimum: license.minimum_app_version,
      maximum: license.maximum_app_version
    })
    return withCors({ error: 'license_not_allowed', reason: 'version_not_allowed' }, { status: 403 })
  }

  let expiresAt = license.expires_at
  const activatedAt = license.activated_at || now.toISOString()
  if (!expiresAt && license.duration_days) {
    const base = license.starts_on_first_activation ? now : new Date(license.created_at)
    expiresAt = new Date(base.getTime() + license.duration_days * 86400000).toISOString()
  }

  if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
    await supabase.from('license_keys').update({ status: 'expired', expires_at: expiresAt }).eq('id', license.id)
    await logEvent(license.id, null, 'activate', false, 'expired', body.appVersion)
    return withCors({ error: 'license_expired' }, { status: 403 })
  }

  const { data: activeDevices, error: deviceError } = await supabase
    .from('license_devices')
    .select('*')
    .eq('license_id', license.id)
    .eq('status', 'active')
  if (deviceError) {
    throw deviceError
  }

  const existing = activeDevices?.find((device) => device.device_hash === body.deviceId)
  if (!existing && license.max_devices && (activeDevices?.length || 0) >= license.max_devices) {
    await logEvent(license.id, null, 'activate', false, 'device_limit', body.appVersion, { maxDevices: license.max_devices })
    return withCors({ error: 'device_limit_reached' }, { status: 403 })
  }

  if (!existing && license.max_activations && license.activation_count >= license.max_activations) {
    await logEvent(license.id, null, 'activate', false, 'activation_limit', body.appVersion)
    return withCors({ error: 'activation_limit_reached' }, { status: 403 })
  }

  const devicePayload = {
    license_id: license.id,
    device_hash: body.deviceId,
    device_name: body.deviceName || null,
    operating_system: body.platform,
    app_version: body.appVersion,
    last_seen_at: now.toISOString(),
    last_ip_hash: ipHash,
    status: 'active'
  }

  const { data: device, error: upsertError } = await supabase
    .from('license_devices')
    .upsert(devicePayload, { onConflict: 'license_id,device_hash' })
    .select()
    .single()
  if (upsertError) {
    throw upsertError
  }

  const { error: updateError } = await supabase
    .from('license_keys')
    .update({
      status: 'active',
      activated_at: activatedAt,
      expires_at: expiresAt,
      activation_count: existing ? license.activation_count : license.activation_count + 1
    })
    .eq('id', license.id)
  if (updateError) {
    throw updateError
  }

  const token = await signLicenseToken({
    licenseId: license.id,
    deviceId: body.deviceId,
    plan: license.plan,
    status: 'active',
    expiresAt,
    autoUpdateEnabled: license.auto_update_enabled
  })

  await logEvent(license.id, device.id, existing ? 'validate_success' : 'activate', true, existing ? 'existing_device' : 'new_device', body.appVersion)

  return withCors({
    licenseToken: token,
    expiresAt,
    plan: license.plan,
    serverTime: now.toISOString(),
    autoUpdateEnabled: license.auto_update_enabled
  })
}

async function validate(request: Request) {
  const body = ValidateSchema.parse(await request.json())
  const supabase = getServiceClient()
  const rate = await checkRateLimit('license_validate', `${clientIp(request)}:${body.deviceId}`, 120, 15 * 60)
  if (!rate.allowed) {
    return withCors({ error: 'rate_limited' }, { status: 429 })
  }
  const payload = await verifyLicenseToken(body.licenseToken)
  if (payload.deviceId !== body.deviceId) {
    return withCors({ error: 'device_mismatch' }, { status: 403 })
  }

  const { data: license, error } = await supabase.from('license_keys').select('*').eq('id', payload.licenseId).single()
  if (error || !license) {
    return withCors({ error: 'license_not_found' }, { status: 403 })
  }

  const now = new Date()
  const expired = license.expires_at ? new Date(license.expires_at).getTime() <= now.getTime() : false
  if (expired || license.status !== 'active') {
    await logEvent(license.id, null, 'validate_failure', false, expired ? 'expired' : `status_${license.status}`, body.appVersion)
    if (expired && license.status !== 'expired') {
      await supabase.from('license_keys').update({ status: 'expired' }).eq('id', license.id)
    }
    return withCors({ error: expired ? 'license_expired' : 'license_not_allowed', status: expired ? 'expired' : license.status }, { status: 403 })
  }

  if (!isVersionAllowed(body.appVersion, license.minimum_app_version, license.maximum_app_version)) {
    await logEvent(license.id, null, 'validate_failure', false, 'version_not_allowed', body.appVersion)
    return withCors({ error: 'license_not_allowed', reason: 'version_not_allowed' }, { status: 403 })
  }

  const { data: device, error: deviceError } = await supabase
    .from('license_devices')
    .select('*')
    .eq('license_id', license.id)
    .eq('device_hash', body.deviceId)
    .single()
  if (deviceError || !device || device.status !== 'active') {
    await logEvent(license.id, null, 'validate_failure', false, 'device_not_active', body.appVersion)
    return withCors({ error: 'device_not_allowed' }, { status: 403 })
  }

  await supabase
    .from('license_devices')
    .update({ last_seen_at: now.toISOString(), app_version: body.appVersion, last_ip_hash: await sha256Hex(clientIp(request)) })
    .eq('id', device.id)

  const token = await signLicenseToken({
    licenseId: license.id,
    deviceId: body.deviceId,
    plan: license.plan,
    status: 'active',
    expiresAt: license.expires_at,
    autoUpdateEnabled: license.auto_update_enabled
  })
  await logEvent(license.id, device.id, 'validate_success', true, 'ok', body.appVersion)

  return withCors({
    licenseToken: token,
    status: 'active',
    plan: license.plan,
    expiresAt: license.expires_at,
    serverTime: now.toISOString(),
    autoUpdateEnabled: license.auto_update_enabled
  })
}

function isVersionAllowed(appVersion: string, minimum?: string | null, maximum?: string | null) {
  if (!semver.valid(appVersion)) {
    return true
  }
  if (minimum && semver.valid(minimum) && semver.lt(appVersion, minimum)) {
    return false
  }
  if (maximum && semver.valid(maximum) && semver.gt(appVersion, maximum)) {
    return false
  }
  return true
}

async function deactivate(request: Request) {
  const body = DeactivateSchema.parse(await request.json())
  const payload = await verifyLicenseToken(body.licenseToken)
  if (payload.deviceId !== body.deviceId) {
    return withCors({ error: 'device_mismatch' }, { status: 403 })
  }

  const supabase = getServiceClient()
  const { data: license, error } = await supabase
    .from('license_keys')
    .select('id, status, admin_note, allow_device_deactivation')
    .eq('id', payload.licenseId)
    .single()
  if (error || !license) {
    return withCors({ error: 'license_not_found' }, { status: 403 })
  }

  const allowDeactivate = license.allow_device_deactivation !== false && !String(license.admin_note || '').includes('disable-self-deactivate')
  if (!allowDeactivate) {
    await logEvent(license.id, null, 'deactivate', false, 'not_allowed', '')
    return withCors({ error: 'deactivate_not_allowed' }, { status: 403 })
  }

  const { data: device } = await supabase
    .from('license_devices')
    .update({ status: 'deactivated', deactivated_at: new Date().toISOString() })
    .eq('license_id', license.id)
    .eq('device_hash', body.deviceId)
    .select()
    .single()
  await logEvent(license.id, device?.id || null, 'deactivate', true, 'user_requested', '')
  return withCors({ ok: true })
}

async function logEvent(
  licenseId: string | null,
  deviceId: string | null,
  eventType: string,
  success: boolean,
  reason: string,
  appVersion: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = getServiceClient()
  await supabase.from('license_events').insert({
    license_id: licenseId,
    device_id: deviceId,
    event_type: eventType,
    success,
    reason,
    app_version: appVersion || null,
    metadata
  })
}
