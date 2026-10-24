'use client'

import { FormEvent, useState } from 'react'
import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'
import {
  Activity,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  CalendarRange,
  CircleAlert,
  FileCheck2,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ScanText,
  Sparkles,
  Zap
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { ADMIN_CACHE_KEYS } from '@/components/admin/AdminDataProvider'
import { adminApiRequest, AdminApiError, adminJsonFetcher } from '@/lib/admin/fetch-json'
import {
  AiModelSettingsSchema,
  AiCredentialUpdateSchema,
  type AiModelSettings,
  type AiModelSlot
} from '@/lib/ai-model-settings'
import { useToast } from '@/components/interaction-system'

type ModelsResponse = {
  success: true
  settings: AiModelSettings
  updatedAt: string | null
  source: 'admin' | 'environment'
  apiKeyConfigured: boolean
  apiKeySource: 'admin' | 'environment' | 'none'
  apiKeyReadable: boolean
  environmentApiKeyConfigured: boolean
}

type ModelTestResponse = {
  success: true
  latencyMs: number
  model: string
  slot: AiModelSlot
  capability: 'image-json' | 'json-stream'
}

const MODEL_ERROR_MESSAGES: Record<string, string> = {
  AI_KEY_MISSING: '请在下方输入 API 密钥，再测试或保存。',
  AI_KEY_UNREADABLE: '已保存的密钥无法解密，请重新输入并保存。',
  ai_api_key_invalid: 'API 密钥无效，请检查或更换下方的密钥。',
  ai_model_or_endpoint_invalid: '模型名称或 API Base URL 不正确。',
  ai_quota_exhausted: '模型服务额度已耗尽，请充值或更换有额度的 API Key。',
  ai_rate_limited: '请求过于频繁，请稍后重试。',
  ai_request_timeout: '模型响应超时，请稍后重试或更换模型。',
  ai_network_error: '无法连接模型服务，请检查 API Base URL。',
  ai_capability_test_failed: '模型已响应，但未通过 JSON 输出或图片识别测试，请检查模型能力。',
  ai_json_parse_error: '模型未返回有效的 JSON，请确认模型支持 JSON 输出。',
  vision_model_image_input_unsupported: '当前模型不支持图片输入，请选择支持图片识别的模型。',
  CONFLICT: '配置已被其他管理员修改，请刷新后重试。'
}

function modelErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof AdminApiError)) return fallback
  if (error.code === 'INVALID_INPUT') return error.message
  return (error.code && MODEL_ERROR_MESSAGES[error.code]) || error.message || fallback
}

const modelFields: Array<{
  key: AiModelSlot
  title: string
  description: string
  icon: typeof Zap
  tone: string
}> = [
  { key: 'promptModel', title: '题目生成', description: '练习题与写作题目的智能生成', icon: Sparkles, tone: 'blue' },
  { key: 'gradingModel', title: '作文批改', description: '评分、批注、改写与高分范文', icon: FileCheck2, tone: 'violet' },
  { key: 'studyPlanModel', title: '学习计划', description: '诊断、周计划与真题文本分析', icon: CalendarRange, tone: 'green' },
  { key: 'visionModel', title: '图片识别', description: '识别上传的题目图片与图表', icon: ScanText, tone: 'amber' },
  { key: 'visionFallbackModel', title: '识别备用', description: '主视觉模型额度不足时自动接管', icon: RefreshCw, tone: 'red' }
]

export function AdminModelsClient() {
  const { data, error, isLoading, mutate } = useSWR<ModelsResponse>(ADMIN_CACHE_KEYS.MODELS, adminJsonFetcher, {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  })
  if (error || !data) return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader title="模型配置" description="设置 API 密钥、接口地址和各项功能使用的模型。" />
      {isLoading ? <AdminTableSkeleton columns={3} rows={5} /> : (
        <AdminError message={error instanceof AdminApiError ? error.message : '无法加载模型配置。'} onRetry={() => void mutate()} />
      )}
    </main>
  )
  return <AdminModelsForm initialData={data} onSaved={(saved) => { void mutate(saved, { revalidate: false }) }} />
}

function AdminModelsForm({ initialData, onSaved }: { initialData: ModelsResponse; onSaved: (data: ModelsResponse) => void }) {
  const { pushToast } = useToast()
  const [settings, setSettings] = useState<AiModelSettings>(initialData.settings)
  const [savedSettings, setSavedSettings] = useState<AiModelSettings>(initialData.settings)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialData.updatedAt)
  const [source, setSource] = useState<'admin' | 'environment'>(initialData.source)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(initialData.apiKeyConfigured)
  const [apiKeySource, setApiKeySource] = useState<ModelsResponse['apiKeySource']>(initialData.apiKeySource)
  const [apiKeyReadable, setApiKeyReadable] = useState(initialData.apiKeyReadable)
  const [environmentApiKeyConfigured, setEnvironmentApiKeyConfigured] = useState(initialData.environmentApiKeyConfigured)
  const [apiKey, setApiKey] = useState('')
  const [clearApiKey, setClearApiKey] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [testResults, setTestResults] = useState<Partial<Record<AiModelSlot, ModelTestResponse>>>({})
  const [testErrors, setTestErrors] = useState<Partial<Record<AiModelSlot, string>>>({})
  const [testingSlot, setTestingSlot] = useState<AiModelSlot | null>(null)
  const [testingAll, setTestingAll] = useState(false)

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings) || Boolean(apiKey.trim()) || clearApiKey
  const keyReady = Boolean(apiKey.trim()) || (clearApiKey ? environmentApiKeyConfigured : apiKeyConfigured)
  const passedTests = Object.keys(testResults).length

  function validate() {
    const parsed = AiModelSettingsSchema.safeParse(settings)
    const credentials = AiCredentialUpdateSchema.safeParse({ apiKey, clearApiKey })
    if (parsed.success && credentials.success) {
      setValidationErrors({})
      return true
    }

    const errors: Record<string, string> = {}
    const issues = [...(parsed.success ? [] : parsed.error.issues), ...(credentials.success ? [] : credentials.error.issues)]
    issues.forEach((issue) => {
      const key = String(issue.path[0] || 'form')
      if (!errors[key]) errors[key] = issue.message
    })
    setValidationErrors(errors)
    return false
  }

  const { trigger: saveModels, isMutating: saving } = useSWRMutation(
    ADMIN_CACHE_KEYS.MODELS,
    async () => {
      if (!validate()) throw new Error('VALIDATION_FAILED')
      return adminApiRequest<ModelsResponse>('/api/admin/models', 'PATCH', {
        ...settings,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(clearApiKey ? { clearApiKey: true } : {}),
        ...(updatedAt ? { expectedUpdatedAt: updatedAt } : {})
      })
    },
    {
      onSuccess(data) {
        setSettings(data.settings)
        setSavedSettings(data.settings)
        setUpdatedAt(data.updatedAt)
        setSource('admin')
        setApiKeyConfigured(data.apiKeyConfigured)
        setApiKeySource(data.apiKeySource)
        setApiKeyReadable(data.apiKeyReadable)
        setEnvironmentApiKeyConfigured(data.environmentApiKeyConfigured)
        setApiKey('')
        setClearApiKey(false)
        onSaved(data)
        pushToast({ kind: 'success', title: data.settings.enabled ? '配置已保存，新的 AI 请求将立即使用当前配置' : '后台配置已停用，新的 AI 请求将使用环境配置' })
      },
      onError(error) {
        if (error instanceof Error && error.message === 'VALIDATION_FAILED') return
        pushToast({
          kind: 'error',
          title: '模型配置保存失败',
          message: modelErrorMessage(error, '请稍后重试。')
        })
      },
      revalidate: false,
      throwOnError: false
    }
  )

  const { trigger: testConnection, isMutating: testing } = useSWRMutation(
    '/api/admin/models/test',
    async (_key, { arg: slot }: { arg: AiModelSlot }) => {
      if (!validate()) throw new Error('VALIDATION_FAILED')
      setTestingSlot(slot)
      setTestResults((current) => { const next = { ...current }; delete next[slot]; return next })
      setTestErrors((current) => { const next = { ...current }; delete next[slot]; return next })
      try {
        return await adminApiRequest<ModelTestResponse>(
          '/api/admin/models/test', 'POST',
          { settings, slot, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(clearApiKey ? { clearApiKey: true } : {}) }
        )
      } catch (error) {
        setTestErrors((current) => ({ ...current, [slot]: modelErrorMessage(error, '连接测试失败，请检查接口、模型和密钥。') }))
        throw error
      }
    },
    {
      onSuccess(data) {
        setTestingSlot(null)
        setTestResults((current) => ({ ...current, [data.slot]: data }))
        pushToast({
          kind: 'success',
          title: `测试通过：${data.model} · ${data.latencyMs}ms`,
          message: data.capability === 'image-json' ? '图片输入与 JSON 输出已验证。' : '流式响应与 JSON 输出已验证。'
        })
      },
      onError(error) {
        setTestingSlot(null)
        if (error instanceof Error && error.message === 'VALIDATION_FAILED') return
        pushToast({
          kind: 'error',
          title: '连接测试失败',
          message: modelErrorMessage(error, '请检查接口地址、模型名称和服务端密钥。')
        })
      },
      throwOnError: false
    }
  )

  const busy = saving || testing || testingAll

  function resetTests() {
    setTestResults({})
    setTestErrors({})
  }

  async function testAllModels() {
    if (!validate()) return
    resetTests()
    setTestingAll(true)
    try {
      for (const field of modelFields) await testConnection(field.key)
    } finally {
      setTestingAll(false)
    }
  }

  function updateSetting<K extends keyof AiModelSettings>(key: K, value: AiModelSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
    resetTests()
    if (validationErrors[key]) {
      setValidationErrors((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy) void saveModels()
  }

  function revertChanges() {
    setSettings(savedSettings)
    setValidationErrors({})
    resetTests()
    setApiKey('')
    setClearApiKey(false)
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="AI CONTROL CENTER"
        title="模型配置"
        description="设置 API 密钥、接口地址和各项功能使用的模型。保存后立即应用于新的 AI 请求。"
        actions={(
          <button
            className="admin-secondary-button"
            type="button"
            disabled={busy || !keyReady}
            onClick={() => void testAllModels()}
          >
            {testing || testingAll ? <Loader2 className="admin-spin" size={16} /> : <Activity size={16} />}
            {testing || testingAll ? '正在测试' : '测试全部模型'}
          </button>
        )}
      />

        <form className="admin-models-layout" onSubmit={handleSubmit}>
          <section className="admin-model-status-grid" aria-label="模型配置状态">
            <article className="admin-model-status-card">
              <span className={settings.enabled ? 'is-good' : 'is-muted'}><BrainCircuit size={20} /></span>
              <div><small>已保存的运行状态</small><strong>{savedSettings.enabled && source === 'admin' ? '后台配置已启用' : '使用环境变量'}</strong></div>
            </article>
            <article className="admin-model-status-card">
              <span className={apiKeyConfigured ? 'is-good' : 'is-warning'}><KeyRound size={20} /></span>
              <div><small>已保存的密钥</small><strong>{!apiKeyReadable ? '需要重新输入' : apiKeySource === 'admin' ? '后台密钥已加密保存' : apiKeySource === 'environment' ? '使用环境密钥' : '尚未配置'}</strong></div>
            </article>
            <article className="admin-model-status-card">
              <span className={passedTests === modelFields.length ? 'is-good' : 'is-muted'}><BadgeCheck size={20} /></span>
              <div><small>当前表单测试结果</small><strong>{passedTests ? `${passedTests} / ${modelFields.length} 项已通过` : '等待测试'}</strong></div>
            </article>
          </section>

          {!keyReady ? (
            <div className="admin-model-notice warning" role="status">
              <CircleAlert size={18} />
              <div><strong>需要配置 API 密钥</strong><span>在下方输入密钥即可测试和保存；密钥加密存储，保存后不会回显。</span></div>
            </div>
          ) : null}

          <section className="admin-panel admin-model-provider-panel">
            <div className="admin-settings-heading">
              <span><BrainCircuit size={20} /></span>
              <div><h2>服务连接</h2><p>兼容 OpenAI Chat Completions 接口；切换关闭时自动回退到部署环境配置。</p></div>
              <button
                className={`admin-switch ${settings.enabled ? 'is-on' : ''}`}
                type="button"
                role="switch"
                aria-checked={settings.enabled}
                disabled={busy}
                onClick={() => updateSetting('enabled', !settings.enabled)}
              >
                <span />
                {settings.enabled ? '已启用' : '已停用'}
              </button>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>服务商标识</span>
                <input
                  value={settings.provider}
                  disabled={busy}
                  list="ai-provider-options"
                  onChange={(event) => updateSetting('provider', event.target.value)}
                  aria-invalid={Boolean(validationErrors.provider)}
                  placeholder="例如 qwen"
                />
                <datalist id="ai-provider-options">
                  <option value="qwen" />
                  <option value="openai" />
                  <option value="openai-compatible" />
                </datalist>
                {validationErrors.provider ? <small className="admin-field-error">{validationErrors.provider}</small> : null}
              </label>
              <label className="admin-field">
                <span>API Base URL</span>
                <input
                  type="url"
                  value={settings.baseUrl}
                  disabled={busy}
                  onChange={(event) => updateSetting('baseUrl', event.target.value)}
                  aria-invalid={Boolean(validationErrors.baseUrl)}
                  placeholder="https://.../v1"
                />
                {validationErrors.baseUrl ? <small className="admin-field-error">{validationErrors.baseUrl}</small> : null}
              </label>
              <label className="admin-field full">
                <span>API 密钥</span>
                <input
                  type="password"
                  name="ai-api-key"
                  aria-label="API 密钥"
                  aria-describedby="ai-api-key-hint"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={apiKey}
                  disabled={busy || clearApiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    resetTests()
                    setValidationErrors((current) => ({ ...current, apiKey: '' }))
                  }}
                  aria-invalid={Boolean(validationErrors.apiKey)}
                  placeholder={apiKeySource === 'admin' ? '已保存密钥；留空保留，输入新密钥即可更换' : '粘贴模型服务商提供的 API 密钥'}
                />
                {validationErrors.apiKey ? <small className="admin-field-error">{validationErrors.apiKey}</small> : null}
                <small id="ai-api-key-hint">新输入的密钥可在保存前测试。留空保留现有密钥；测试不会保存更改。</small>
              </label>
              {apiKeySource === 'admin' ? (
                <label className="admin-model-key-clear full">
                  <input
                    type="checkbox"
                    checked={clearApiKey}
                    disabled={busy}
                    onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(''); resetTests() }}
                  />
                  <span>{environmentApiKeyConfigured ? '移除后台密钥，改用环境密钥（保存后生效）' : '移除后台密钥（请同时停用后台配置，或输入新密钥）'}</span>
                </label>
              ) : null}
            </div>
          </section>

          <section className="admin-panel admin-model-assignment-panel">
            <div className="admin-panel-heading">
              <div><p className="admin-eyebrow">MODEL ROUTING</p><h2>按用途分配模型</h2></div>
              <span className="admin-model-source">
                {source === 'admin' ? <BookOpenCheck size={14} /> : <Zap size={14} />}
                {source === 'admin' ? '后台配置' : '环境默认值'}
              </span>
            </div>
            <div className="admin-model-grid">
              {modelFields.map((field) => {
                const Icon = field.icon
                return (
                  <article className={`admin-model-card tone-${field.tone}`} key={field.key}>
                    <span className="admin-model-card-icon"><Icon size={19} /></span>
                    <span className="admin-model-card-copy">
                      <strong>{field.title}</strong>
                      <small>{field.description}</small>
                    </span>
                    <button
                      className="admin-model-test-button"
                      type="button"
                      disabled={busy || !keyReady}
                      onClick={() => void testConnection(field.key)}
                      aria-label={`测试${field.title}模型`}
                    >
                      {testingSlot === field.key ? <Loader2 className="admin-spin" size={14} /> : <Activity size={14} />}
                      {testingSlot === field.key ? '测试中' : '测试'}
                    </button>
                    <input
                      value={settings[field.key]}
                      disabled={busy}
                      list="ai-model-options"
                      onChange={(event) => updateSetting(field.key, event.target.value)}
                      aria-label={`${field.title}模型`}
                      aria-invalid={Boolean(validationErrors[field.key])}
                    />
                    {validationErrors[field.key] ? <small className="admin-field-error">{validationErrors[field.key]}</small> : null}
                    {testResults[field.key] ? (
                      <small className="admin-model-test-result" role="status">
                        {testResults[field.key]?.capability === 'image-json' ? '图片识别与 JSON' : '流式响应与 JSON'}已通过 · {testResults[field.key]?.latencyMs}ms
                      </small>
                    ) : null}
                    {testErrors[field.key] ? <small className="admin-field-error admin-model-test-error" role="alert">{testErrors[field.key]}</small> : null}
                  </article>
                )
              })}
              <datalist id="ai-model-options">
                <option value="qwen3.5-plus" />
                <option value="qwen3.5-flash" />
                <option value="qwen-plus" />
                <option value="qwen-turbo" />
              </datalist>
            </div>
          </section>

          <section className="admin-settings-savebar admin-model-savebar">
            <div>
              {dirty ? <CircleAlert size={18} /> : <BadgeCheck size={18} />}
              <span>
                <strong>{dirty ? '有尚未保存的更改' : '配置已同步'}</strong>
                <small>{updatedAt ? `上次保存：${formatAdminDate(updatedAt)}` : '当前显示部署环境默认值'}</small>
              </span>
            </div>
            <div className="admin-model-save-actions">
              {dirty ? (
                <button className="admin-secondary-button" type="button" disabled={busy} onClick={revertChanges}>
                  撤销更改
                </button>
              ) : null}
              <button className="admin-primary-button" type="submit" disabled={busy || !dirty}>
                {saving ? <Loader2 className="admin-spin" size={16} /> : <Save size={16} />}
                {saving ? '正在保存' : '保存并应用'}
              </button>
            </div>
          </section>
        </form>
    </main>
  )
}
