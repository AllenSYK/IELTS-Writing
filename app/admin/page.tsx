'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  PauseCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Trash2,
  UploadCloud,
  X,
  XCircle
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminShell } from '@/components/admin/AdminShell'
import type { AdminSection } from '@/components/admin/AdminSidebar'
import { ConfirmDialog } from '@/components/interaction-system'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import {
  SupportFeedbackCategories,
  SupportFeedbackPriorityLabels,
  SupportFeedbackPriorities,
  SupportFeedbackStatusLabels,
  SupportFeedbackStatuses,
  getSupportAdminRecommendations,
  normalizeSupportFeedbackCategory,
  supportFeedbackDisplayId,
  type SupportFeedbackPriority,
  type SupportFeedbackStatus
} from '@/lib/support-feedback'

type DeviceRow = {
  id: string
  license_id?: string
  device_hash: string
  device_hash_masked?: string
  device_name: string | null
  operating_system: string | null
  app_version: string | null
  status: string
  first_seen_at: string | null
  last_seen_at: string | null
  deactivated_at?: string | null
  license?: {
    id: string
    masked_key: string
    key_last_four: string
    plan: string
    status: string
    note: string | null
    product_name: string
  } | null
}

type LicenseRow = {
  id: string
  key_prefix: string
  key_last_four: string
  masked_key?: string
  plan: string
  product_name?: string
  status: string
  display_status?: string
  duration_days: number | null
  starts_on_first_activation: boolean
  activated_at: string | null
  expires_at: string | null
  max_devices: number | null
  max_activations: number | null
  activation_count: number
  auto_update_enabled: boolean
  minimum_app_version: string | null
  maximum_app_version: string | null
  note: string | null
  internal_note: string | null
  allow_device_deactivation?: boolean
  created_at: string
  updated_at?: string
  last_used_at?: string | null
  active_device_count?: number
  license_devices?: DeviceRow[]
}

type GeneratedKey = {
  id?: string
  licenseKey: string
  masked: string
  created_at?: string
  expires_at?: string | null
  max_devices?: number | null
  status?: string
  plan?: string
  product_name?: string
}

type LicenseEventRow = {
  id: string
  license_id?: string | null
  device_id?: string | null
  event_type: string
  success: boolean
  reason: string | null
  app_version: string | null
  actor?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

type ReleaseArtifact = {
  kind?: string
  publicUrl?: string
  key?: string
  size?: number
  sha512?: string | null
}

type ReleaseRow = {
  id: string
  version: string
  channel: 'stable' | 'beta'
  platform: string
  architecture: string
  release_notes: string | null
  mandatory: boolean
  minimum_supported_version: string | null
  download_url: string | null
  metadata_url: string | null
  sha512: string | null
  file_size: number | null
  published: boolean
  status?: 'draft' | 'uploading' | 'failed' | 'published' | null
  storage_provider?: string | null
  artifacts?: ReleaseArtifact[] | null
  failure_reason?: string | null
  published_at: string | null
  created_at: string
  check_count?: number
  download_count?: number
}

type SupportFeedbackRow = {
  id: string
  category: string
  subject: string
  message: string
  contact_email: string | null
  app_version: string | null
  platform: string | null
  os_version: string | null
  diagnostics?: Record<string, unknown> | null
  status: SupportFeedbackStatus
  priority?: SupportFeedbackPriority | null
  admin_note: string | null
  created_at: string
  updated_at: string
}

type DashboardData = {
  stats: {
    total: number
    active: number
    unused: number
    expiringSoon: number
    expired: number
    suspended: number
    revoked: number
    activeDevices: number
    activationSuccess7d: number
    activationFailed7d: number
  }
  latestRelease: ReleaseRow | null
  update: {
    channel: 'stable' | 'beta'
    mode: 'manual_contact' | 'auto_download'
    modeLabel: string
    autoUpdateDownloadEnabled: boolean
  }
  settings: AdminSettings
}

type AdminSettings = {
  defaultDurationDays: number
  defaultMaxDevices: number
  allowDeviceDeactivation: boolean
  expiringReminderDays: number
  updateChannel: 'stable' | 'beta'
  autoUpdateDownloadEnabled: boolean
  latestVersion?: string | null
  minimumSupportedVersion?: string | null
  pageSize: number
  defaultSort: string
  dateFormat: string
  timezone: string
}

type ConfirmRequest = {
  title: string
  message: string
  confirmLabel: string
  tone?: 'danger' | 'default'
  run: () => Promise<void>
}

type BatchResult = {
  summary: string
  successCount: number
  failedCount: number
  failureIds: string[]
}

const defaultLicenseFilters = {
  search: '',
  status: 'all',
  activated: 'all',
  createdFrom: '',
  createdTo: '',
  expiresFrom: '',
  expiresTo: '',
  page: 1,
  pageSize: 25,
  sortBy: 'created_at',
  sortDirection: 'desc'
}

const defaultDeviceFilters = {
  search: '',
  platform: 'all',
  appVersion: 'all',
  status: 'all',
  lastSeenFrom: '',
  lastSeenTo: '',
  page: 1,
  pageSize: 25,
  sortBy: 'last_seen_at',
  sortDirection: 'desc'
}

const defaultLogFilters = {
  search: '',
  eventType: 'all',
  success: 'all',
  createdFrom: '',
  createdTo: '',
  page: 1,
  pageSize: 100,
  sortBy: 'created_at',
  sortDirection: 'desc'
}

const defaultFeedbackFilters = {
  search: '',
  status: 'all',
  category: 'all',
  priority: 'all',
  page: 1,
  pageSize: 25,
  sortBy: 'created_at',
  sortDirection: 'desc'
}

const defaultReleaseForm = {
  version: '1.0.3',
  channel: 'stable',
  platform: 'darwin',
  architecture: 'arm64',
  downloadUrl: '',
  metadataUrl: '',
  sha512: '',
  fileSize: '',
  minimumSupportedVersion: '',
  publishedAt: '',
  mandatory: false,
  published: false,
  releaseNotes: ''
}

const defaultSettings: AdminSettings = {
  defaultDurationDays: 30,
  defaultMaxDevices: 1,
  allowDeviceDeactivation: true,
  expiringReminderDays: 14,
  updateChannel: 'stable',
  autoUpdateDownloadEnabled: false,
  latestVersion: null,
  minimumSupportedVersion: null,
  pageSize: 25,
  defaultSort: 'created_at_desc',
  dateFormat: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

const licenseStatusConfig = {
  unused: { label: '未激活', tone: 'neutral', icon: CircleDashed },
  active: { label: '使用中', tone: 'good', icon: CheckCircle2 },
  expiring: { label: '即将到期', tone: 'warning', icon: Clock3 },
  expired: { label: '已过期', tone: 'bad', icon: AlertTriangle },
  suspended: { label: '已暂停', tone: 'warning', icon: PauseCircle },
  revoked: { label: '已撤销', tone: 'bad', icon: XCircle },
  disabled: { label: '已停用', tone: 'bad', icon: Ban },
  device_full: { label: '设备已满', tone: 'warning', icon: MonitorSmartphone }
} as const

const deviceStatusConfig = {
  active: { label: '正常', tone: 'good', icon: CheckCircle2 },
  deactivated: { label: '已解绑', tone: 'neutral', icon: XCircle },
  blocked: { label: '已阻止', tone: 'bad', icon: Ban }
} as const

const releaseStatusConfig = {
  draft: { label: '草稿', tone: 'neutral', icon: FileText },
  uploading: { label: '上传中', tone: 'warning', icon: UploadCloud },
  published: { label: '发布成功', tone: 'good', icon: CheckCircle2 },
  failed: { label: '发布失败', tone: 'bad', icon: AlertTriangle },
  cancelled: { label: '已取消发布', tone: 'neutral', icon: XCircle }
} as const

const feedbackStatusConfig: Record<SupportFeedbackStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  pending: { label: SupportFeedbackStatusLabels.pending, tone: 'warning', icon: Clock3 },
  reviewing: { label: SupportFeedbackStatusLabels.reviewing, tone: 'neutral', icon: RefreshCw },
  resolved: { label: SupportFeedbackStatusLabels.resolved, tone: 'good', icon: CheckCircle2 },
  closed: { label: SupportFeedbackStatusLabels.closed, tone: 'neutral', icon: XCircle }
}

const feedbackPriorityConfig: Record<SupportFeedbackPriority, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  low: { label: SupportFeedbackPriorityLabels.low, tone: 'neutral', icon: CircleDashed },
  normal: { label: SupportFeedbackPriorityLabels.normal, tone: 'neutral', icon: Clock3 },
  high: { label: SupportFeedbackPriorityLabels.high, tone: 'warning', icon: AlertTriangle },
  urgent: { label: SupportFeedbackPriorityLabels.urgent, tone: 'bad', icon: AlertTriangle }
}

const eventTypeLabels: Record<string, string> = {
  admin_generate_license: '生成激活码',
  activate: '激活成功',
  validate_success: '验证成功',
  validate_failure: '验证失败',
  deactivate: '用户解绑设备',
  admin_suspend_license: '暂停激活码',
  admin_active_license: '恢复激活码',
  admin_extend_license: '续期',
  admin_revoked_license: '撤销',
  admin_unbind_device: '解绑设备',
  admin_publish_release: '发布版本',
  admin_update_release: '修改版本',
  admin_update_license: '修改激活码',
  admin_update_feedback: '更新用户反馈',
  admin_update_settings: '修改系统设置',
  app_update_check: '检查更新',
  app_update_download: '下载更新记录'
}

function readStoredState<T>(key: string, fallback: T) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function storeState(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function isoFromDate(value: string, endOfDay = false) {
  if (!value) return null
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatDateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getSection(value: string | null): AdminSection {
  if (value === 'licenses' || value === 'devices' || value === 'releases' || value === 'feedback' || value === 'logs' || value === 'settings') return value
  return 'overview'
}

function getMaskedKey(key: LicenseRow) {
  return key.masked_key || `${key.key_prefix}-****-****-****-${key.key_last_four}`
}

function remainingDays(value?: string | null) {
  if (!value) return '长期有效'
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `剩余 ${days} 天`
}

function translateAdminError(message: unknown) {
  const value = String(message || '').trim()
  if (!value) return '请求失败，请稍后重试。'
  const lower = value.toLowerCase()
  if (lower.includes('unauthorized')) return '管理员登录已失效，请重新登录。'
  if (lower.includes('invalid_input')) return '提交内容格式不正确，请检查后重试。'
  if (lower.includes('invalid_version')) return '版本号格式不正确。'
  if (lower.includes('rate_limited')) return '操作过于频繁，请稍后重试。'
  if (lower.includes('failed') || lower.includes('error')) return '操作失败，请查看日志后重试。'
  return value
}

function renderStatus(
  value: string | undefined | null,
  configMap: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }>
) {
  const config = configMap[value || ''] || { label: value || '未知', tone: 'neutral', icon: CircleDashed }
  const Icon = config.icon
  return (
    <span className={`admin-status ${config.tone}`}>
      <Icon size={14} aria-hidden="true" />
      {config.label}
    </span>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeSection = getSection(searchParams.get('section'))

  const [authenticated, setAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [adminMessage, setAdminMessage] = useState('')
  const [actionLoading, setActionLoading] = useState('')
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [keys, setKeys] = useState<LicenseRow[]>([])
  const [totalKeys, setTotalKeys] = useState(0)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [totalDevices, setTotalDevices] = useState(0)
  const [releases, setReleases] = useState<ReleaseRow[]>([])
  const [feedback, setFeedback] = useState<SupportFeedbackRow[]>([])
  const [totalFeedback, setTotalFeedback] = useState(0)
  const [events, setEvents] = useState<LicenseEventRow[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [settingsForm, setSettingsForm] = useState<AdminSettings>(defaultSettings)

  const [licenseFilters, setLicenseFilters] = useState(() => readStoredState('ielts-admin-license-filters-v2', defaultLicenseFilters))
  const [deviceFilters, setDeviceFilters] = useState(() => readStoredState('ielts-admin-device-filters-v1', defaultDeviceFilters))
  const [logFilters, setLogFilters] = useState(() => readStoredState('ielts-admin-log-filters-v1', defaultLogFilters))
  const [feedbackFilters, setFeedbackFilters] = useState(() => readStoredState('ielts-admin-feedback-filters-v1', defaultFeedbackFilters))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)

  const [generateOpen, setGenerateOpen] = useState(false)
  const [generated, setGenerated] = useState<GeneratedKey[]>([])
  const [generatedCopied, setGeneratedCopied] = useState(false)
  const [createForm, setCreateForm] = useState({
    count: 1,
    durationDays: '30',
    expiryMode: 'first_activation',
    maxDevices: '1',
    maxActivations: '',
    plan: '标准版',
    note: '',
    allowDeviceDeactivation: true,
    effectiveImmediately: true,
    expiresAt: '',
    internalNote: ''
  })

  const [detailKey, setDetailKey] = useState<LicenseRow | null>(null)
  const [detailEvents, setDetailEvents] = useState<LicenseEventRow[]>([])
  const [eventDetail, setEventDetail] = useState<LicenseEventRow | null>(null)
  const [releaseForm, setReleaseForm] = useState(defaultReleaseForm)
  const [releaseArtifacts, setReleaseArtifacts] = useState<ReleaseRow | null>(null)
  const [feedbackDetail, setFeedbackDetail] = useState<SupportFeedbackRow | null>(null)
  const [feedbackNoteDraft, setFeedbackNoteDraft] = useState('')

  const selectedKeys = useMemo(() => keys.filter((key) => selectedIds.includes(key.id)), [keys, selectedIds])
  const keyPages = Math.max(1, Math.ceil(totalKeys / licenseFilters.pageSize))
  const devicePages = Math.max(1, Math.ceil(totalDevices / deviceFilters.pageSize))
  const eventPages = Math.max(1, Math.ceil(totalEvents / logFilters.pageSize))
  const feedbackPages = Math.max(1, Math.ceil(totalFeedback / feedbackFilters.pageSize))
  const loading = Boolean(actionLoading)

  useEffect(() => {
    storeState('ielts-admin-license-filters-v2', licenseFilters)
  }, [licenseFilters])

  useEffect(() => {
    storeState('ielts-admin-device-filters-v1', deviceFilters)
  }, [deviceFilters])

  useEffect(() => {
    storeState('ielts-admin-log-filters-v1', logFilters)
  }, [logFilters])

  useEffect(() => {
    storeState('ielts-admin-feedback-filters-v1', feedbackFilters)
  }, [feedbackFilters])

  useEffect(() => {
    void initialLoad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!authenticated || activeSection !== 'feedback') return
    void loadFeedback(feedbackFilters.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, authenticated])

  async function adminAction<T>(action: string, payload?: unknown, timeoutMs = 30000) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch('/api/admin/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: controller.signal
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) {
        setAuthenticated(false)
        throw new Error('管理员登录已失效，请重新登录。')
      }
      if (!response.ok) {
        throw new Error(translateAdminError(data.message || data.error || '请求失败，请稍后重试。'))
      }
      return data as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络后重试。')
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }

  async function initialLoad() {
    try {
      await Promise.all([loadDashboard(), loadKeys(licenseFilters.page), loadDevices(deviceFilters.page), loadReleases(), loadEvents(logFilters.page), loadSettings()])
      setAuthenticated(true)
    } catch {
      setAuthenticated(false)
    } finally {
      setCheckingSession(false)
    }
  }

  async function refreshAll() {
    await runAdminAction('刷新数据', async () => {
      const tasks: Array<Promise<void>> = [loadDashboard(), loadKeys(licenseFilters.page), loadDevices(deviceFilters.page), loadReleases(), loadEvents(logFilters.page)]
      if (activeSection === 'feedback') tasks.push(loadFeedback(feedbackFilters.page))
      await Promise.all(tasks)
    })
  }

  async function runAdminAction(label: string, action: () => Promise<void>) {
    setActionLoading(label)
    setAdminMessage(`正在${label}……`)
    try {
      await action()
      setAdminMessage(`${label}完成。`)
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : `${label}失败，请重试。`)
    } finally {
      setActionLoading('')
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault()
    setLoginMessage('正在登录……')
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setLoginMessage(data.error === 'rate_limited' ? '尝试次数过多，请稍后再试。' : '管理员密码不正确。')
        return
      }
      setAuthenticated(true)
      setPassword('')
      setLoginMessage('')
      await Promise.all([loadDashboard(), loadKeys(1), loadDevices(1), loadReleases(), loadEvents(1), loadSettings()])
    } catch {
      setLoginMessage('网络异常，请稍后重试。')
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    setAuthenticated(false)
    setKeys([])
    setDevices([])
    setReleases([])
    setFeedback([])
    setEvents([])
    setSelectedIds([])
  }

  function navigate(section: AdminSection) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', section)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  async function loadDashboard() {
    const data = await adminAction<DashboardData>('getDashboard')
    setDashboard(data)
    setSettingsForm((current) => ({ ...current, ...(data.settings || {}) }))
  }

  async function loadSettings() {
    const data = await adminAction<{ settings: AdminSettings }>('getAdminSettings')
    setSettingsForm((current) => ({ ...current, ...(data.settings || {}) }))
  }

  async function loadKeys(page = licenseFilters.page, nextFilters = licenseFilters) {
    const query = {
      ...nextFilters,
      page,
      createdFrom: isoFromDate(nextFilters.createdFrom),
      createdTo: isoFromDate(nextFilters.createdTo, true),
      expiresFrom: isoFromDate(nextFilters.expiresFrom),
      expiresTo: isoFromDate(nextFilters.expiresTo, true)
    }
    const data = await adminAction<{ keys: LicenseRow[]; total: number }>('listKeys', query)
    setKeys(data.keys || [])
    setTotalKeys(data.total || 0)
    setLicenseFilters({ ...nextFilters, page })
    setSelectedIds([])
  }

  async function loadDevices(page = deviceFilters.page, nextFilters = deviceFilters) {
    const query = {
      ...nextFilters,
      page,
      lastSeenFrom: isoFromDate(nextFilters.lastSeenFrom),
      lastSeenTo: isoFromDate(nextFilters.lastSeenTo, true)
    }
    const data = await adminAction<{ devices: DeviceRow[]; total: number }>('listDevices', query)
    setDevices(data.devices || [])
    setTotalDevices(data.total || 0)
    setDeviceFilters({ ...nextFilters, page })
  }

  async function loadReleases() {
    const data = await adminAction<{ releases: ReleaseRow[] }>('listReleases', { page: 1, pageSize: 100 })
    setReleases(data.releases || [])
  }

  async function loadEvents(page = logFilters.page, nextFilters = logFilters, licenseId?: string) {
    const data = await adminAction<{ events: LicenseEventRow[]; total: number }>('listEvents', {
      ...nextFilters,
      page,
      licenseId: licenseId || null,
      createdFrom: isoFromDate(nextFilters.createdFrom),
      createdTo: isoFromDate(nextFilters.createdTo, true)
    })
    setEvents(data.events || [])
    setTotalEvents(data.total || 0)
    setLogFilters({ ...nextFilters, page })
  }

  async function loadFeedback(page = feedbackFilters.page, nextFilters = feedbackFilters) {
    const data = await adminAction<{ feedback: SupportFeedbackRow[]; total: number }>('listFeedback', {
      ...nextFilters,
      page
    })
    setFeedback(data.feedback || [])
    setTotalFeedback(data.total || 0)
    setFeedbackFilters({ ...nextFilters, page })
  }

  async function loadDetailEvents(licenseId: string) {
    const data = await adminAction<{ events: LicenseEventRow[] }>('listEvents', { licenseId, page: 1, pageSize: 50 })
    setDetailEvents(data.events || [])
  }

  function applyLicenseFilters(patch: Partial<typeof defaultLicenseFilters>) {
    const next = { ...licenseFilters, ...patch, page: 1 }
    setLicenseFilters(next)
    void loadKeys(1, next)
  }

  function applyDeviceFilters(patch: Partial<typeof defaultDeviceFilters>) {
    const next = { ...deviceFilters, ...patch, page: 1 }
    setDeviceFilters(next)
    void loadDevices(1, next)
  }

  function applyLogFilters(patch: Partial<typeof defaultLogFilters>) {
    const next = { ...logFilters, ...patch, page: 1 }
    setLogFilters(next)
    void loadEvents(1, next)
  }

  function applyFeedbackFilters(patch: Partial<typeof defaultFeedbackFilters>) {
    const next = { ...feedbackFilters, ...patch, page: 1 }
    setFeedbackFilters(next)
    void loadFeedback(1, next)
  }

  function jumpToLicenses(patch: Partial<typeof defaultLicenseFilters>) {
    const next = { ...defaultLicenseFilters, ...licenseFilters, ...patch, page: 1 }
    setLicenseFilters(next)
    navigate('licenses')
    void loadKeys(1, next)
  }

  function jumpToDevices(patch: Partial<typeof defaultDeviceFilters> = {}) {
    const next = { ...defaultDeviceFilters, ...deviceFilters, ...patch, page: 1 }
    setDeviceFilters(next)
    navigate('devices')
    void loadDevices(1, next)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function requestConfirm(request: ConfirmRequest) {
    setConfirmRequest(request)
  }

  async function refreshAfterMutation() {
    await Promise.all([loadDashboard(), loadKeys(licenseFilters.page), loadDevices(deviceFilters.page)])
    if (detailKey) {
      const updated = keys.find((item) => item.id === detailKey.id)
      if (updated) setDetailKey(updated)
      await loadDetailEvents(detailKey.id)
    }
  }

  async function createKeys(event: FormEvent) {
    event.preventDefault()
    setGenerated([])
    setGeneratedCopied(false)
    await runAdminAction('生成激活码', async () => {
      const durationDays = createForm.expiryMode === 'fixed' ? null : Number(createForm.durationDays)
      const data = await adminAction<{ keys: GeneratedKey[] }>('createKeys', {
        count: createForm.count,
        note: createForm.note || null,
        productName: 'IELTS Writing',
        plan: createForm.plan,
        durationDays,
        maxDevices: createForm.maxDevices ? Number(createForm.maxDevices) : null,
        maxActivations: createForm.maxActivations ? Number(createForm.maxActivations) : null,
        startsOnFirstActivation: createForm.expiryMode === 'first_activation',
        expiresAt: createForm.expiryMode === 'fixed' && createForm.expiresAt ? new Date(createForm.expiresAt).toISOString() : null,
        allowDeviceDeactivation: createForm.allowDeviceDeactivation,
        autoUpdateEnabled: true,
        internalNote: createForm.internalNote || null
      })
      setGenerated(data.keys || [])
      await Promise.all([loadDashboard(), loadKeys(1)])
    })
  }

  function closeGenerateModal() {
    if (generated.length > 0 && !generatedCopied) {
      const ok = window.confirm('完整激活码只显示一次。尚未复制全部激活码，确定关闭吗？')
      if (!ok) return
    }
    setGenerateOpen(false)
    setGenerated([])
    setGeneratedCopied(false)
  }

  async function copyGeneratedAll() {
    await navigator.clipboard.writeText(generated.map((item) => item.licenseKey).join('\n'))
    setGeneratedCopied(true)
    setAdminMessage('已复制全部完整激活码。')
  }

  async function copyText(value: string, label = '已复制。') {
    await navigator.clipboard.writeText(value)
    setAdminMessage(label)
  }

  function exportGeneratedCsv() {
    const header = ['license_key', 'masked_key', 'created_at', 'expires_at', 'max_devices', 'status', 'plan']
    const lines = generated.map((item) =>
      [item.licenseKey, item.masked, item.created_at, item.expires_at, item.max_devices || '', item.status, item.plan].map(csvEscape).join(',')
    )
    downloadText(`generated-license-keys-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  function exportGeneratedTxt() {
    downloadText(`generated-license-keys-${new Date().toISOString().slice(0, 10)}.txt`, generated.map((item) => item.licenseKey).join('\n'), 'text/plain;charset=utf-8')
  }

  function exportCsv(rows = keys) {
    const header = ['激活码', '状态', '备注', '套餐', '创建时间', '首次激活时间', '到期时间', '已用设备数', '最大设备数', '最近使用时间']
    const lines = rows.map((key) =>
      [
        getMaskedKey(key),
        licenseStatusConfig[(key.display_status || key.status) as keyof typeof licenseStatusConfig]?.label || key.status,
        key.note,
        key.plan,
        key.created_at,
        key.activated_at,
        key.expires_at,
        key.active_device_count || 0,
        key.max_devices || '',
        key.last_used_at || ''
      ].map(csvEscape).join(',')
    )
    downloadText(`license-keys-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  function exportLogs() {
    const header = ['时间', '操作类型', '操作结果', '操作人', '简要说明', '应用版本']
    const lines = events.map((event) =>
      [
        event.created_at,
        eventTypeLabels[event.event_type] || event.event_type,
        event.success ? '成功' : '失败',
        event.actor || '系统',
        event.reason || '',
        event.app_version || ''
      ].map(csvEscape).join(',')
    )
    downloadText(`admin-logs-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8')
  }

  function updateStatus(key: LicenseRow, status: string) {
    const label = licenseStatusConfig[status as keyof typeof licenseStatusConfig]?.label || status
    requestConfirm({
      title: `${label}这个激活码？`,
      message: `${getMaskedKey(key)} 将在服务器端更新状态。危险操作完成后会记录日志。`,
      confirmLabel: status === 'revoked' ? '确认撤销' : '确认',
      tone: status === 'revoked' || status === 'suspended' ? 'danger' : 'default',
      run: () => runAdminAction(label, async () => {
        await adminAction('updateStatus', { id: key.id, status })
        await refreshAfterMutation()
      })
    })
  }

  async function updateKeyField(key: LicenseRow, patch: Record<string, unknown>, label: string) {
    await runAdminAction(label, async () => {
      await adminAction('updateKey', { id: key.id, ...patch })
      await refreshAfterMutation()
    })
  }

  function promptExpiry(key: LicenseRow) {
    const value = window.prompt('请输入新的到期时间。留空表示长期有效。', key.expires_at || new Date(Date.now() + 30 * 86400000).toISOString())
    if (value === null) return
    void updateKeyField(key, { expiresAt: value.trim() ? new Date(value).toISOString() : null }, '修改到期时间')
  }

  function promptMaxDevices(key: LicenseRow) {
    const value = window.prompt('请输入最大设备数。留空表示不限制。', key.max_devices ? String(key.max_devices) : '')
    if (value === null) return
    void updateKeyField(key, { maxDevices: value.trim() ? Number(value) : null }, '修改设备数量')
  }

  function promptNote(key: LicenseRow) {
    const value = window.prompt('请输入备注。', key.note || '')
    if (value === null) return
    void updateKeyField(key, { note: value || null }, '修改备注')
  }

  function promptPlan(key: LicenseRow) {
    const value = window.prompt('请输入套餐名称。', key.plan || '')
    if (value === null || !value.trim()) return
    void updateKeyField(key, { plan: value.trim() }, '修改套餐')
  }

  function extendLicense(key: LicenseRow) {
    const value = window.prompt('续期多少天？', '30')
    if (!value) return
    void runAdminAction('续期', async () => {
      await adminAction('extendKeys', { ids: [key.id], days: Number(value) })
      await refreshAfterMutation()
    })
  }

  function resetDevices(key: LicenseRow) {
    requestConfirm({
      title: '解绑全部设备？',
      message: '解绑后，当前设备将失去授权；激活码可用于绑定其他设备。',
      confirmLabel: '确认解绑',
      tone: 'danger',
      run: () => runAdminAction('解绑设备', async () => {
        await adminAction('resetDevices', { id: key.id })
        await refreshAfterMutation()
      })
    })
  }

  function deactivateDevice(licenseId: string, device: DeviceRow) {
    requestConfirm({
      title: '解绑设备？',
      message: '解绑后，该设备将失去当前授权，但激活码可以用于绑定其他设备。',
      confirmLabel: '确认解绑',
      tone: 'danger',
      run: () => runAdminAction('解绑设备', async () => {
        await adminAction('deactivateDevice', { licenseId, deviceId: device.id })
        await refreshAfterMutation()
      })
    })
  }

  function openLicenseDetail(key: LicenseRow) {
    setDetailKey(key)
    void loadDetailEvents(key.id)
  }

  async function runBatchStatus(status: string) {
    if (selectedIds.length === 0) {
      setAdminMessage('请先勾选激活码。')
      return
    }
    const label = `批量${licenseStatusConfig[status as keyof typeof licenseStatusConfig]?.label || status}`
    requestConfirm({
      title: label,
      message: `已选中 ${selectedIds.length} 个激活码。此操作会真实修改服务器数据。`,
      confirmLabel: '确认执行',
      tone: status === 'revoked' || status === 'suspended' ? 'danger' : 'default',
      run: () => runAdminAction(label, async () => {
        const data = await adminAction<{ count: number }>('bulkStatus', { ids: selectedIds, status })
        const successCount = data.count || 0
        const failedCount = Math.max(0, selectedIds.length - successCount)
        setBatchResult({ summary: label, successCount, failedCount, failureIds: failedCount ? selectedIds : [] })
        await refreshAfterMutation()
      })
    })
  }

  function runBatchExtend() {
    if (selectedIds.length === 0) {
      setAdminMessage('请先勾选激活码。')
      return
    }
    const value = window.prompt('批量续期多少天？', '30')
    if (!value) return
    requestConfirm({
      title: '批量续期',
      message: `已选中 ${selectedIds.length} 个激活码，将统一续期 ${value} 天。`,
      confirmLabel: '确认续期',
      run: () => runAdminAction('批量续期', async () => {
        const data = await adminAction<{ count: number }>('extendKeys', { ids: selectedIds, days: Number(value) })
        const successCount = data.count || 0
        const failedCount = Math.max(0, selectedIds.length - successCount)
        setBatchResult({ summary: '批量续期', successCount, failedCount, failureIds: failedCount ? selectedIds : [] })
        await refreshAfterMutation()
      })
    })
  }

  function runBatchDevices() {
    if (selectedIds.length === 0) {
      setAdminMessage('请先勾选激活码。')
      return
    }
    const value = window.prompt('批量修改最大设备数。留空表示不限制。', '1')
    if (value === null) return
    requestConfirm({
      title: '批量修改设备数',
      message: `已选中 ${selectedIds.length} 个激活码，将统一修改最大设备数。`,
      confirmLabel: '确认修改',
      run: () => runAdminAction('批量修改设备数', async () => {
        let successCount = 0
        const failureIds: string[] = []
        for (const id of selectedIds) {
          try {
            await adminAction('updateKey', { id, maxDevices: value.trim() ? Number(value) : null })
            successCount += 1
          } catch {
            failureIds.push(id)
          }
        }
        setBatchResult({ summary: '批量修改设备数', successCount, failedCount: failureIds.length, failureIds })
        await refreshAfterMutation()
      })
    })
  }

  function exportSelected() {
    exportCsv(selectedKeys.length ? selectedKeys : keys)
    setBatchResult({ summary: '批量导出', successCount: selectedKeys.length || keys.length, failedCount: 0, failureIds: [] })
  }

  async function publishRelease(event: FormEvent) {
    event.preventDefault()
    await runAdminAction('保存版本', async () => {
      await adminAction('publishRelease', {
        version: releaseForm.version,
        channel: releaseForm.channel,
        platform: releaseForm.platform,
        architecture: releaseForm.architecture,
        downloadUrl: releaseForm.downloadUrl || null,
        metadataUrl: releaseForm.metadataUrl || null,
        sha512: releaseForm.sha512 || null,
        fileSize: releaseForm.fileSize ? Number(releaseForm.fileSize) : null,
        minimumSupportedVersion: releaseForm.minimumSupportedVersion || null,
        publishedAt: releaseForm.publishedAt ? new Date(releaseForm.publishedAt).toISOString() : null,
        mandatory: releaseForm.mandatory,
        published: releaseForm.published,
        releaseNotes: releaseForm.releaseNotes || null
      })
      await Promise.all([loadDashboard(), loadReleases()])
    })
  }

  async function updateRelease(release: ReleaseRow, patch: Record<string, unknown>, label: string) {
    await runAdminAction(label, async () => {
      await adminAction('updateRelease', { id: release.id, ...patch })
      await Promise.all([loadDashboard(), loadReleases()])
    })
  }

  function editRelease(release: ReleaseRow) {
    setReleaseForm({
      version: release.version,
      channel: release.channel,
      platform: release.platform,
      architecture: release.architecture,
      downloadUrl: release.download_url || '',
      metadataUrl: release.metadata_url || '',
      sha512: release.sha512 || '',
      fileSize: release.file_size ? String(release.file_size) : '',
      minimumSupportedVersion: release.minimum_supported_version || '',
      publishedAt: formatDateInput(release.published_at),
      mandatory: release.mandatory,
      published: release.published,
      releaseNotes: release.release_notes || ''
    })
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault()
    await runAdminAction('保存系统设置', async () => {
      const data = await adminAction<{ settings: AdminSettings }>('saveAdminSettings', settingsForm)
      setSettingsForm(data.settings)
      await loadDashboard()
    })
  }

  async function updateFeedback(item: SupportFeedbackRow, patch: { status?: SupportFeedbackRow['status']; priority?: SupportFeedbackPriority; adminNote?: string | null }, label: string) {
    await runAdminAction(label, async () => {
      await adminAction('updateFeedback', { id: item.id, ...patch })
      await loadFeedback(feedbackFilters.page)
      setFeedbackDetail((current) => current && current.id === item.id ? { ...current, ...('status' in patch && patch.status ? { status: patch.status } : {}), ...('priority' in patch && patch.priority ? { priority: patch.priority } : {}), ...('adminNote' in patch ? { admin_note: patch.adminNote || null } : {}) } : current)
    })
  }

  function editFeedbackNote(item: SupportFeedbackRow) {
    setFeedbackDetail(item)
    setFeedbackNoteDraft(item.admin_note || '')
  }

  function openFeedbackDetail(item: SupportFeedbackRow) {
    setFeedbackDetail(item)
    setFeedbackNoteDraft(item.admin_note || '')
  }

  async function copyAdminText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setAdminMessage(`${label}已复制。`)
    } catch {
      setAdminMessage(`${label}复制失败，请手动复制。`)
    }
  }

  function maskedDiagnostics(item: SupportFeedbackRow) {
    const diagnostics = item.diagnostics || {}
    return [
      `反馈编号: ${supportFeedbackDisplayId(item.id)}`,
      `问题类型: ${normalizeSupportFeedbackCategory(item.category)}`,
      `应用版本: ${item.app_version || '未知版本'}`,
      `平台: ${item.platform || '未知平台'}`,
      `系统版本: ${item.os_version || '未知系统'}`,
      `最近错误码: ${String(diagnostics.recentErrorCode || '无')}`
    ].join('\n')
  }

  async function openUserApp() {
    if (window.desktopApp?.openUserHome) {
      const result = await window.desktopApp.openUserHome()
      setAdminMessage(result.message || '已打开用户端。')
      return
    }
    window.open('/', '_blank', 'noopener,noreferrer')
    setAdminMessage('已在浏览器中打开用户首页。')
  }

  if (checkingSession) {
    return (
      <main className="admin-login-page" data-main-content tabIndex={-1}>
        <section className="admin-login-card">
          <Loader2 className="admin-spin" size={20} aria-hidden="true" />
          <p>正在检查管理员登录状态……</p>
        </section>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="admin-login-page" data-main-content tabIndex={-1}>
        <section className="admin-login-card">
          <span className="admin-login-icon"><Shield size={24} aria-hidden="true" /></span>
          <p className="admin-eyebrow">管理员登录</p>
          <h1>IELTS Writing 管理后台</h1>
          <form className="admin-form" onSubmit={login}>
            <label className="admin-field">
              <span>管理员密码</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
            <button className="admin-primary-button" type="submit">
              <Shield size={16} aria-hidden="true" />
              登录
            </button>
            <p className="admin-help">{loginMessage || '密码只发送到服务端校验，不会写入浏览器存储。'}</p>
          </form>
        </section>
      </main>
    )
  }

  return (
    <AdminShell
      active={activeSection}
      sidebarOpen={sidebarOpen}
      message={adminMessage}
      loading={loading}
      version={process.env.NEXT_PUBLIC_APP_VERSION || '1.0.3'}
      onMenu={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      onNavigate={navigate}
      onRefresh={() => void refreshAll()}
      onOpenUserApp={() => void openUserApp()}
      onLogout={() => void logout()}
    >
      {activeSection === 'overview' ? renderOverview() : null}
      {activeSection === 'licenses' ? renderLicenses() : null}
      {activeSection === 'devices' ? renderDevices() : null}
      {activeSection === 'releases' ? renderReleases() : null}
      {activeSection === 'feedback' ? renderFeedback() : null}
      {activeSection === 'logs' ? renderLogs() : null}
      {activeSection === 'settings' ? renderSettings() : null}

      {generateOpen ? renderGenerateDialog() : null}
      {detailKey ? renderLicenseDrawer(detailKey) : null}
      {eventDetail ? renderEventDialog(eventDetail) : null}
      {releaseArtifacts ? renderReleaseArtifacts(releaseArtifacts) : null}
      {feedbackDetail ? renderFeedbackDetailDialog(feedbackDetail) : null}

      <ConfirmDialog
        open={Boolean(confirmRequest)}
        title={confirmRequest?.title || ''}
        message={confirmRequest?.message || ''}
        confirmLabel={confirmRequest?.confirmLabel || '确认'}
        cancelLabel="取消"
        tone={confirmRequest?.tone === 'danger' ? 'danger' : 'default'}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => {
          const request = confirmRequest
          setConfirmRequest(null)
          if (request) void request.run()
        }}
      />
    </AdminShell>
  )

  function renderOverview() {
    const stats = dashboard?.stats
    const latestRelease = dashboard?.latestRelease
    const cards = [
      { label: '激活码总数', value: stats?.total ?? 0, hint: '全部已创建激活码', action: () => jumpToLicenses({ status: 'all' }) },
      { label: '有效激活码', value: stats?.active ?? 0, hint: '当前可正常验证', action: () => jumpToLicenses({ status: 'active' }) },
      { label: '未激活', value: stats?.unused ?? 0, hint: '尚未绑定设备', action: () => jumpToLicenses({ status: 'unused', activated: 'no' }) },
      { label: '即将到期', value: stats?.expiringSoon ?? 0, hint: `${settingsForm.expiringReminderDays || 14} 天内到期`, action: () => jumpToLicenses({ status: 'expiring' }) },
      { label: '已过期', value: stats?.expired ?? 0, hint: '需要续期或撤销', action: () => jumpToLicenses({ status: 'expired' }) },
      { label: '已暂停', value: stats?.suspended ?? 0, hint: '暂时不可使用', action: () => jumpToLicenses({ status: 'suspended' }) },
      { label: '已撤销', value: stats?.revoked ?? 0, hint: '危险操作记录', action: () => jumpToLicenses({ status: 'revoked' }) },
      { label: '活跃设备', value: stats?.activeDevices ?? 0, hint: '当前有效绑定设备', action: () => jumpToDevices({ status: 'active' }) }
    ]

    return (
      <section className="admin-section">
        <AdminPageHeader
          eyebrow="总览"
          title="日常管理看板"
          description="这里显示授权、设备、版本和最近激活结果的真实数据。"
          actions={
            <>
              <button className="admin-primary-button" type="button" onClick={() => setGenerateOpen(true)}><Plus size={16} />生成激活码</button>
              <button className="admin-secondary-button" type="button" onClick={() => void openUserApp()}>打开普通用户端</button>
            </>
          }
        />

        <div className="admin-stat-grid">
          {cards.map((card) => (
            <button className="admin-stat-card" type="button" key={card.label} onClick={card.action}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.hint}</small>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="admin-overview-grid">
          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">最近 7 天</p>
                <h2>激活结果</h2>
              </div>
              <button className="admin-text-button" type="button" onClick={() => navigate('logs')}>查看最近日志</button>
            </div>
            <div className="admin-split-metric">
              <div><span>激活成功</span><strong>{stats?.activationSuccess7d ?? 0}</strong></div>
              <div><span>激活失败</span><strong>{stats?.activationFailed7d ?? 0}</strong></div>
            </div>
          </article>

          <article className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <p className="admin-eyebrow">版本</p>
                <h2>当前线上版本</h2>
              </div>
              <button className="admin-text-button" type="button" onClick={() => navigate('releases')}>发布新版本</button>
            </div>
            <dl className="admin-definition-list">
              <div><dt>最新版本</dt><dd>{latestRelease?.version || '暂无'}</dd></div>
              <div><dt>发布时间</dt><dd>{formatDate(latestRelease?.published_at || latestRelease?.created_at)}</dd></div>
              <div><dt>更新通道</dt><dd>{dashboard?.update.channel || 'stable'}</dd></div>
              <div><dt>当前更新方式</dt><dd>{dashboard?.update.modeLabel || '检测到新版本后，提示用户联系开发者更新'}</dd></div>
            </dl>
          </article>
        </div>

        <div className="admin-quick-actions">
          <button type="button" onClick={() => setGenerateOpen(true)}>生成激活码</button>
          <button type="button" onClick={() => jumpToLicenses({ status: 'expiring' })}>查看即将到期</button>
          <button type="button" onClick={() => navigate('logs')}>查看异常激活</button>
          <button type="button" onClick={() => jumpToDevices({ status: 'active' })}>查看活跃设备</button>
          <button type="button" onClick={() => navigate('releases')}>发布新版本</button>
        </div>
      </section>
    )
  }

  function renderLicenses() {
    return (
      <section className="admin-section">
        <AdminPageHeader
          eyebrow="激活码管理"
          title="生成、筛选和维护激活码"
          description="完整激活码只在生成成功后显示一次；列表中始终使用脱敏格式。"
          actions={
            <>
              <button className="admin-primary-button" type="button" onClick={() => setGenerateOpen(true)}><Plus size={16} />生成激活码</button>
              <button className="admin-secondary-button" type="button" onClick={() => setGenerateOpen(true)}>批量生成</button>
              <button className="admin-secondary-button" type="button" onClick={exportSelected}><Download size={16} />导出CSV</button>
              <button className="admin-icon-button" type="button" aria-label="刷新" onClick={() => void loadKeys(licenseFilters.page)}><RefreshCw size={17} /></button>
            </>
          }
        />

        <div className="admin-panel">
          <div className="admin-filter-grid license">
            <label className="admin-field"><span>搜索激活码尾号、备注或套餐</span><input value={licenseFilters.search} onChange={(event) => setLicenseFilters({ ...licenseFilters, search: event.target.value })} placeholder="例如 7A3F / 标准版" /></label>
            <label className="admin-field"><span>状态筛选</span><select value={licenseFilters.status} onChange={(event) => setLicenseFilters({ ...licenseFilters, status: event.target.value })}>{['all', 'unused', 'active', 'expiring', 'expired', 'suspended', 'revoked', 'device_full'].map((status) => <option key={status} value={status}>{status === 'all' ? '全部状态' : licenseStatusConfig[status as keyof typeof licenseStatusConfig]?.label}</option>)}</select></label>
            <label className="admin-field"><span>是否已激活</span><select value={licenseFilters.activated} onChange={(event) => setLicenseFilters({ ...licenseFilters, activated: event.target.value })}><option value="all">不限</option><option value="yes">已激活</option><option value="no">未激活</option></select></label>
            <label className="admin-field"><span>创建开始</span><input type="date" value={licenseFilters.createdFrom} onChange={(event) => setLicenseFilters({ ...licenseFilters, createdFrom: event.target.value })} /></label>
            <label className="admin-field"><span>创建结束</span><input type="date" value={licenseFilters.createdTo} onChange={(event) => setLicenseFilters({ ...licenseFilters, createdTo: event.target.value })} /></label>
            <label className="admin-field"><span>到期开始</span><input type="date" value={licenseFilters.expiresFrom} onChange={(event) => setLicenseFilters({ ...licenseFilters, expiresFrom: event.target.value })} /></label>
            <label className="admin-field"><span>到期结束</span><input type="date" value={licenseFilters.expiresTo} onChange={(event) => setLicenseFilters({ ...licenseFilters, expiresTo: event.target.value })} /></label>
            <label className="admin-field"><span>排序</span><select value={licenseFilters.sortBy} onChange={(event) => setLicenseFilters({ ...licenseFilters, sortBy: event.target.value })}><option value="created_at">创建时间</option><option value="expires_at">到期时间</option><option value="activated_at">首次激活时间</option><option value="status">状态</option><option value="plan">套餐</option></select></label>
            <label className="admin-field"><span>顺序</span><select value={licenseFilters.sortDirection} onChange={(event) => setLicenseFilters({ ...licenseFilters, sortDirection: event.target.value })}><option value="desc">从新到旧</option><option value="asc">从旧到新</option></select></label>
          </div>

          <div className="admin-toolbar">
            <div className="admin-chip-row">
              {renderLicenseFilterChips()}
            </div>
            <div className="admin-row-actions">
              <button className="admin-secondary-button" type="button" onClick={() => applyLicenseFilters({})}><Search size={16} />应用筛选</button>
              <button className="admin-text-button" type="button" onClick={() => { setLicenseFilters(defaultLicenseFilters); void loadKeys(1, defaultLicenseFilters) }}>重置筛选</button>
            </div>
          </div>

          {selectedIds.length > 0 || batchResult ? (
            <div className="admin-batch-bar">
              <span>已选中 {selectedIds.length} 个激活码</span>
              <button type="button" onClick={() => void runBatchStatus('suspended')}>批量暂停</button>
              <button type="button" onClick={() => void runBatchStatus('active')}>批量恢复</button>
              <button type="button" onClick={runBatchExtend}>批量续期</button>
              <button type="button" onClick={runBatchDevices}>批量修改设备数</button>
              <button type="button" onClick={exportSelected}>批量导出</button>
              <button className="danger" type="button" onClick={() => void runBatchStatus('revoked')}>批量撤销</button>
              {batchResult ? <strong>{batchResult.summary}：成功 {batchResult.successCount}，失败 {batchResult.failedCount}</strong> : null}
              {batchResult?.failureIds.length ? <button type="button" onClick={() => setSelectedIds(batchResult.failureIds)}>重试失败项</button> : null}
            </div>
          ) : null}

          <div className="admin-table-wrap">
            <table className="admin-table license-table">
              <thead>
                <tr>
                  <th><input aria-label="全选当前页" type="checkbox" checked={keys.length > 0 && selectedIds.length === keys.length} onChange={(event) => setSelectedIds(event.target.checked ? keys.map((key) => key.id) : [])} /></th>
                  <th>激活码</th>
                  <th>状态</th>
                  <th>备注</th>
                  <th>套餐</th>
                  <th>创建时间</th>
                  <th>首次激活时间</th>
                  <th>到期时间</th>
                  <th>设备</th>
                  <th>最近使用</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.length ? keys.map((key) => (
                  <tr key={key.id}>
                    <td><input aria-label={`选择 ${getMaskedKey(key)}`} type="checkbox" checked={selectedIds.includes(key.id)} onChange={() => toggleSelected(key.id)} /></td>
                    <td><button className="admin-code-button" type="button" onClick={() => openLicenseDetail(key)}>{getMaskedKey(key)}</button></td>
                    <td>{renderStatus(key.display_status || key.status, licenseStatusConfig)}</td>
                    <td>{key.note || '暂无备注'}{key.internal_note ? <small>内部标签：{key.internal_note}</small> : null}</td>
                    <td>{key.product_name || 'IELTS Writing'}<small>{key.plan}</small></td>
                    <td>{formatDate(key.created_at)}</td>
                    <td>{formatDate(key.activated_at)}</td>
                    <td>{formatDate(key.expires_at)}<small>{remainingDays(key.expires_at)}</small></td>
                    <td>{key.active_device_count || 0}/{key.max_devices || '不限'}</td>
                    <td>{formatDate(key.last_used_at)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button type="button" onClick={() => openLicenseDetail(key)} title="查看详情"><Eye size={14} /></button>
                        <button type="button" onClick={() => updateStatus(key, 'active')} title="恢复"><CheckCircle2 size={14} /></button>
                        <button type="button" onClick={() => updateStatus(key, 'suspended')} title="暂停"><PauseCircle size={14} /></button>
                        <button className="danger" type="button" onClick={() => updateStatus(key, 'revoked')} title="撤销"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={11}><EmptyState title="没有找到激活码" action="生成激活码" onAction={() => setGenerateOpen(true)} /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination total={totalKeys} page={licenseFilters.page} pages={keyPages} onPage={(page) => void loadKeys(page)} />
        </div>
      </section>
    )
  }

  function renderLicenseFilterChips() {
    const chips: Array<{ label: string; reset: () => void }> = []
    if (licenseFilters.search) chips.push({ label: `搜索：${licenseFilters.search}`, reset: () => applyLicenseFilters({ search: '' }) })
    if (licenseFilters.status !== 'all') chips.push({ label: `状态：${licenseStatusConfig[licenseFilters.status as keyof typeof licenseStatusConfig]?.label || licenseFilters.status}`, reset: () => applyLicenseFilters({ status: 'all' }) })
    if (licenseFilters.activated !== 'all') chips.push({ label: licenseFilters.activated === 'yes' ? '已激活' : '未激活', reset: () => applyLicenseFilters({ activated: 'all' }) })
    if (licenseFilters.createdFrom) chips.push({ label: `创建开始：${licenseFilters.createdFrom}`, reset: () => applyLicenseFilters({ createdFrom: '' }) })
    if (licenseFilters.createdTo) chips.push({ label: `创建结束：${licenseFilters.createdTo}`, reset: () => applyLicenseFilters({ createdTo: '' }) })
    if (licenseFilters.expiresFrom) chips.push({ label: `到期开始：${licenseFilters.expiresFrom}`, reset: () => applyLicenseFilters({ expiresFrom: '' }) })
    if (licenseFilters.expiresTo) chips.push({ label: `到期结束：${licenseFilters.expiresTo}`, reset: () => applyLicenseFilters({ expiresTo: '' }) })
    return chips.length ? chips.map((chip) => <button className="admin-chip" key={chip.label} type="button" onClick={chip.reset}>{chip.label}<X size={13} /></button>) : <span className="admin-help">当前未使用额外筛选</span>
  }

  function renderDevices() {
    return (
      <section className="admin-section">
        <AdminPageHeader eyebrow="设备管理" title="查看和解绑授权设备" description="设备 ID 已脱敏。解绑不会删除激活码，只会解除当前设备授权。" />
        <div className="admin-panel">
          <div className="admin-filter-grid devices">
            <label className="admin-field"><span>搜索设备</span><input value={deviceFilters.search} onChange={(event) => setDeviceFilters({ ...deviceFilters, search: event.target.value })} placeholder="设备名、平台、版本或脱敏 ID" /></label>
            <label className="admin-field"><span>平台</span><input value={deviceFilters.platform === 'all' ? '' : deviceFilters.platform} onChange={(event) => setDeviceFilters({ ...deviceFilters, platform: event.target.value || 'all' })} placeholder="留空表示全部，例如 darwin" /></label>
            <label className="admin-field"><span>应用版本</span><input value={deviceFilters.appVersion === 'all' ? '' : deviceFilters.appVersion} onChange={(event) => setDeviceFilters({ ...deviceFilters, appVersion: event.target.value || 'all' })} placeholder="例如 1.0.3" /></label>
            <label className="admin-field"><span>状态</span><select value={deviceFilters.status} onChange={(event) => setDeviceFilters({ ...deviceFilters, status: event.target.value })}><option value="all">全部</option><option value="active">正常</option><option value="deactivated">已解绑</option><option value="blocked">已阻止</option></select></label>
            <label className="admin-field"><span>最近活跃开始</span><input type="date" value={deviceFilters.lastSeenFrom} onChange={(event) => setDeviceFilters({ ...deviceFilters, lastSeenFrom: event.target.value })} /></label>
            <label className="admin-field"><span>最近活跃结束</span><input type="date" value={deviceFilters.lastSeenTo} onChange={(event) => setDeviceFilters({ ...deviceFilters, lastSeenTo: event.target.value })} /></label>
          </div>
          <div className="admin-toolbar">
            <button className="admin-secondary-button" type="button" onClick={() => applyDeviceFilters({})}><Search size={16} />应用筛选</button>
            <button className="admin-text-button" type="button" onClick={() => { setDeviceFilters(defaultDeviceFilters); void loadDevices(1, defaultDeviceFilters) }}>重置筛选</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table device-table">
              <thead><tr><th>设备ID</th><th>关联激活码</th><th>平台</th><th>系统版本</th><th>应用版本</th><th>首次激活</th><th>最近验证</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {devices.length ? devices.map((device) => (
                  <tr key={device.id}>
                    <td><strong>{device.device_hash_masked || device.device_hash || '暂无'}</strong><small>{device.device_name || '未记录设备名'}</small></td>
                    <td><button className="admin-code-button" type="button" onClick={() => { jumpToLicenses({ search: device.license?.key_last_four || '' }) }}>{device.license?.masked_key || '未关联'}</button></td>
                    <td>{device.operating_system || '未知'}</td>
                    <td>{device.operating_system || '未知'}</td>
                    <td>{device.app_version || '暂无'}</td>
                    <td>{formatDate(device.first_seen_at)}</td>
                    <td>{formatDate(device.last_seen_at)}</td>
                    <td>{renderStatus(device.status, deviceStatusConfig)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button type="button" onClick={() => { applyLogFilters({ search: device.device_hash_masked || device.device_hash }); navigate('logs') }}>查看日志</button>
                        {device.status === 'active' && device.license ? <button className="danger" type="button" onClick={() => deactivateDevice(device.license?.id || device.license_id || '', device)}>解绑设备</button> : null}
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={9}><EmptyState title="没有找到设备" action="查看全部设备" onAction={() => { setDeviceFilters(defaultDeviceFilters); void loadDevices(1, defaultDeviceFilters) }} /></td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination total={totalDevices} page={deviceFilters.page} pages={devicePages} onPage={(page) => void loadDevices(page)} />
        </div>
      </section>
    )
  }

  function renderReleases() {
    return (
      <section className="admin-section">
        <AdminPageHeader
          eyebrow="版本发布"
          title="发布和检查客户端版本"
          description="当前更新方式：检测到新版本后提示用户联系开发者。不会让用户误以为已经自动下载安装。"
          actions={<button className="admin-secondary-button" type="button" onClick={loadReleases}><RefreshCw size={16} />刷新版本</button>}
        />
        <div className="admin-release-grid">
          <form className="admin-panel admin-form" onSubmit={publishRelease}>
            <div className="admin-panel-heading"><h2>新建或编辑版本</h2><button className="admin-text-button" type="button" onClick={() => setReleaseForm(defaultReleaseForm)}>清空表单</button></div>
            <label className="admin-field"><span>版本号</span><input value={releaseForm.version} onChange={(event) => setReleaseForm({ ...releaseForm, version: event.target.value })} /></label>
            <label className="admin-field"><span>更新通道</span><select value={releaseForm.channel} onChange={(event) => setReleaseForm({ ...releaseForm, channel: event.target.value })}><option value="stable">stable</option><option value="beta">beta</option></select></label>
            <label className="admin-field"><span>平台</span><select value={releaseForm.platform} onChange={(event) => setReleaseForm({ ...releaseForm, platform: event.target.value })}><option value="darwin">macOS</option><option value="win32">Windows</option></select></label>
            <label className="admin-field"><span>架构</span><select value={releaseForm.architecture} onChange={(event) => setReleaseForm({ ...releaseForm, architecture: event.target.value })}><option value="arm64">arm64</option><option value="x64">x64</option></select></label>
            <label className="admin-field"><span>ZIP下载地址</span><input value={releaseForm.downloadUrl} onChange={(event) => setReleaseForm({ ...releaseForm, downloadUrl: event.target.value })} /></label>
            <label className="admin-field"><span>YAML地址</span><input value={releaseForm.metadataUrl} onChange={(event) => setReleaseForm({ ...releaseForm, metadataUrl: event.target.value })} /></label>
            <label className="admin-field"><span>SHA-512</span><input value={releaseForm.sha512} onChange={(event) => setReleaseForm({ ...releaseForm, sha512: event.target.value })} /></label>
            <label className="admin-field"><span>文件大小</span><input type="number" min={0} value={releaseForm.fileSize} onChange={(event) => setReleaseForm({ ...releaseForm, fileSize: event.target.value })} /></label>
            <label className="admin-field"><span>最低支持版本</span><input value={releaseForm.minimumSupportedVersion} onChange={(event) => setReleaseForm({ ...releaseForm, minimumSupportedVersion: event.target.value })} /><small>低于该版本的客户端将收到更明显的更新提示。</small></label>
            <label className="admin-field"><span>发布时间</span><input type="datetime-local" value={releaseForm.publishedAt} onChange={(event) => setReleaseForm({ ...releaseForm, publishedAt: event.target.value })} /></label>
            <label className="admin-field"><span>更新说明</span><textarea rows={5} value={releaseForm.releaseNotes} onChange={(event) => setReleaseForm({ ...releaseForm, releaseNotes: event.target.value })} /></label>
            <label className="admin-check-row"><input type="checkbox" checked={releaseForm.mandatory} onChange={(event) => setReleaseForm({ ...releaseForm, mandatory: event.target.checked })} />强制更新提醒<small>当前为手动更新模式时，只会显示更明显的提醒，不会自动锁定用户。</small></label>
            <label className="admin-check-row"><input type="checkbox" checked={releaseForm.published} onChange={(event) => setReleaseForm({ ...releaseForm, published: event.target.checked })} />发布到线上</label>
            <button className="admin-primary-button" type="submit"><FileText size={16} />保存版本</button>
          </form>

          <div className="admin-panel">
            <div className="admin-table-wrap">
              <table className="admin-table release-table">
                <thead><tr><th>版本</th><th>目标</th><th>发布状态</th><th>文件状态</th><th>策略</th><th>统计</th><th>操作</th></tr></thead>
                <tbody>
                  {releases.length ? releases.map((release) => {
                    const status = release.status || (release.published ? 'published' : 'draft')
                    return (
                      <tr key={release.id}>
                        <td><strong>{release.version}</strong><small>{release.release_notes || '暂无更新说明'}</small></td>
                        <td>{release.channel} / {release.platform} / {release.architecture}<small>存储方式：{release.storage_provider || '未记录'}</small></td>
                        <td>{renderStatus(status, releaseStatusConfig)}<small>{release.failure_reason || formatDate(release.published_at)}</small></td>
                        <td>
                          <span>DMG：{artifactStatus(release, 'dmg')}</span>
                          <span>ZIP：{release.download_url ? '已配置' : '未配置'}</span>
                          <span>YAML：{release.metadata_url ? '已配置' : '未配置'}</span>
                          <span>blockmap：{artifactStatus(release, 'Blockmap')}</span>
                        </td>
                        <td>{release.mandatory ? '强制更新提醒' : '普通提醒'}<small>最低版本：{release.minimum_supported_version || '未设置'}</small></td>
                        <td>{release.check_count || 0} 次检查<small>{release.download_count || 0} 次下载</small></td>
                        <td>
                          <div className="admin-table-actions">
                            <button type="button" onClick={() => editRelease(release)}>编辑</button>
                            <button type="button" onClick={() => void updateRelease(release, { published: !release.published }, release.published ? '取消发布' : '发布版本')}>{release.published ? '取消发布' : '发布'}</button>
                            <button type="button" onClick={() => void updateRelease(release, { mandatory: !release.mandatory }, '修改强制更新提醒')}>{release.mandatory ? '改为普通提醒' : '设为强提醒'}</button>
                            <button type="button" disabled={!release.download_url} onClick={() => copyText(release.download_url || '', '已复制下载地址。')}><Copy size={14} />复制地址</button>
                            <button type="button" onClick={() => setReleaseArtifacts(release)}>查看文件</button>
                            {status === 'failed' ? <button type="button" onClick={() => void updateRelease(release, { status: 'draft', failureReason: null }, '重试发布')}>重试发布</button> : null}
                          </div>
                        </td>
                      </tr>
                    )
                  }) : <tr><td colSpan={7}><EmptyState title="暂无版本记录" action="填写新版本" onAction={() => setReleaseForm(defaultReleaseForm)} /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    )
  }

  function artifactStatus(release: ReleaseRow, kind: string) {
    const found = release.artifacts?.some((item) => String(item.kind || '').toLowerCase().includes(kind.toLowerCase()))
    return found ? '已上传' : '未记录'
  }

  function renderFeedback() {
    const categories = ['all', ...Array.from(new Set([...SupportFeedbackCategories, ...feedback.map((item) => normalizeSupportFeedbackCategory(item.category))]))]
    return (
      <section className="admin-section">
        <AdminPageHeader
          eyebrow="用户反馈"
          title="查看和处理用户提交的问题"
          description="反馈来自用户端支持中心。诊断信息已限制为版本、平台、系统版本和最近错误码。"
          actions={<button className="admin-secondary-button" type="button" onClick={() => void loadFeedback(feedbackFilters.page)}><RefreshCw size={16} />刷新反馈</button>}
        />
        <div className="admin-panel">
          <div className="admin-filter-grid feedback">
            <label className="admin-field"><span>搜索</span><input value={feedbackFilters.search} onChange={(event) => setFeedbackFilters({ ...feedbackFilters, search: event.target.value })} placeholder="标题、内容、邮箱或版本" /></label>
            <label className="admin-field"><span>状态</span><select value={feedbackFilters.status} onChange={(event) => setFeedbackFilters({ ...feedbackFilters, status: event.target.value })}><option value="all">全部状态</option>{SupportFeedbackStatuses.map((value) => <option key={value} value={value}>{SupportFeedbackStatusLabels[value]}</option>)}</select></label>
            <label className="admin-field"><span>类型</span><select value={feedbackFilters.category} onChange={(event) => setFeedbackFilters({ ...feedbackFilters, category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{category === 'all' ? '全部类型' : category}</option>)}</select></label>
            <label className="admin-field"><span>优先级</span><select value={feedbackFilters.priority} onChange={(event) => setFeedbackFilters({ ...feedbackFilters, priority: event.target.value })}><option value="all">全部优先级</option>{SupportFeedbackPriorities.map((value) => <option key={value} value={value}>{SupportFeedbackPriorityLabels[value]}</option>)}</select></label>
          </div>
          <div className="admin-toolbar">
            <button className="admin-secondary-button" type="button" onClick={() => applyFeedbackFilters({})}><Search size={16} />应用筛选</button>
            <button className="admin-text-button" type="button" onClick={() => { setFeedbackFilters(defaultFeedbackFilters); void loadFeedback(1, defaultFeedbackFilters) }}>重置筛选</button>
            <span className="admin-help">共 {totalFeedback} 条反馈</span>
          </div>

          <div className="admin-feedback-list">
            {feedback.length ? feedback.map((item) => {
              const category = normalizeSupportFeedbackCategory(item.category)
              const priority = item.priority || 'normal'
              const recommendations = getSupportAdminRecommendations(category)
              return (
                <article key={item.id} className="admin-feedback-card">
                  <header>
                    <div>
                      <button className="admin-code-button" type="button" onClick={() => void copyAdminText('反馈编号', supportFeedbackDisplayId(item.id))}>{supportFeedbackDisplayId(item.id)}</button>
                      <h2>{item.subject}</h2>
                      <p>{item.message}</p>
                    </div>
                    <div className="admin-feedback-badges">
                      <span className="task-badge">{category}</span>
                      {renderStatus(item.status, feedbackStatusConfig)}
                      {renderStatus(priority, feedbackPriorityConfig)}
                    </div>
                  </header>
                  <dl className="admin-feedback-meta">
                    <div><dt>联系邮箱</dt><dd>{item.contact_email || '未提供'}</dd></div>
                    <div><dt>应用版本</dt><dd>{item.app_version || '未知版本'}</dd></div>
                    <div><dt>平台</dt><dd>{item.platform || '未知平台'}</dd></div>
                    <div><dt>提交时间</dt><dd>{formatDate(item.created_at)}</dd></div>
                    <div><dt>管理备注</dt><dd>{item.admin_note || '暂无'}</dd></div>
                  </dl>
                  <div className="admin-feedback-recommendations">
                    <span className="admin-eyebrow">推荐处理方案</span>
                    <ul>{recommendations.slice(0, 4).map((step) => <li key={step}>{step}</li>)}</ul>
                  </div>
                  <footer className="admin-feedback-actions">
                    {SupportFeedbackStatuses.map((status) => (
                      <button key={status} className="admin-secondary-button" type="button" disabled={item.status === status} onClick={() => void updateFeedback(item, { status }, `标记${SupportFeedbackStatusLabels[status]}`)}>
                        {SupportFeedbackStatusLabels[status]}
                      </button>
                    ))}
                    <select value={priority} onChange={(event) => void updateFeedback(item, { priority: event.target.value as SupportFeedbackPriority }, '调整优先级')} aria-label="调整优先级">
                      {SupportFeedbackPriorities.map((value) => <option key={value} value={value}>{SupportFeedbackPriorityLabels[value]}</option>)}
                    </select>
                    <button className="admin-secondary-button" type="button" onClick={() => editFeedbackNote(item)}>备注</button>
                    <button className="admin-secondary-button" type="button" onClick={() => void copyAdminText('脱敏诊断信息', maskedDiagnostics(item))}>复制诊断</button>
                    <button className="admin-primary-button" type="button" onClick={() => openFeedbackDetail(item)}>查看详情</button>
                  </footer>
                </article>
              )
            }) : <EmptyState title="没有找到用户反馈" action="刷新反馈" onAction={() => void loadFeedback(1)} />}
          </div>
          <Pagination total={totalFeedback} page={feedbackFilters.page} pages={feedbackPages} onPage={(page) => void loadFeedback(page)} />
        </div>
      </section>
    )
  }

  function renderFeedbackDetailDialog(item: SupportFeedbackRow) {
    const category = normalizeSupportFeedbackCategory(item.category)
    const priority = item.priority || 'normal'
    const recommendations = getSupportAdminRecommendations(category)
    return (
      <CenteredDialog
        open={Boolean(item)}
        title={`${supportFeedbackDisplayId(item.id)} · ${item.subject}`}
        description={`${category} · ${formatDate(item.created_at)}`}
        className="admin-feedback-dialog"
        bodyClassName="admin-feedback-dialog-body"
        onClose={() => setFeedbackDetail(null)}
        footer={
          <>
            <button className="admin-secondary-button" type="button" onClick={() => void copyAdminText('反馈编号', supportFeedbackDisplayId(item.id))}>复制编号</button>
            <button className="admin-secondary-button" type="button" onClick={() => void copyAdminText('脱敏诊断信息', maskedDiagnostics(item))}>复制诊断</button>
            <button className="admin-primary-button" type="button" onClick={() => void updateFeedback(item, { adminNote: feedbackNoteDraft.trim() || null }, '保存反馈备注')}>保存备注</button>
          </>
        }
      >
        <dl className="admin-definition-list">
          <div><dt>反馈编号</dt><dd>{supportFeedbackDisplayId(item.id)}<small>{item.id}</small></dd></div>
          <div><dt>问题类型</dt><dd>{category}</dd></div>
          <div><dt>标题</dt><dd>{item.subject}</dd></div>
          <div><dt>描述</dt><dd>{item.message}</dd></div>
          <div><dt>联系邮箱</dt><dd>{item.contact_email || '未提供'}</dd></div>
          <div><dt>应用版本</dt><dd>{item.app_version || '未知版本'}</dd></div>
          <div><dt>平台</dt><dd>{item.platform || '未知平台'}</dd></div>
          <div><dt>系统版本</dt><dd>{item.os_version || '未知系统'}</dd></div>
          <div><dt>提交时间</dt><dd>{formatDate(item.created_at)}</dd></div>
          <div><dt>状态</dt><dd>{renderStatus(item.status, feedbackStatusConfig)}</dd></div>
          <div><dt>优先级</dt><dd>{renderStatus(priority, feedbackPriorityConfig)}</dd></div>
        </dl>
        <section className="admin-feedback-recommendations">
          <span className="admin-eyebrow">推荐处理方案</span>
          <ul>{recommendations.map((step) => <li key={step}>{step}</li>)}</ul>
        </section>
        <label className="admin-field">
          <span>管理备注</span>
          <textarea rows={5} value={feedbackNoteDraft} onChange={(event) => setFeedbackNoteDraft(event.target.value)} placeholder="记录处理动作、需要用户补充的信息或最终结论" />
        </label>
        <div className="admin-feedback-actions">
          {SupportFeedbackStatuses.map((status) => (
            <button key={status} className="admin-secondary-button" type="button" disabled={item.status === status} onClick={() => void updateFeedback(item, { status }, `标记${SupportFeedbackStatusLabels[status]}`)}>
              {SupportFeedbackStatusLabels[status]}
            </button>
          ))}
          <select value={priority} onChange={(event) => void updateFeedback(item, { priority: event.target.value as SupportFeedbackPriority }, '调整优先级')} aria-label="调整优先级">
            {SupportFeedbackPriorities.map((value) => <option key={value} value={value}>{SupportFeedbackPriorityLabels[value]}</option>)}
          </select>
        </div>
      </CenteredDialog>
    )
  }

  function renderLogs() {
    return (
      <section className="admin-section">
        <AdminPageHeader
          eyebrow="操作日志"
          title="筛选和查看后台日志"
          description="敏感字段已在服务端脱敏。详情中不会显示密钥、密码或 Authorization Header。"
          actions={<button className="admin-secondary-button" type="button" onClick={exportLogs}><FileDown size={16} />导出日志</button>}
        />
        <div className="admin-panel">
          <div className="admin-filter-grid logs">
            <label className="admin-field"><span>关键词</span><input value={logFilters.search} onChange={(event) => setLogFilters({ ...logFilters, search: event.target.value })} /></label>
            <label className="admin-field"><span>操作类型</span><select value={logFilters.eventType} onChange={(event) => setLogFilters({ ...logFilters, eventType: event.target.value })}><option value="all">全部</option>{Object.entries(eventTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="admin-field"><span>结果</span><select value={logFilters.success} onChange={(event) => setLogFilters({ ...logFilters, success: event.target.value })}><option value="all">全部</option><option value="success">成功</option><option value="failed">失败</option></select></label>
            <label className="admin-field"><span>开始日期</span><input type="date" value={logFilters.createdFrom} onChange={(event) => setLogFilters({ ...logFilters, createdFrom: event.target.value })} /></label>
            <label className="admin-field"><span>结束日期</span><input type="date" value={logFilters.createdTo} onChange={(event) => setLogFilters({ ...logFilters, createdTo: event.target.value })} /></label>
          </div>
          <div className="admin-toolbar">
            <button className="admin-secondary-button" type="button" onClick={() => applyLogFilters({})}><Search size={16} />应用筛选</button>
            <button className="admin-text-button" type="button" onClick={() => { setLogFilters(defaultLogFilters); void loadEvents(1, defaultLogFilters) }}>重置筛选</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table log-table">
              <thead><tr><th>时间</th><th>操作类型</th><th>操作对象</th><th>结果</th><th>操作人</th><th>简要说明</th><th>错误码</th><th>详情</th></tr></thead>
              <tbody>
                {events.length ? events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.created_at)}</td>
                    <td>{eventTypeLabels[event.event_type] || event.event_type}</td>
                    <td>{event.license_id ? `${event.license_id.slice(0, 8)}…` : '系统'}</td>
                    <td>{event.success ? renderStatus('active', { active: { label: '成功', tone: 'good', icon: CheckCircle2 } }) : renderStatus('failed', { failed: { label: '失败', tone: 'bad', icon: AlertTriangle } })}</td>
                    <td>{event.actor || '系统'}</td>
                    <td>{event.reason || '暂无说明'}</td>
                    <td>{event.success ? '无' : event.reason || '未返回'}</td>
                    <td><button className="admin-text-button" type="button" onClick={() => setEventDetail(event)}>查看详情</button></td>
                  </tr>
                )) : <tr><td colSpan={8}><EmptyState title="没有找到日志" action="查看全部日志" onAction={() => { setLogFilters(defaultLogFilters); void loadEvents(1, defaultLogFilters) }} /></td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination total={totalEvents} page={logFilters.page} pages={eventPages} onPage={(page) => void loadEvents(page)} />
        </div>
      </section>
    )
  }

  function renderSettings() {
    return (
      <section className="admin-section">
        <AdminPageHeader eyebrow="系统设置" title="管理默认值和显示偏好" description="这里保存的是后台管理配置，不会保存任何密钥。" />
        <form className="admin-settings-grid" onSubmit={saveSettings}>
          <section className="admin-panel">
            <h2>授权设置</h2>
            <label className="admin-field"><span>默认有效天数</span><input type="number" min={1} value={settingsForm.defaultDurationDays} onChange={(event) => setSettingsForm({ ...settingsForm, defaultDurationDays: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>默认最大设备数</span><input type="number" min={1} value={settingsForm.defaultMaxDevices} onChange={(event) => setSettingsForm({ ...settingsForm, defaultMaxDevices: Number(event.target.value) })} /><small>一个激活码最多可以绑定的设备数量。</small></label>
            <label className="admin-check-row"><input type="checkbox" checked={settingsForm.allowDeviceDeactivation} onChange={(event) => setSettingsForm({ ...settingsForm, allowDeviceDeactivation: event.target.checked })} />默认允许解绑设备</label>
            <label className="admin-field"><span>即将到期提醒天数</span><input type="number" min={1} value={settingsForm.expiringReminderDays} onChange={(event) => setSettingsForm({ ...settingsForm, expiringReminderDays: Number(event.target.value) })} /></label>
          </section>
          <section className="admin-panel">
            <h2>版本更新设置</h2>
            <label className="admin-field"><span>更新通道</span><select value={settingsForm.updateChannel} onChange={(event) => setSettingsForm({ ...settingsForm, updateChannel: event.target.value as 'stable' | 'beta' })}><option value="stable">stable</option><option value="beta">beta</option></select></label>
            <label className="admin-field"><span>当前更新模式</span><input value="检测到新版本后，提示用户联系开发者更新" readOnly /></label>
            <label className="admin-check-row"><input type="checkbox" checked={settingsForm.autoUpdateDownloadEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, autoUpdateDownloadEnabled: event.target.checked })} />自动下载开关状态<small>当前桌面端运行模式仍以服务端环境变量为准。</small></label>
            <label className="admin-field"><span>最新版本</span><input value={settingsForm.latestVersion || dashboard?.latestRelease?.version || ''} onChange={(event) => setSettingsForm({ ...settingsForm, latestVersion: event.target.value || null })} /></label>
            <label className="admin-field"><span>最低支持版本</span><input value={settingsForm.minimumSupportedVersion || ''} onChange={(event) => setSettingsForm({ ...settingsForm, minimumSupportedVersion: event.target.value || null })} /><small>低于该版本的客户端将收到更明显的更新提示。</small></label>
          </section>
          <section className="admin-panel">
            <h2>管理员设置</h2>
            <p className="admin-help">管理员登录仍由服务端密码和会话 Cookie 控制。此处不会显示或保存管理员密码。</p>
          </section>
          <section className="admin-panel">
            <h2>显示设置</h2>
            <label className="admin-field"><span>每页显示数量</span><input type="number" min={10} max={200} value={settingsForm.pageSize} onChange={(event) => setSettingsForm({ ...settingsForm, pageSize: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>默认排序</span><select value={settingsForm.defaultSort} onChange={(event) => setSettingsForm({ ...settingsForm, defaultSort: event.target.value })}><option value="created_at_desc">创建时间从新到旧</option><option value="expires_at_asc">到期时间从近到远</option></select></label>
            <label className="admin-field"><span>日期格式</span><input value={settingsForm.dateFormat} onChange={(event) => setSettingsForm({ ...settingsForm, dateFormat: event.target.value })} /></label>
            <label className="admin-field"><span>时区</span><input value={settingsForm.timezone} onChange={(event) => setSettingsForm({ ...settingsForm, timezone: event.target.value })} /></label>
          </section>
          <div className="admin-save-bar">
            <span>修改会保存到 Supabase 后台设置表。</span>
            <button className="admin-primary-button" type="submit"><Settings size={16} />保存设置</button>
          </div>
        </form>
      </section>
    )
  }

  function renderGenerateDialog() {
    const summary = createForm.expiryMode === 'fixed'
      ? `固定到期：${createForm.expiresAt || '未选择'}`
      : `${createForm.expiryMode === 'first_activation' ? '首次激活后开始计时' : '生成后立即开始计时'} ${createForm.durationDays} 天`
    return (
      <div className="admin-modal-layer" role="presentation">
        <section className="admin-modal wide" role="dialog" aria-modal="true" aria-labelledby="generate-title">
          <div className="admin-modal-header">
            <div><p className="admin-eyebrow">生成激活码</p><h2 id="generate-title">创建可发放给用户的激活码</h2></div>
            <button className="admin-icon-button" type="button" aria-label="关闭" onClick={closeGenerateModal}><X size={18} /></button>
          </div>
          <form className="admin-generate-grid" onSubmit={createKeys}>
            <label className="admin-field"><span>生成数量</span><input type="number" min={1} max={500} value={createForm.count} onChange={(event) => setCreateForm({ ...createForm, count: Number(event.target.value) })} /></label>
            <label className="admin-field"><span>有效天数</span><input type="number" min={1} value={createForm.durationDays} onChange={(event) => setCreateForm({ ...createForm, durationDays: event.target.value })} disabled={createForm.expiryMode === 'fixed'} /></label>
            <label className="admin-field"><span>到期计算方式</span><select value={createForm.expiryMode} onChange={(event) => setCreateForm({ ...createForm, expiryMode: event.target.value })}><option value="first_activation">首次激活后开始计时</option><option value="immediate">生成后立即开始计时</option><option value="fixed">指定固定到期日期</option></select></label>
            <label className="admin-field"><span>最大设备数</span><input type="number" min={1} value={createForm.maxDevices} onChange={(event) => setCreateForm({ ...createForm, maxDevices: event.target.value })} /><small>一个激活码最多可以绑定的设备数量。</small></label>
            <label className="admin-field"><span>套餐名称</span><input value={createForm.plan} onChange={(event) => setCreateForm({ ...createForm, plan: event.target.value })} /></label>
            <label className="admin-field"><span>最大激活次数</span><input type="number" min={1} value={createForm.maxActivations} onChange={(event) => setCreateForm({ ...createForm, maxActivations: event.target.value })} placeholder="留空表示不限制" /></label>
            <label className="admin-field full"><span>备注</span><input value={createForm.note} onChange={(event) => setCreateForm({ ...createForm, note: event.target.value })} /></label>
            <label className="admin-field"><span>自定义到期时间</span><input type="datetime-local" value={createForm.expiresAt} onChange={(event) => setCreateForm({ ...createForm, expiresAt: event.target.value })} disabled={createForm.expiryMode !== 'fixed'} /></label>
            <label className="admin-field"><span>内部标签</span><input value={createForm.internalNote} onChange={(event) => setCreateForm({ ...createForm, internalNote: event.target.value })} /></label>
            <label className="admin-check-row"><input type="checkbox" checked={createForm.allowDeviceDeactivation} onChange={(event) => setCreateForm({ ...createForm, allowDeviceDeactivation: event.target.checked })} />允许解绑</label>
            <label className="admin-check-row"><input type="checkbox" checked={createForm.effectiveImmediately} onChange={(event) => setCreateForm({ ...createForm, effectiveImmediately: event.target.checked })} />立即生效</label>
            <div className="admin-confirm-summary full">
              <strong>生成前确认</strong>
              <span>将生成 {createForm.count} 个激活码</span>
              <span>有效期：{summary}</span>
              <span>最大设备数：{createForm.maxDevices || '不限'} 台</span>
              <span>套餐：{createForm.plan || '未填写'}</span>
            </div>
            <div className="admin-modal-actions full">
              <button className="admin-secondary-button" type="button" onClick={closeGenerateModal}>取消</button>
              <button className="admin-primary-button" type="submit" disabled={loading}><Plus size={16} />{loading ? '正在生成激活码' : '确认生成'}</button>
            </div>
          </form>

          {generated.length ? (
            <div className="admin-generated-panel">
              <div className="admin-panel-heading">
                <div><p className="admin-eyebrow">完整激活码只显示一次</p><h3>生成成功</h3></div>
                <div className="admin-row-actions">
                  <button className="admin-secondary-button" type="button" onClick={() => void copyGeneratedAll()}><Copy size={16} />复制全部</button>
                  <button className="admin-secondary-button" type="button" onClick={exportGeneratedCsv}><Download size={16} />导出CSV</button>
                  <button className="admin-secondary-button" type="button" onClick={exportGeneratedTxt}>下载TXT</button>
                </div>
              </div>
              <ul className="admin-generated-list">
                {generated.map((item) => (
                  <li key={item.licenseKey}>
                    <code>{item.licenseKey}</code>
                    <span>{item.masked} / {formatDate(item.created_at)} / {item.expires_at ? formatDate(item.expires_at) : '待激活或长期有效'}</span>
                    <button type="button" onClick={() => void copyText(item.licenseKey, '已复制单个激活码。')}>复制</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  function renderLicenseDrawer(key: LicenseRow) {
    return (
      <div className="admin-drawer-layer" role="presentation" onMouseDown={() => setDetailKey(null)}>
        <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label="激活码详情" onMouseDown={(event) => event.stopPropagation()}>
          <div className="admin-modal-header">
            <div><p className="admin-eyebrow">激活码详情</p><h2>{getMaskedKey(key)}</h2></div>
            <button className="admin-icon-button" type="button" aria-label="关闭" onClick={() => setDetailKey(null)}><X size={18} /></button>
          </div>
          <div className="admin-detail-stack">
            <section>
              <h3>基本信息</h3>
              <dl className="admin-definition-list">
                <div><dt>状态</dt><dd>{renderStatus(key.display_status || key.status, licenseStatusConfig)}</dd></div>
                <div><dt>备注</dt><dd>{key.note || '暂无'}</dd></div>
                <div><dt>套餐</dt><dd>{key.plan}</dd></div>
                <div><dt>创建时间</dt><dd>{formatDate(key.created_at)}</dd></div>
                <div><dt>首次激活时间</dt><dd>{formatDate(key.activated_at)}</dd></div>
                <div><dt>到期时间</dt><dd>{formatDate(key.expires_at)}（{remainingDays(key.expires_at)}）</dd></div>
                <div><dt>当前设备数</dt><dd>{key.active_device_count || 0}</dd></div>
                <div><dt>最大设备数</dt><dd>{key.max_devices || '不限'}</dd></div>
                <div><dt>最近验证时间</dt><dd>{formatDate(key.last_used_at)}</dd></div>
                <div><dt>内部标签</dt><dd>{key.internal_note || '暂无'}</dd></div>
              </dl>
            </section>
            <section>
              <h3>绑定设备</h3>
              <div className="admin-mini-list">
                {(key.license_devices || []).length ? key.license_devices?.map((device) => (
                  <div key={device.id}>
                    <strong>{device.device_hash_masked || device.device_hash}</strong>
                    <span>{device.operating_system || '未知'} / {device.app_version || '暂无版本'} / {formatDate(device.last_seen_at)}</span>
                    {device.status === 'active' ? <button className="danger" type="button" onClick={() => deactivateDevice(key.id, device)}>解绑设备</button> : renderStatus(device.status, deviceStatusConfig)}
                  </div>
                )) : <p className="admin-help">当前没有绑定设备。</p>}
              </div>
            </section>
            <section>
              <h3>操作记录</h3>
              <div className="admin-mini-list">
                {detailEvents.length ? detailEvents.map((event) => (
                  <div key={event.id}>
                    <strong>{eventTypeLabels[event.event_type] || event.event_type}</strong>
                    <span>{event.success ? '成功' : '失败'} / {event.reason || '暂无说明'} / {formatDate(event.created_at)}</span>
                  </div>
                )) : <p className="admin-help">暂无操作记录。</p>}
              </div>
            </section>
            <section>
              <h3>风险信息</h3>
              <p className="admin-help">激活码完整内容不会在详情页显示。撤销、暂停和解绑设备都需要二次确认。</p>
            </section>
            <div className="admin-drawer-actions">
              <button type="button" onClick={() => updateStatus(key, 'suspended')}>暂停</button>
              <button type="button" onClick={() => updateStatus(key, 'active')}>恢复</button>
              <button type="button" onClick={() => extendLicense(key)}>续期</button>
              <button type="button" onClick={() => promptExpiry(key)}>修改到期时间</button>
              <button type="button" onClick={() => promptMaxDevices(key)}>修改设备数量</button>
              <button type="button" onClick={() => promptNote(key)}>修改备注</button>
              <button type="button" onClick={() => promptPlan(key)}>修改套餐</button>
              <button className="danger" type="button" onClick={() => resetDevices(key)}>解绑设备</button>
              <button className="danger" type="button" onClick={() => updateStatus(key, 'revoked')}>撤销激活码</button>
            </div>
          </div>
        </aside>
      </div>
    )
  }

  function renderEventDialog(event: LicenseEventRow) {
    return (
      <div className="admin-modal-layer" role="presentation" onMouseDown={() => setEventDetail(null)}>
        <section className="admin-modal" role="dialog" aria-modal="true" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}>
          <div className="admin-modal-header">
            <div><p className="admin-eyebrow">日志详情</p><h2>{eventTypeLabels[event.event_type] || event.event_type}</h2></div>
            <button className="admin-icon-button" type="button" aria-label="关闭" onClick={() => setEventDetail(null)}><X size={18} /></button>
          </div>
          <dl className="admin-definition-list">
            <div><dt>时间</dt><dd>{formatDate(event.created_at)}</dd></div>
            <div><dt>结果</dt><dd>{event.success ? '成功' : '失败'}</dd></div>
            <div><dt>操作人</dt><dd>{event.actor || '系统'}</dd></div>
            <div><dt>错误码</dt><dd>{event.success ? '无' : event.reason || '未返回'}</dd></div>
            <div><dt>应用版本</dt><dd>{event.app_version || '暂无'}</dd></div>
          </dl>
          <pre className="admin-json-preview">{JSON.stringify(event.metadata || {}, null, 2)}</pre>
        </section>
      </div>
    )
  }

  function renderReleaseArtifacts(release: ReleaseRow) {
    return (
      <div className="admin-modal-layer" role="presentation" onMouseDown={() => setReleaseArtifacts(null)}>
        <section className="admin-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <div className="admin-modal-header">
            <div><p className="admin-eyebrow">上传文件</p><h2>{release.version}</h2></div>
            <button className="admin-icon-button" type="button" aria-label="关闭" onClick={() => setReleaseArtifacts(null)}><X size={18} /></button>
          </div>
          <div className="admin-mini-list">
            {(release.artifacts || []).length ? release.artifacts?.map((artifact, index) => (
              <div key={`${artifact.kind || 'file'}-${index}`}>
                <strong>{artifact.kind || '文件'}</strong>
                <span>{artifact.key || artifact.publicUrl || '未记录地址'} / {artifact.size ? `${artifact.size} 字节` : '未记录大小'}</span>
                {artifact.publicUrl ? <button type="button" onClick={() => void copyText(artifact.publicUrl || '', '已复制文件地址。')}>复制地址</button> : null}
              </div>
            )) : <p className="admin-help">当前版本没有记录上传文件。可通过发布脚本写入 R2 文件信息。</p>}
          </div>
          {release.failure_reason ? <p className="admin-error-text">失败原因：{release.failure_reason}</p> : null}
        </section>
      </div>
    )
  }
}

function Pagination({ total, page, pages, onPage }: { total: number; page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <div className="admin-pagination">
      <span>共 {total} 条，第 {page} / {pages} 页</span>
      <div>
        <button className="admin-secondary-button" type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
        <button className="admin-secondary-button" type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button>
      </div>
    </div>
  )
}

function EmptyState({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="admin-empty-state">
      <KeyRound size={28} aria-hidden="true" />
      <strong>{title}</strong>
      <button className="admin-secondary-button" type="button" onClick={onAction}>{action}</button>
    </div>
  )
}
