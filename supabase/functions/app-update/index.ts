import { z } from 'npm:zod@3.25.76'
import semver from 'npm:semver@7.7.2'
import { corsHeaders, withCors } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/crypto.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { clientIp, getServiceClient } from '../_shared/supabase.ts'

const AUTO_UPDATE_DOWNLOAD_ENABLED = (Deno.env.get('AUTO_UPDATE_DOWNLOAD_ENABLED') || '').toLowerCase() === 'true'

const CheckSchema = z.object({
  currentVersion: z.string().default('0.0.0'),
  platform: z.string().min(1).max(40),
  architecture: z.string().min(1).max(40),
  channel: z.enum(['stable', 'beta']).default('stable'),
  deviceId: z.string().max(80).optional().default('')
})

const DownloadSchema = z.object({
  action: z.literal('download'),
  releaseId: z.string().uuid(),
  deviceId: z.string().max(80).optional().default('')
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null)
      if (body?.action === 'download') {
        return withCors(await recordDownload(request, body))
      }
      return withCors(await checkForUpdate(request, body || {}))
    }

    if (request.method === 'GET') {
      return withCors(await checkForUpdate(request, Object.fromEntries(new URL(request.url).searchParams)))
    }

    return withCors({ error: 'method_not_allowed' }, { status: 405 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return withCors({ error: 'invalid_input', details: error.flatten() }, { status: 400 })
    }
    console.error('app_update_error', error instanceof Error ? error.message : error)
    return withCors({ error: 'server_error' }, { status: 500 })
  }
})

async function checkForUpdate(request: Request, input: unknown) {
  const query = CheckSchema.parse(input)
  const subject = `${clientIp(request)}:${query.deviceId || 'no-device'}:${query.platform}:${query.architecture}:${query.channel}`
  const rate = await checkRateLimit('app_update_check', subject, 120, 15 * 60)
  if (!rate.allowed) {
    return { error: 'rate_limited' }
  }

  const result = await withTimeout(loadLatestRelease(query), 12000)
  await safeLogUpdateCheck(request, query, result.latest?.id || null, Boolean(result.updateAvailable))
  if (result.latest?.id) {
    await safeIncrementCounter(result.latest.id, 'check_count')
  }

  if (!result.latest) {
    return {
      updateAvailable: false,
      latestVersion: query.currentVersion,
      manualUpdateOnly: true
    }
  }

  if (!result.updateAvailable) {
    return {
      updateAvailable: false,
      latestVersion: result.latest.version,
      manualUpdateOnly: true
    }
  }

  return {
    updateAvailable: true,
    releaseId: result.latest.id,
    latestVersion: result.latest.version,
    mandatory: result.mandatory,
    minimumSupportedVersion: result.latest.minimum_supported_version,
    releaseNotes: result.latest.release_notes,
    publishedAt: result.latest.published_at || result.latest.created_at,
    downloadUrl: AUTO_UPDATE_DOWNLOAD_ENABLED ? result.latest.download_url : null,
    metadataUrl: AUTO_UPDATE_DOWNLOAD_ENABLED ? result.latest.metadata_url : null,
    sha512: AUTO_UPDATE_DOWNLOAD_ENABLED ? result.latest.sha512 || result.latest.file_hash : null,
    fileSize: AUTO_UPDATE_DOWNLOAD_ENABLED ? result.latest.file_size : null,
    manualUpdateOnly: !AUTO_UPDATE_DOWNLOAD_ENABLED
  }
}

async function loadLatestRelease(query: z.infer<typeof CheckSchema>) {
  const currentVersion = semver.valid(query.currentVersion) ? query.currentVersion : '0.0.0'
  const { data, error } = await getServiceClient()
    .from('app_releases')
    .select('*')
    .eq('published', true)
    .eq('channel', query.channel)
    .eq('platform', query.platform)
    .eq('architecture', query.architecture)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const latest = (data || [])
    .filter((release) => semver.valid(release.version))
    .sort((a, b) => semver.rcompare(a.version, b.version))[0]

  if (!latest) {
    return { latest: null, updateAvailable: false, mandatory: false }
  }

  const minimum = latest.minimum_supported_version && semver.valid(latest.minimum_supported_version)
    ? latest.minimum_supported_version
    : null
  const belowMinimum = minimum ? semver.lt(currentVersion, minimum) : false
  const newer = semver.gt(latest.version, currentVersion)
  const updateAvailable = newer || belowMinimum

  return {
    latest,
    updateAvailable,
    mandatory: Boolean(latest.mandatory) || belowMinimum
  }
}

async function recordDownload(request: Request, input: unknown) {
  const body = DownloadSchema.parse(input)
  const rate = await checkRateLimit('app_update_download', `${clientIp(request)}:${body.deviceId}:${body.releaseId}`, 20, 15 * 60)
  if (!rate.allowed) {
    return { ok: false, error: 'rate_limited' }
  }
  await safeIncrementCounter(body.releaseId, 'download_count')
  await safeLogUpdateCheck(request, {
    currentVersion: '',
    platform: '',
    architecture: '',
    channel: 'stable',
    deviceId: body.deviceId
  }, body.releaseId, true, 'app_update_download')
  return { ok: true }
}

async function safeIncrementCounter(releaseId: string, column: 'check_count' | 'download_count') {
  try {
    await incrementCounter(releaseId, column)
  } catch (error) {
    console.warn('app_update_counter_warning', error instanceof Error ? error.message : error)
  }
}

async function incrementCounter(releaseId: string, column: 'check_count' | 'download_count') {
  const supabase = getServiceClient()
  const { data } = await supabase.from('app_releases').select(column).eq('id', releaseId).single()
  const next = Number(data?.[column] || 0) + 1
  await supabase.from('app_releases').update({ [column]: next }).eq('id', releaseId)
}

async function logUpdateCheck(
  request: Request,
  query: z.infer<typeof CheckSchema>,
  releaseId: string | null,
  updateAvailable: boolean,
  eventType = 'app_update_check'
) {
  const ipHash = await sha256Hex(clientIp(request))
  const deviceHash = query.deviceId ? await sha256Hex(query.deviceId) : null
  await getServiceClient().from('license_events').insert({
    license_id: null,
    device_id: null,
    event_type: eventType,
    success: true,
    reason: updateAvailable ? 'update_available_or_download' : 'latest',
    app_version: query.currentVersion || null,
    actor: 'client',
    ip_hash: ipHash,
    metadata: {
      platform: query.platform || null,
      architecture: query.architecture || null,
      channel: query.channel || null,
      releaseId,
      device: deviceHash ? `${deviceHash.slice(0, 8)}...${deviceHash.slice(-4)}` : null
    }
  })
}

async function safeLogUpdateCheck(
  request: Request,
  query: z.infer<typeof CheckSchema>,
  releaseId: string | null,
  updateAvailable: boolean,
  eventType = 'app_update_check'
) {
  try {
    await logUpdateCheck(request, query, releaseId, updateAvailable, eventType)
  } catch (error) {
    console.warn('app_update_log_warning', error instanceof Error ? error.message : error)
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('update_check_timeout')), timeoutMs)
    })
  ])
}
