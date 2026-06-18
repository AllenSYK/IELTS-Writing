import { z } from 'npm:zod@3.25.76'
import semver from 'npm:semver@7.7.2'
import { corsHeaders, withCors } from '../_shared/cors.ts'
import { generateLicenseKey, hashLicenseKey, normalizeLicenseKey, sha256Hex } from '../_shared/crypto.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { clientIp, getServiceClient } from '../_shared/supabase.ts'

const RELEASE_BUCKET = Deno.env.get('RELEASE_BUCKET') || 'ielts-app-updates'
const SESSION_TTL_SECONDS = 8 * 60 * 60
const EXPIRING_SOON_DAYS = Number(Deno.env.get('ADMIN_EXPIRING_SOON_DAYS') || 14)
const AUTO_UPDATE_DOWNLOAD_ENABLED = (Deno.env.get('AUTO_UPDATE_DOWNLOAD_ENABLED') || '').toLowerCase() === 'true'
const ALLOWED_SORT_FIELDS = new Set(['created_at', 'expires_at', 'activated_at', 'updated_at', 'plan', 'status'])
const ALLOWED_DEVICE_SORT_FIELDS = new Set(['first_seen_at', 'last_seen_at', 'operating_system', 'app_version', 'status'])
const ALLOWED_EVENT_SORT_FIELDS = new Set(['created_at', 'event_type', 'success', 'actor', 'app_version'])
const ALLOWED_RELEASE_SORT_FIELDS = new Set(['created_at', 'published_at', 'version', 'channel', 'platform', 'architecture', 'status'])
const ALLOWED_FEEDBACK_SORT_FIELDS = new Set(['created_at', 'updated_at', 'category', 'status', 'priority', 'subject'])
const RELEASE_EXTENSIONS = ['.dmg', '.zip', '.yml', '.yaml', '.blockmap', '.exe', '.pkg']
const SAFE_LICENSE_SELECT = `
  id,
  key_prefix,
  key_last_four,
  plan,
  status,
  duration_days,
  starts_on_first_activation,
  activated_at,
  expires_at,
  max_devices,
  max_activations,
  activation_count,
  auto_update_enabled,
  minimum_app_version,
  maximum_app_version,
  admin_note,
  note,
  product_name,
  internal_note,
  allow_device_deactivation,
  created_at,
  updated_at,
  revoked_at
`
const SAFE_LICENSE_SELECT_LEGACY = `
  id,
  key_prefix,
  key_last_four,
  plan,
  status,
  duration_days,
  starts_on_first_activation,
  activated_at,
  expires_at,
  max_devices,
  max_activations,
  activation_count,
  auto_update_enabled,
  minimum_app_version,
  maximum_app_version,
  admin_note,
  created_at,
  updated_at,
  revoked_at
`

const ActionSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.unknown().optional(),
  adminSecret: z.string().optional()
})

const LoginSchema = z.object({
  password: z.string().min(1).max(256)
})

const ListKeysSchema = z.object({
  search: z.string().max(120).optional().default(''),
  status: z.string().max(40).optional().default('all'),
  activated: z.enum(['all', 'yes', 'no']).optional().default('all'),
  createdFrom: z.string().datetime().optional().nullable(),
  createdTo: z.string().datetime().optional().nullable(),
  expiresFrom: z.string().datetime().optional().nullable(),
  expiresTo: z.string().datetime().optional().nullable(),
  page: z.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(25),
  sortBy: z.string().optional().default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
})

const ListDevicesSchema = z.object({
  search: z.string().max(120).optional().default(''),
  platform: z.string().max(40).optional().default('all'),
  appVersion: z.string().max(40).optional().default('all'),
  status: z.enum(['all', 'active', 'deactivated', 'blocked']).optional().default('all'),
  lastSeenFrom: z.string().datetime().optional().nullable(),
  lastSeenTo: z.string().datetime().optional().nullable(),
  page: z.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(25),
  sortBy: z.string().optional().default('last_seen_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
})

const CreateKeysSchema = z.object({
  count: z.number().int().min(1).max(500).default(1),
  note: z.string().max(500).optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  maxDevices: z.number().int().positive().optional().nullable(),
  maxActivations: z.number().int().positive().optional().nullable(),
  startsOnFirstActivation: z.boolean().default(true),
  productName: z.string().min(1).max(120).default('IELTS Writing'),
  plan: z.string().min(1).max(80).default('standard'),
  expiresAt: z.string().datetime().optional().nullable(),
  allowDeviceDeactivation: z.boolean().default(true),
  autoUpdateEnabled: z.boolean().default(true),
  minimumAppVersion: z.string().max(32).optional().nullable(),
  maximumAppVersion: z.string().max(32).optional().nullable(),
  internalNote: z.string().max(1000).optional().nullable()
})

const IdSchema = z.object({ id: z.string().uuid() })
const IdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })

const StatusSchema = IdSchema.extend({
  status: z.enum(['unused', 'active', 'expired', 'suspended', 'revoked', 'disabled'])
})

const BulkStatusSchema = IdsSchema.extend({
  status: z.enum(['unused', 'active', 'expired', 'suspended', 'revoked', 'disabled'])
})

const UpdateKeySchema = IdSchema.extend({
  expiresAt: z.string().datetime().nullable().optional(),
  maxDevices: z.number().int().positive().nullable().optional(),
  maxActivations: z.number().int().positive().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  internalNote: z.string().max(1000).nullable().optional(),
  plan: z.string().min(1).max(80).optional(),
  productName: z.string().min(1).max(120).optional(),
  allowDeviceDeactivation: z.boolean().optional(),
  autoUpdateEnabled: z.boolean().optional(),
  minimumAppVersion: z.string().max(32).nullable().optional(),
  maximumAppVersion: z.string().max(32).nullable().optional()
})

const ExtendKeysSchema = IdsSchema.extend({
  days: z.number().int().positive().max(3650).optional(),
  expiresAt: z.string().datetime().optional()
}).refine((value) => Boolean(value.days || value.expiresAt), {
  message: 'days or expiresAt is required'
})

const DeviceSchema = z.object({
  licenseId: z.string().uuid(),
  deviceId: z.string().uuid()
})

const ListEventsSchema = z.object({
  licenseId: z.string().uuid().optional().nullable(),
  search: z.string().max(120).optional().default(''),
  eventType: z.string().max(80).optional().default('all'),
  success: z.enum(['all', 'success', 'failed']).optional().default('all'),
  createdFrom: z.string().datetime().optional().nullable(),
  createdTo: z.string().datetime().optional().nullable(),
  page: z.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.number().int().min(1).max(500).optional().default(200),
  limit: z.number().int().min(1).max(500).optional(),
  sortBy: z.string().optional().default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
})

const ListFeedbackSchema = z.object({
  search: z.string().max(120).optional().default(''),
  status: z.enum(['all', 'pending', 'reviewing', 'resolved', 'closed']).optional().default('all'),
  category: z.string().max(60).optional().default('all'),
  priority: z.enum(['all', 'low', 'normal', 'high', 'urgent']).optional().default('all'),
  page: z.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(25),
  sortBy: z.string().optional().default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
})

const UpdateFeedbackSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'reviewing', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  adminNote: z.string().max(2000).nullable().optional()
}).refine((value) => value.status || value.priority || Object.prototype.hasOwnProperty.call(value, 'adminNote'), {
  message: 'status, priority or adminNote is required'
})

const AdminSettingsSchema = z.object({
  defaultDurationDays: z.number().int().min(1).max(3650).default(30),
  defaultMaxDevices: z.number().int().min(1).max(50).default(1),
  allowDeviceDeactivation: z.boolean().default(true),
  expiringReminderDays: z.number().int().min(1).max(365).default(14),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  autoUpdateDownloadEnabled: z.boolean().default(false),
  latestVersion: z.string().max(32).optional().nullable(),
  minimumSupportedVersion: z.string().max(32).optional().nullable(),
  pageSize: z.number().int().min(10).max(200).default(25),
  defaultSort: z.string().max(40).default('created_at_desc'),
  dateFormat: z.string().max(40).default('zh-CN'),
  timezone: z.string().max(80).default('Asia/Shanghai')
})

const ListReleasesSchema = z.object({
  search: z.string().max(120).optional().default(''),
  channel: z.enum(['all', 'stable', 'beta']).optional().default('all'),
  platform: z.string().max(40).optional().default('all'),
  architecture: z.string().max(40).optional().default('all'),
  page: z.number().int().min(1).max(10000).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(25),
  sortBy: z.string().optional().default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc')
})

const PublishReleaseSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.string().min(1).max(32),
  channel: z.enum(['stable', 'beta']).default('stable'),
  platform: z.string().min(1).max(40),
  architecture: z.string().min(1).max(40),
  releaseNotes: z.string().max(10000).optional().nullable(),
  mandatory: z.boolean().default(false),
  minimumSupportedVersion: z.string().max(32).optional().nullable(),
  downloadUrl: z.string().url().optional().nullable(),
  metadataUrl: z.string().url().optional().nullable(),
  sha512: z.string().max(512).optional().nullable(),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  published: z.boolean().default(false),
  status: z.enum(['draft', 'uploading', 'failed', 'published']).optional(),
  storageProvider: z.string().max(40).optional().nullable(),
  artifacts: z.unknown().optional().nullable(),
  failureReason: z.string().max(1000).optional().nullable()
})

const UpdateReleaseSchema = z.object({
  id: z.string().uuid(),
  releaseNotes: z.string().max(10000).optional().nullable(),
  mandatory: z.boolean().optional(),
  minimumSupportedVersion: z.string().max(32).optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  published: z.boolean().optional(),
  status: z.enum(['draft', 'uploading', 'failed', 'published']).optional(),
  storageProvider: z.string().max(40).optional().nullable(),
  artifacts: z.unknown().optional().nullable(),
  failureReason: z.string().max(1000).optional().nullable()
})

const UploadSchema = z.object({
  path: z.string().min(3).max(420),
  contentType: z.string().min(3).max(120).default('application/octet-stream'),
  upsert: z.boolean().default(false)
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return withCors({ error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const body = ActionSchema.parse(await request.json())
    if (!isAuthorized(request, body.adminSecret)) {
      await safeLogAdminEvent(request, 'admin_unauthorized', false, 'bad_secret')
      return withCors({ error: 'unauthorized' }, { status: 401 })
    }

    switch (body.action) {
      case 'login':
        return withCors(await login(request, body.payload))
      case 'getDashboard':
        return withCors(await getDashboard())
      case 'listKeys':
        return withCors(await listKeys(body.payload))
      case 'listDevices':
        return withCors(await listDevices(body.payload))
      case 'createKeys':
        return withCors(await createKeys(request, body.payload))
      case 'updateStatus':
        return withCors(await updateStatus(request, body.payload))
      case 'bulkStatus':
        return withCors(await bulkStatus(request, body.payload))
      case 'updateKey':
        return withCors(await updateKey(request, body.payload))
      case 'extendKeys':
        return withCors(await extendKeys(request, body.payload))
      case 'resetDevices':
        return withCors(await resetDevices(request, body.payload))
      case 'deactivateDevice':
        return withCors(await deactivateDevice(request, body.payload))
      case 'listEvents':
        return withCors(await listEvents(body.payload))
      case 'listFeedback':
        return withCors(await listFeedback(body.payload))
      case 'updateFeedback':
        return withCors(await updateFeedback(request, body.payload))
      case 'listReleases':
        return withCors(await listReleases(body.payload))
      case 'getAdminSettings':
        return withCors(await getAdminSettings())
      case 'saveAdminSettings':
        return withCors(await saveAdminSettings(request, body.payload))
      case 'publishRelease':
        return withCors(await publishRelease(request, body.payload))
      case 'updateRelease':
        return withCors(await updateRelease(request, body.payload))
      case 'createUpload':
        return withCors(await createUpload(request, body.payload))
      default:
        return withCors({ error: 'unknown_action' }, { status: 404 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return withCors({ error: 'invalid_input', details: error.flatten() }, { status: 400 })
    }
    console.error('admin_license_error', error instanceof Error ? error.message : error)
    return withCors({ error: 'server_error' }, { status: 500 })
  }
})

async function login(request: Request, payload: unknown) {
  const body = LoginSchema.parse(payload || {})
  const rate = await checkRateLimit('admin_login', clientIp(request), 8, 15 * 60)
  if (!rate.allowed) {
    await logAdminEvent(request, 'admin_login', false, 'rate_limited')
    return { ok: false, error: 'rate_limited' }
  }

  const ok = await verifyAdminPassword(body.password)
  await logAdminEvent(request, 'admin_login', ok, ok ? 'ok' : 'invalid_credentials')
  if (!ok) {
    return { ok: false, error: 'invalid_credentials' }
  }
  return { ok: true, expiresInSeconds: SESSION_TTL_SECONDS }
}

async function getDashboard() {
  const supabase = getServiceClient()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400000).toISOString()
  const nowIso = now.toISOString()

  const [
    total,
    active,
    unused,
    expired,
    suspended,
    revoked,
    expiringSoon,
    activeDevices,
    activationSuccess7d,
    activationFailed7d,
    settings
  ] = await Promise.all([
    countRows('license_keys'),
    countRows('license_keys', (query) => query.eq('status', 'active')),
    countRows('license_keys', (query) => query.eq('status', 'unused')),
    countRows('license_keys', (query) => query.or(`status.eq.expired,expires_at.lte.${nowIso}`)),
    countRows('license_keys', (query) => query.eq('status', 'suspended')),
    countRows('license_keys', (query) => query.eq('status', 'revoked')),
    countRows('license_keys', (query) =>
      query
        .gte('expires_at', nowIso)
        .lte('expires_at', soon)
        .not('status', 'in', '(suspended,revoked,disabled,expired)')
    ),
    countRows('license_devices', (query) => query.eq('status', 'active')),
    countRows('license_events', (query) => query.eq('event_type', 'activate').eq('success', true).gte('created_at', sevenDaysAgo)),
    countRows('license_events', (query) => query.eq('event_type', 'activate').eq('success', false).gte('created_at', sevenDaysAgo)),
    loadAdminSettings()
  ])

  const { data: releases, error: releaseError } = await supabase
    .from('app_releases')
    .select('*')
    .eq('published', true)
    .eq('channel', settings.updateChannel)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
  if (releaseError) throw releaseError
  const latestRelease = releases?.[0] || null

  return {
    stats: {
      total,
      active,
      unused,
      expiringSoon,
      expired,
      suspended,
      revoked,
      activeDevices,
      activationSuccess7d,
      activationFailed7d
    },
    latestRelease,
    update: {
      channel: settings.updateChannel,
      mode: AUTO_UPDATE_DOWNLOAD_ENABLED ? 'auto_download' : 'manual_contact',
      modeLabel: AUTO_UPDATE_DOWNLOAD_ENABLED ? '自动下载并安装更新' : '检测到新版本后，提示用户联系开发者更新',
      autoUpdateDownloadEnabled: AUTO_UPDATE_DOWNLOAD_ENABLED
    },
    settings
  }
}

async function countRows(table: string, build?: (query: any) => any) {
  let query = getServiceClient().from(table).select('id', { count: 'exact', head: true })
  if (build) {
    query = build(query) as typeof query
  }
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function listKeys(payload: unknown) {
  const body = ListKeysSchema.parse(payload || {})
  const supabase = getServiceClient()
  const sortBy = ALLOWED_SORT_FIELDS.has(body.sortBy) ? body.sortBy : 'created_at'
  const page = body.page
  const pageSize = body.pageSize
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const select = `
    ${SAFE_LICENSE_SELECT},
    license_devices(
      id,
      device_hash,
      device_name,
      operating_system,
      app_version,
      status,
      first_seen_at,
      last_seen_at,
      deactivated_at,
      created_at
    )
  `
  const legacySelect = `
    ${SAFE_LICENSE_SELECT_LEGACY},
    license_devices(
      id,
      device_hash,
      device_name,
      operating_system,
      app_version,
      status,
      first_seen_at,
      last_seen_at,
      deactivated_at,
      created_at
    )
  `
  let query = supabase
    .from('license_keys')
    .select(select, { count: 'exact' })

  const derivedStatusFilter = body.status === 'device_full' || body.status === 'expiring'
  if (body.status !== 'all' && !derivedStatusFilter) {
    query = query.eq('status', body.status)
  }
  if (body.activated === 'yes') query = query.not('activated_at', 'is', null)
  if (body.activated === 'no') query = query.is('activated_at', null)
  if (body.createdFrom) query = query.gte('created_at', body.createdFrom)
  if (body.createdTo) query = query.lte('created_at', body.createdTo)
  if (body.expiresFrom) query = query.gte('expires_at', body.expiresFrom)
  if (body.expiresTo) query = query.lte('expires_at', body.expiresTo)
  if (body.search.trim()) {
    const term = escapeSearchTerm(body.search)
    query = query.or(`key_prefix.ilike.%${term}%,key_last_four.ilike.%${term}%,plan.ilike.%${term}%,note.ilike.%${term}%,internal_note.ilike.%${term}%,product_name.ilike.%${term}%`)
  }

  if (derivedStatusFilter) {
    query = query.order(sortBy, { ascending: body.sortDirection === 'asc' }).limit(1000)
  } else {
    query = query.order(sortBy, { ascending: body.sortDirection === 'asc' }).range(from, to)
  }

  let { data, error, count } = await query
  if (isMissingColumnError(error)) {
    let legacyQuery = supabase.from('license_keys').select(legacySelect, { count: 'exact' })
    if (body.status !== 'all' && !derivedStatusFilter) legacyQuery = legacyQuery.eq('status', body.status)
    if (body.activated === 'yes') legacyQuery = legacyQuery.not('activated_at', 'is', null)
    if (body.activated === 'no') legacyQuery = legacyQuery.is('activated_at', null)
    if (body.createdFrom) legacyQuery = legacyQuery.gte('created_at', body.createdFrom)
    if (body.createdTo) legacyQuery = legacyQuery.lte('created_at', body.createdTo)
    if (body.expiresFrom) legacyQuery = legacyQuery.gte('expires_at', body.expiresFrom)
    if (body.expiresTo) legacyQuery = legacyQuery.lte('expires_at', body.expiresTo)
    if (body.search.trim()) {
      const term = escapeSearchTerm(body.search)
      legacyQuery = legacyQuery.or(`key_prefix.ilike.%${term}%,key_last_four.ilike.%${term}%,plan.ilike.%${term}%,admin_note.ilike.%${term}%`)
    }
    legacyQuery = derivedStatusFilter
      ? legacyQuery.order(sortBy, { ascending: body.sortDirection === 'asc' }).limit(1000)
      : legacyQuery.order(sortBy, { ascending: body.sortDirection === 'asc' }).range(from, to)
    const legacy = await legacyQuery
    data = legacy.data
    error = legacy.error
    count = legacy.count
  }
  if (error) throw error

  let keys = (data || []).map(enrichLicenseKey)
  let total = count || keys.length
  if (derivedStatusFilter) {
    const filtered = keys.filter((key) => key.display_status === body.status)
    total = filtered.length
    keys = filtered.slice(from, from + pageSize)
  }

  return { keys, page, pageSize, total }
}

async function listDevices(payload: unknown) {
  const body = ListDevicesSchema.parse(payload || {})
  const sortBy = ALLOWED_DEVICE_SORT_FIELDS.has(body.sortBy) ? body.sortBy : 'last_seen_at'
  const from = (body.page - 1) * body.pageSize
  const to = from + body.pageSize - 1
  let query = getServiceClient()
    .from('license_devices')
    .select(`
      id,
      license_id,
      device_hash,
      device_name,
      operating_system,
      app_version,
      first_seen_at,
      last_seen_at,
      status,
      deactivated_at,
      created_at,
      license_keys(
        id,
        key_prefix,
        key_last_four,
        plan,
        status,
        note,
        product_name
      )
    `, { count: 'exact' })
    .order(sortBy, { ascending: body.sortDirection === 'asc' })

  if (body.status !== 'all') query = query.eq('status', body.status)
  if (body.platform !== 'all') query = query.eq('operating_system', body.platform)
  if (body.appVersion !== 'all') query = query.eq('app_version', body.appVersion)
  if (body.lastSeenFrom) query = query.gte('last_seen_at', body.lastSeenFrom)
  if (body.lastSeenTo) query = query.lte('last_seen_at', body.lastSeenTo)
  if (body.search.trim()) {
    const term = escapeSearchTerm(body.search)
    query = query.or(`device_hash.ilike.%${term}%,device_name.ilike.%${term}%,operating_system.ilike.%${term}%,app_version.ilike.%${term}%`)
  }

  const { data, error, count } = await query.range(from, to)
  if (error) throw error

  return {
    devices: (data || []).map((device) => {
      const masked = maskDevice(device)
      const license = Array.isArray(device.license_keys) ? device.license_keys[0] : device.license_keys
      return {
        ...masked,
        license: license
          ? {
              id: license.id,
              masked_key: `${license.key_prefix}-****-****-****-${license.key_last_four}`,
              key_last_four: license.key_last_four,
              plan: license.plan,
              status: license.status,
              note: license.note || null,
              product_name: license.product_name || 'IELTS Writing'
            }
          : null
      }
    }),
    page: body.page,
    pageSize: body.pageSize,
    total: count || 0
  }
}

async function createKeys(request: Request, payload: unknown) {
  const body = CreateKeysSchema.parse(payload || {})
  const supabase = getServiceClient()
  const now = new Date()
  const immediateExpiry =
    !body.startsOnFirstActivation && body.durationDays
      ? new Date(now.getTime() + body.durationDays * 86400000).toISOString()
      : null
  const expiresAt = body.expiresAt || immediateExpiry
  const keys = Array.from({ length: body.count }, () => generateLicenseKey())
  const rows = await Promise.all(
    keys.map(async (licenseKey) => ({
      key_hash: await hashLicenseKey(licenseKey),
      key_prefix: normalizeLicenseKey(licenseKey).slice(0, 4),
      key_last_four: normalizeLicenseKey(licenseKey).slice(-4),
      plan: body.plan,
      duration_days: body.durationDays || null,
      starts_on_first_activation: body.startsOnFirstActivation,
      expires_at: expiresAt,
      max_devices: body.maxDevices || null,
      max_activations: body.maxActivations || null,
      auto_update_enabled: body.autoUpdateEnabled,
      minimum_app_version: body.minimumAppVersion || null,
      maximum_app_version: body.maximumAppVersion || null,
      admin_note: body.internalNote || null,
      note: body.note || null,
      product_name: body.productName,
      internal_note: body.internalNote || null,
      allow_device_deactivation: body.allowDeviceDeactivation
    }))
  )

  let { data, error } = await supabase
    .from('license_keys')
    .insert(rows)
    .select('id,key_prefix,key_last_four,status,expires_at,created_at,max_devices,plan,note,product_name')
  if (isMissingColumnError(error)) {
    const legacyRows = rows.map((row) => ({
      key_hash: row.key_hash,
      key_prefix: row.key_prefix,
      key_last_four: row.key_last_four,
      plan: row.plan,
      duration_days: row.duration_days,
      starts_on_first_activation: row.starts_on_first_activation,
      expires_at: row.expires_at,
      max_devices: row.max_devices,
      max_activations: row.max_activations,
      auto_update_enabled: row.auto_update_enabled,
      minimum_app_version: row.minimum_app_version,
      maximum_app_version: row.maximum_app_version,
      admin_note: row.internal_note
    }))
    const legacy = await supabase
      .from('license_keys')
      .insert(legacyRows)
      .select('id,key_prefix,key_last_four,status,expires_at,created_at,max_devices,plan,admin_note')
    data = legacy.data?.map((row) => ({ ...row, note: row.admin_note, product_name: body.productName }))
    error = legacy.error
  }
  if (error) throw error

  await logAdminEvent(request, 'admin_generate_license', true, 'ok', {
    count: body.count,
    plan: body.plan,
    productName: body.productName,
    durationDays: body.durationDays,
    startsOnFirstActivation: body.startsOnFirstActivation
  })

  return {
    keys: keys.map((licenseKey, index) => {
      const row = data?.[index]
      return {
        id: row?.id,
        licenseKey,
        masked: maskLicenseKey(licenseKey),
        created_at: row?.created_at,
        expires_at: row?.expires_at,
        status: row?.status || 'unused',
        max_devices: row?.max_devices,
        plan: row?.plan,
        note: row?.note,
        product_name: row?.product_name
      }
    })
  }
}

async function updateStatus(request: Request, payload: unknown) {
  const body = StatusSchema.parse(payload || {})
  const patch: Record<string, unknown> = {
    status: body.status,
    revoked_at: body.status === 'revoked' ? new Date().toISOString() : null
  }
  let { data, error } = await getServiceClient()
    .from('license_keys')
    .update(patch)
    .eq('id', body.id)
    .select(SAFE_LICENSE_SELECT)
    .single()
  if (isMissingColumnError(error)) {
    const legacy = await getServiceClient()
      .from('license_keys')
      .update(patch)
      .eq('id', body.id)
      .select(SAFE_LICENSE_SELECT_LEGACY)
      .single()
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error

  await logAdminEvent(request, `admin_${body.status}_license`, true, 'ok', { licenseId: body.id }, body.id)
  return { key: enrichLicenseKey(data) }
}

async function bulkStatus(request: Request, payload: unknown) {
  const body = BulkStatusSchema.parse(payload || {})
  const patch: Record<string, unknown> = {
    status: body.status,
    revoked_at: body.status === 'revoked' ? new Date().toISOString() : null
  }
  const { data, error } = await getServiceClient()
    .from('license_keys')
    .update(patch)
    .in('id', body.ids)
    .select('id,status')
  if (error) throw error

  await logAdminEvent(request, `admin_bulk_${body.status}_license`, true, 'ok', {
    count: body.ids.length,
    licenseIds: body.ids.map((id) => id.slice(0, 8))
  })
  return { keys: data || [], count: data?.length || 0 }
}

async function updateKey(request: Request, payload: unknown) {
  const body = UpdateKeySchema.parse(payload || {})
  const patch: Record<string, unknown> = {}
  if ('expiresAt' in body) {
    patch.expires_at = body.expiresAt
    if (body.expiresAt && new Date(body.expiresAt).getTime() > Date.now()) {
      patch.status = 'active'
    }
  }
  if ('maxDevices' in body) patch.max_devices = body.maxDevices
  if ('maxActivations' in body) patch.max_activations = body.maxActivations
  if ('note' in body) patch.note = body.note
  if ('internalNote' in body) {
    patch.internal_note = body.internalNote
    patch.admin_note = body.internalNote
  }
  if ('plan' in body) patch.plan = body.plan
  if ('productName' in body) patch.product_name = body.productName
  if ('allowDeviceDeactivation' in body) patch.allow_device_deactivation = body.allowDeviceDeactivation
  if ('autoUpdateEnabled' in body) patch.auto_update_enabled = body.autoUpdateEnabled
  if ('minimumAppVersion' in body) patch.minimum_app_version = body.minimumAppVersion
  if ('maximumAppVersion' in body) patch.maximum_app_version = body.maximumAppVersion

  let { data, error } = await getServiceClient()
    .from('license_keys')
    .update(patch)
    .eq('id', body.id)
    .select(SAFE_LICENSE_SELECT)
    .single()
  if (isMissingColumnError(error)) {
    const legacyPatch = { ...patch }
    if ('note' in legacyPatch && !('admin_note' in legacyPatch)) legacyPatch.admin_note = legacyPatch.note
    delete legacyPatch.note
    delete legacyPatch.internal_note
    delete legacyPatch.product_name
    delete legacyPatch.allow_device_deactivation
    const legacy = await getServiceClient()
      .from('license_keys')
      .update(legacyPatch)
      .eq('id', body.id)
      .select(SAFE_LICENSE_SELECT_LEGACY)
      .single()
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error

  await logAdminEvent(request, 'admin_update_license', true, 'ok', {
    licenseId: body.id,
    fields: Object.keys(patch)
  }, body.id)
  return { key: enrichLicenseKey(data) }
}

async function extendKeys(request: Request, payload: unknown) {
  const body = ExtendKeysSchema.parse(payload || {})
  const supabase = getServiceClient()
  const { data: keys, error: loadError } = await supabase
    .from('license_keys')
    .select('id,expires_at,status')
    .in('id', body.ids)
  if (loadError) throw loadError

  const now = Date.now()
  const updates = await Promise.all(
    (keys || []).map(async (key) => {
      const nextExpiry = body.expiresAt
        ? body.expiresAt
        : new Date(Math.max(now, key.expires_at ? new Date(key.expires_at).getTime() : now) + (body.days || 0) * 86400000).toISOString()
      const { data, error } = await supabase
        .from('license_keys')
        .update({ expires_at: nextExpiry, status: key.status === 'revoked' ? 'revoked' : 'active' })
        .eq('id', key.id)
        .select('id,expires_at,status')
        .single()
      if (error) throw error
      return data
    })
  )

  await logAdminEvent(request, 'admin_extend_license', true, 'ok', {
    count: updates.length,
    days: body.days || null,
    expiresAt: body.expiresAt || null
  })
  return { keys: updates, count: updates.length }
}

async function resetDevices(request: Request, payload: unknown) {
  const body = IdSchema.parse(payload || {})
  const { data, error } = await getServiceClient()
    .from('license_devices')
    .update({ status: 'deactivated', deactivated_at: new Date().toISOString() })
    .eq('license_id', body.id)
    .eq('status', 'active')
    .select('id')
  if (error) throw error

  await logAdminEvent(request, 'admin_unbind_device', true, 'reset_all', { licenseId: body.id, count: data?.length || 0 }, body.id)
  return { devices: data || [], count: data?.length || 0 }
}

async function deactivateDevice(request: Request, payload: unknown) {
  const body = DeviceSchema.parse(payload || {})
  const { data, error } = await getServiceClient()
    .from('license_devices')
    .update({ status: 'deactivated', deactivated_at: new Date().toISOString() })
    .eq('license_id', body.licenseId)
    .eq('id', body.deviceId)
    .select()
    .single()
  if (error) throw error

  await logAdminEvent(request, 'admin_unbind_device', true, 'single_device', {
    licenseId: body.licenseId,
    device: body.deviceId.slice(0, 8)
  }, body.licenseId, body.deviceId)
  return { device: maskDevice(data) }
}

async function listEvents(payload: unknown) {
  const body = ListEventsSchema.parse(payload || {})
  const sortBy = ALLOWED_EVENT_SORT_FIELDS.has(body.sortBy) ? body.sortBy : 'created_at'
  const pageSize = body.limit || body.pageSize
  const from = (body.page - 1) * pageSize
  const to = from + pageSize - 1
  let query = getServiceClient()
    .from('license_events')
    .select('id,license_id,device_id,event_type,success,reason,app_version,metadata,actor,ip_hash,created_at', { count: 'exact' })
    .order(sortBy, { ascending: body.sortDirection === 'asc' })
  if (body.licenseId) query = query.eq('license_id', body.licenseId)
  if (body.eventType !== 'all') query = query.eq('event_type', body.eventType)
  if (body.success === 'success') query = query.eq('success', true)
  if (body.success === 'failed') query = query.eq('success', false)
  if (body.createdFrom) query = query.gte('created_at', body.createdFrom)
  if (body.createdTo) query = query.lte('created_at', body.createdTo)
  if (body.search.trim()) {
    const term = escapeSearchTerm(body.search)
    query = query.or(`event_type.ilike.%${term}%,reason.ilike.%${term}%,app_version.ilike.%${term}%,actor.ilike.%${term}%`)
  }
  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  return { events: (data || []).map(maskEvent), page: body.page, pageSize, total: count || 0 }
}

async function listFeedback(payload: unknown) {
  const body = ListFeedbackSchema.parse(payload || {})
  const sortBy = ALLOWED_FEEDBACK_SORT_FIELDS.has(body.sortBy) ? body.sortBy : 'created_at'
  const from = (body.page - 1) * body.pageSize
  const to = from + body.pageSize - 1
  let query = getServiceClient()
    .from('support_feedback')
    .select('id,category,subject,message,contact_email,app_version,platform,os_version,diagnostics,status,priority,admin_note,created_at,updated_at', { count: 'exact' })
    .order(sortBy, { ascending: body.sortDirection === 'asc' })

  if (body.status !== 'all') query = query.eq('status', body.status)
  if (body.category !== 'all') query = query.eq('category', body.category)
  if (body.priority !== 'all') query = query.eq('priority', body.priority)
  if (body.search.trim()) {
    const term = escapeSearchTerm(body.search)
    const clauses = [
      `category.ilike.%${term}%`,
      `subject.ilike.%${term}%`,
      `message.ilike.%${term}%`,
      `contact_email.ilike.%${term}%`,
      `app_version.ilike.%${term}%`,
      `priority.ilike.%${term}%`
    ]
    if (/^[0-9a-f-]{32,36}$/i.test(term)) clauses.unshift(`id.eq.${term}`)
    query = query.or(clauses.join(','))
  }

  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  return { feedback: data || [], page: body.page, pageSize: body.pageSize, total: count || 0 }
}

async function updateFeedback(request: Request, payload: unknown) {
  const body = UpdateFeedbackSchema.parse(payload || {})
  const patch: Record<string, unknown> = {}
  if (body.status) patch.status = body.status
  if (body.priority) patch.priority = body.priority
  if (Object.prototype.hasOwnProperty.call(body, 'adminNote')) patch.admin_note = body.adminNote || null

  const { data, error } = await getServiceClient()
    .from('support_feedback')
    .update(patch)
    .eq('id', body.id)
    .select('id,category,subject,message,contact_email,app_version,platform,os_version,diagnostics,status,priority,admin_note,created_at,updated_at')
    .single()
  if (error) throw error

  await logAdminEvent(request, 'admin_update_feedback', true, 'ok', {
    feedbackId: body.id.slice(0, 8),
    status: body.status || null,
    priority: body.priority || null
  })

  return { feedback: data }
}

async function listReleases(payload: unknown) {
  const body = ListReleasesSchema.parse(payload || {})
  const sortBy = ALLOWED_RELEASE_SORT_FIELDS.has(body.sortBy) ? body.sortBy : 'created_at'
  const from = (body.page - 1) * body.pageSize
  const to = from + body.pageSize - 1
  let query = getServiceClient()
    .from('app_releases')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: body.sortDirection === 'asc' })
    .range(from, to)
  if (body.channel !== 'all') query = query.eq('channel', body.channel)
  if (body.platform !== 'all') query = query.eq('platform', body.platform)
  if (body.architecture !== 'all') query = query.eq('architecture', body.architecture)
  if (body.search.trim()) {
    const term = escapeSearchTerm(body.search)
    query = query.or(`version.ilike.%${term}%,release_notes.ilike.%${term}%,download_url.ilike.%${term}%`)
  }
  const { data, error, count } = await query
  if (error) throw error
  return { releases: data || [], page: body.page, pageSize: body.pageSize, total: count || 0 }
}

async function getAdminSettings() {
  const settings = await loadAdminSettings()
  return {
    settings,
    updateMode: AUTO_UPDATE_DOWNLOAD_ENABLED ? 'auto_download' : 'manual_contact',
    updateModeLabel: AUTO_UPDATE_DOWNLOAD_ENABLED ? '自动下载并安装更新' : '检测到新版本后，提示用户联系开发者更新',
    autoUpdateDownloadEnabled: AUTO_UPDATE_DOWNLOAD_ENABLED
  }
}

async function saveAdminSettings(request: Request, payload: unknown) {
  const settings = AdminSettingsSchema.parse(payload || {})
  const service = getServiceClient()
  const { data: existing, error: loadError } = await service
    .from('admin_settings')
    .select('id')
    .eq('id', 'default')
    .maybeSingle()
  if (loadError) throw loadError

  const query = existing
    ? service
      .from('admin_settings')
      .update({ setting_value: settings })
      .eq('id', 'default')
    : service
      .from('admin_settings')
      .insert({
        id: 'default',
        setting_key: 'default',
        setting_value: settings,
        description: 'Admin portal defaults'
      })

  const { data, error } = await query
    .select('setting_value,updated_at')
    .single()
  if (error) throw error

  await logAdminEvent(request, 'admin_update_settings', true, 'ok', {
    fields: Object.keys(settings)
  })
  return {
    settings: AdminSettingsSchema.parse(data?.setting_value || settings),
    updatedAt: data?.updated_at || null
  }
}

async function loadAdminSettings() {
  const defaults = defaultAdminSettings()
  const { data, error } = await getServiceClient()
    .from('admin_settings')
    .select('setting_value')
    .eq('id', 'default')
    .maybeSingle()
  if (isMissingTableError(error)) {
    return defaults
  }
  if (error) throw error
  return AdminSettingsSchema.parse({ ...defaults, ...(data?.setting_value || {}) })
}

function defaultAdminSettings() {
  return AdminSettingsSchema.parse({
    defaultDurationDays: 30,
    defaultMaxDevices: 1,
    allowDeviceDeactivation: true,
    expiringReminderDays: EXPIRING_SOON_DAYS,
    updateChannel: 'stable',
    autoUpdateDownloadEnabled: AUTO_UPDATE_DOWNLOAD_ENABLED,
    latestVersion: null,
    minimumSupportedVersion: null,
    pageSize: 25,
    defaultSort: 'created_at_desc',
    dateFormat: 'zh-CN',
    timezone: 'Asia/Shanghai'
  })
}

async function publishRelease(request: Request, payload: unknown) {
  const body = PublishReleaseSchema.parse(payload || {})
  if (!semver.valid(body.version)) {
    return { ok: false, error: 'invalid_version' }
  }
  if (body.minimumSupportedVersion && !semver.valid(body.minimumSupportedVersion)) {
    return { ok: false, error: 'invalid_minimum_supported_version' }
  }
  const status = body.published ? 'published' : body.status || 'draft'

  const row = {
    version: body.version,
    channel: body.channel,
    platform: body.platform,
    architecture: body.architecture,
    release_notes: body.releaseNotes || null,
    mandatory: body.mandatory,
    minimum_supported_version: body.minimumSupportedVersion || null,
    download_url: body.downloadUrl || null,
    metadata_url: body.metadataUrl || null,
    sha512: body.sha512 || null,
    file_hash: body.sha512 || null,
    file_size: body.fileSize ?? null,
    published: body.published,
    published_at: body.published ? (body.publishedAt || new Date().toISOString()) : body.publishedAt || null,
    status,
    storage_provider: body.storageProvider || null,
    artifacts: body.artifacts || null,
    failure_reason: body.failureReason || null
  }

  let { data, error } = await getServiceClient()
    .from('app_releases')
    .upsert(row, { onConflict: 'version,channel,platform,architecture' })
    .select()
    .single()
  if (isMissingColumnError(error)) {
    const legacy = await getServiceClient()
      .from('app_releases')
      .upsert({
        version: row.version,
        channel: row.channel,
        platform: row.platform,
        architecture: row.architecture,
        release_notes: row.release_notes,
        mandatory: row.mandatory,
        minimum_supported_version: row.minimum_supported_version,
        download_url: row.download_url,
        file_hash: row.sha512,
        published: row.published
      }, { onConflict: 'version,channel,platform,architecture' })
      .select()
      .single()
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error

  await logAdminEvent(request, 'admin_publish_release', true, status, {
    releaseId: data.id,
    version: body.version,
    channel: body.channel,
    platform: body.platform,
    architecture: body.architecture
  })
  return { ok: true, release: data }
}

async function updateRelease(request: Request, payload: unknown) {
  const body = UpdateReleaseSchema.parse(payload || {})
  const patch: Record<string, unknown> = {}
  if ('releaseNotes' in body) patch.release_notes = body.releaseNotes || null
  if ('mandatory' in body) patch.mandatory = body.mandatory
  if ('minimumSupportedVersion' in body) patch.minimum_supported_version = body.minimumSupportedVersion || null
  if ('publishedAt' in body) patch.published_at = body.publishedAt || null
  if ('status' in body) patch.status = body.status
  if ('storageProvider' in body) patch.storage_provider = body.storageProvider || null
  if ('artifacts' in body) patch.artifacts = body.artifacts || null
  if ('failureReason' in body) patch.failure_reason = body.failureReason || null
  if ('published' in body) {
    patch.published = body.published
    patch.status = body.published ? 'published' : (body.status || 'draft')
    if (!('publishedAt' in body)) patch.published_at = body.published ? new Date().toISOString() : null
  }

  let { data, error } = await getServiceClient()
    .from('app_releases')
    .update(patch)
    .eq('id', body.id)
    .select()
    .single()
  if (isMissingColumnError(error)) {
    const legacyPatch = { ...patch }
    delete legacyPatch.published_at
    delete legacyPatch.status
    delete legacyPatch.storage_provider
    delete legacyPatch.artifacts
    delete legacyPatch.failure_reason
    const legacy = await getServiceClient()
      .from('app_releases')
      .update(legacyPatch)
      .eq('id', body.id)
      .select()
      .single()
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error

  await logAdminEvent(request, 'admin_update_release', true, 'ok', { releaseId: body.id, fields: Object.keys(patch) })
  return { release: data }
}

async function createUpload(request: Request, payload: unknown) {
  const body = UploadSchema.parse(payload || {})
  const path = normalizeStoragePath(body.path)
  await ensureReleaseBucket()
  const bucket = getServiceClient().storage.from(RELEASE_BUCKET)
  const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: body.upsert })
  if (error) throw error
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl

  await logAdminEvent(request, 'admin_create_release_upload', true, 'ok', {
    bucket: RELEASE_BUCKET,
    path,
    upsert: body.upsert,
    contentType: body.contentType
  })
  return { bucket: RELEASE_BUCKET, path, signedUrl: data.signedUrl, token: data.token, publicUrl }
}

async function ensureReleaseBucket() {
  const supabase = getServiceClient()
  const { error } = await supabase.storage.getBucket(RELEASE_BUCKET)
  if (!error) return
  const { error: createError } = await supabase.storage.createBucket(RELEASE_BUCKET, { public: true })
  if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
    throw createError
  }
}

function enrichLicenseKey(key: Record<string, unknown>) {
  const devices = Array.isArray(key.license_devices) ? key.license_devices.map(maskDevice) : []
  const activeDevices = devices.filter((device) => device.status === 'active')
  const lastUsedAt = devices
    .map((device) => device.last_seen_at)
    .filter((value): value is string => typeof value === 'string' && Boolean(value))
    .sort()
    .at(-1) || null
  const expiresAt = typeof key.expires_at === 'string' ? key.expires_at : null
  const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false
  const maxDevices = typeof key.max_devices === 'number' ? key.max_devices : null
  const rawStatus = String(key.status || 'unused')
  const displayStatus = computeDisplayStatus(rawStatus, expired, activeDevices.length, maxDevices, expiresAt)
  return {
    ...key,
    masked_key: `${key.key_prefix}-****-****-****-${key.key_last_four}`,
    display_status: displayStatus,
    note: key.note || key.admin_note || null,
    internal_note: key.internal_note || key.admin_note || null,
    product_name: key.product_name || 'IELTS Writing',
    allow_device_deactivation: key.allow_device_deactivation !== false,
    active_device_count: activeDevices.length,
    last_used_at: lastUsedAt,
    license_devices: devices
  }
}

function computeDisplayStatus(status: string, expired: boolean, activeDeviceCount: number, maxDevices: number | null, expiresAt: string | null) {
  if (status === 'revoked' || status === 'suspended' || status === 'disabled') return status
  if (expired || status === 'expired') return 'expired'
  if (maxDevices && activeDeviceCount >= maxDevices) return 'device_full'
  if (expiresAt && new Date(expiresAt).getTime() - Date.now() <= EXPIRING_SOON_DAYS * 86400000) return 'expiring'
  if (status === 'unused') return 'unused'
  return 'active'
}

function maskDevice(device: Record<string, unknown>) {
  const hash = String(device.device_hash || '')
  return {
    ...device,
    device_hash: hash ? `${hash.slice(0, 8)}...${hash.slice(-4)}` : '',
    device_hash_masked: hash ? `${hash.slice(0, 8)}...${hash.slice(-4)}` : ''
  }
}

function maskEvent(event: Record<string, unknown>) {
  const metadata = typeof event.metadata === 'object' && event.metadata !== null ? event.metadata as Record<string, unknown> : {}
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase()
    if (lower.includes('password') || lower.includes('secret') || lower.includes('token') || lower.includes('authorization')) continue
    sanitized[key] = value
  }
  return { ...event, metadata: sanitized }
}

async function logAdminEvent(
  request: Request,
  eventType: string,
  success: boolean,
  reason: string,
  metadata: Record<string, unknown> = {},
  licenseId: string | null = null,
  deviceId: string | null = null
) {
  const ipHash = await sha256Hex(clientIp(request))
  const row = {
    license_id: licenseId,
    device_id: deviceId,
    event_type: eventType,
    success,
    reason,
    app_version: null,
    actor: 'admin',
    ip_hash: ipHash,
    metadata
  }
  const { error } = await getServiceClient().from('license_events').insert(row)
  if (isMissingColumnError(error)) {
    await getServiceClient().from('license_events').insert({
      license_id: licenseId,
      device_id: deviceId,
      event_type: eventType,
      success,
      reason,
      app_version: null,
      metadata
    })
  } else if (error) {
    throw error
  }
}

async function safeLogAdminEvent(request: Request, eventType: string, success: boolean, reason: string) {
  try {
    await logAdminEvent(request, eventType, success, reason)
  } catch {
    // Logging must not turn an auth failure into a server leak.
  }
}

function maskLicenseKey(value: string) {
  const normalized = normalizeLicenseKey(value)
  return `${normalized.slice(0, 4)}-****-****-****-${normalized.slice(-4)}`
}

function escapeSearchTerm(value: string) {
  return value.trim().replace(/[%,()]/g, '').slice(0, 120)
}

function normalizeStoragePath(value: string) {
  const path = value.replace(/^\/+/, '').replace(/\\/g, '/')
  if (path.includes('..') || path.includes('//')) {
    throw new Error('invalid_storage_path')
  }
  if (!/^(stable|beta)\//.test(path)) {
    throw new Error('release_path_must_start_with_channel')
  }
  if (!RELEASE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))) {
    throw new Error('unsupported_release_asset')
  }
  return path
}

function isAuthorized(request: Request, bodySecret?: string) {
  const expected = Deno.env.get('ADMIN_EDGE_SECRET') || ''
  const provided = request.headers.get('x-admin-secret') || bodySecret || ''
  if (!expected || expected.length < 16 || !provided) return false
  return timingSafeEqual(provided, expected)
}

async function verifyAdminPassword(password: string) {
  const hash = Deno.env.get('ADMIN_PASSWORD_SHA256')
  if (hash) {
    return timingSafeEqual(await sha256Hex(password), hash)
  }
  const expected = Deno.env.get('ADMIN_PASSWORD') || ''
  if (!expected || expected === 'change-this-before-production') return false
  return timingSafeEqual(password, expected)
}

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

function isMissingColumnError(error: unknown) {
  if (!error) return false
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message || error)
  return message.includes('column') && (message.includes('does not exist') || message.includes('Could not find'))
}

function isMissingTableError(error: unknown) {
  if (!error) return false
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message || error)
  return message.includes('relation') && message.includes('does not exist')
}
