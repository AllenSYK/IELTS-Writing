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
  DEFAULT_AI_MODEL_SETTINGS,
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
}

type ModelTestResponse = {
  success: true
  latencyMs: number
  model: string
  slot: AiModelSlot
}

const MODEL_ERROR_MESSAGES: Record<string, string> = {
  AI_KEY_MISSING: '服务端尚未配置 AI_API_KEY，请在 Vercel 环境变量中配置。',
  ai_api_key_invalid: '服务端 API Key 无效，请检查 Vercel 环境变量 AI_API_KEY。',
  ai_model_or_endpoint_invalid: '模型名称或 API Base URL 不正确。',
  ai_quota_exhausted: '模型服务额度已耗尽，请充值或更换有额度的 API Key。',
  ai_rate_limited: '请求过于频繁，请稍后重试。',
  ai_request_timeout: '模型响应超时，请稍后重试或更换模型。',
  ai_network_error: '无法连接模型服务，请检查 API Base URL。',
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
  const { pushToast } = useToast()
  const [settings, setSettings] = useState<AiModelSettings>(DEFAULT_AI_MODEL_SETTINGS)
  const [savedSettings, setSavedSettings] = useState<AiModelSettings>(DEFAULT_AI_MODEL_SETTINGS)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [source, setSource] = useState<'admin' | 'environment'>('environment')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [testResult, setTestResult] = useState<{ latencyMs: number; model: string; slot: AiModelSlot } | null>(null)
  const [testingSlot, setTestingSlot] = useState<AiModelSlot | null>(null)

  const { error, isLoading, mutate } = useSWR<ModelsResponse>(
    ADMIN_CACHE_KEYS.MODELS,
    adminJsonFetcher,
    {
      dedupingInterval: 30_000,
      onSuccess(data) {
        setSettings(data.settings)
        setSavedSettings(data.settings)
        setUpdatedAt(data.updatedAt)
        setSource(data.source)
        setApiKeyConfigured(data.apiKeyConfigured)
      }
    }
  )

  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  function validate() {
    const parsed = AiModelSettingsSchema.safeParse(settings)
    if (parsed.success) {
      setValidationErrors({})
      return true
    }

    const errors: Record<string, string> = {}
    parsed.error.issues.forEach((issue) => {
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
        mutate(data, { revalidate: false })
        pushToast({ kind: 'success', title: '模型配置已保存，新的 AI 请求将立即使用当前配置' })
      },
      onError(error) {
        if (error instanceof Error && error.message === 'VALIDATION_FAILED') return
        pushToast({
          kind: 'error',
          title: '模型配置保存失败',
          message: modelErrorMessage(error, '请稍后重试。')
        })
      },
      revalidate: false
    }
  )

  const { trigger: testConnection, isMutating: testing } = useSWRMutation(
    '/api/admin/models/test',
    async (_key, { arg: slot }: { arg: AiModelSlot }) => {
      if (!validate()) throw new Error('VALIDATION_FAILED')
      setTestingSlot(slot)
      return adminApiRequest<ModelTestResponse>(
        '/api/admin/models/test',
        'POST',
        { settings, slot }
      )
    },
    {
      onSuccess(data) {
        setTestingSlot(null)
        setTestResult({ latencyMs: data.latencyMs, model: data.model, slot: data.slot })
        const visionOnlyNote = data.slot === 'visionModel' || data.slot === 'visionFallbackModel'
          ? '仅测试接口与模型可访问性，未验证图片输入能力。'
          : undefined
        pushToast({
          kind: 'success',
          title: `模型连接正常：${data.model} · ${data.latencyMs}ms`,
          message: visionOnlyNote
        })
      },
      onError(error) {
        setTestingSlot(null)
        if (error instanceof Error && error.message === 'VALIDATION_FAILED') return
        setTestResult(null)
        pushToast({
          kind: 'error',
          title: '连接测试失败',
          message: modelErrorMessage(error, '请检查接口地址、模型名称和服务端密钥。')
        })
      }
    }
  )

  function updateSetting<K extends keyof AiModelSettings>(key: K, value: AiModelSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
    setTestResult(null)
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
    if (!saving) void saveModels()
  }

  function revertChanges() {
    setSettings(savedSettings)
    setValidationErrors({})
    setTestResult(null)
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="AI CONTROL CENTER"
        title="模型配置"
        description="按业务用途分配模型，保存后新的 AI 请求会立即使用当前配置。密钥始终保留在服务端。"
        actions={(
          <button
            className="admin-secondary-button"
            type="button"
            disabled={testing || isLoading || !apiKeyConfigured}
            onClick={() => void testConnection('gradingModel')}
          >
            {testing ? <Loader2 className="admin-spin" size={16} /> : <Activity size={16} />}
            {testing ? '正在测试' : '测试批改模型'}
          </button>
        )}
      />

      {error && !isLoading ? (
        <AdminError
          message={error instanceof AdminApiError ? error.message : '无法加载模型配置。'}
          onRetry={() => void mutate()}
        />
      ) : null}

      {isLoading ? <AdminTableSkeleton columns={3} rows={5} /> : (
        <form className="admin-models-layout" onSubmit={handleSubmit}>
          <section className="admin-model-status-grid" aria-label="模型配置状态">
            <article className="admin-model-status-card">
              <span className={settings.enabled ? 'is-good' : 'is-muted'}><BrainCircuit size={20} /></span>
              <div><small>运行状态</small><strong>{settings.enabled ? '后台配置已启用' : '使用环境变量'}</strong></div>
            </article>
            <article className="admin-model-status-card">
              <span className={apiKeyConfigured ? 'is-good' : 'is-warning'}><KeyRound size={20} /></span>
              <div><small>服务端密钥</small><strong>{apiKeyConfigured ? '已安全配置' : '尚未配置'}</strong></div>
            </article>
            <article className="admin-model-status-card">
              <span className={testResult ? 'is-good' : 'is-muted'}><BadgeCheck size={20} /></span>
              <div><small>连接状态</small><strong>{testResult ? `${testResult.model} · ${testResult.latencyMs}ms` : '等待测试'}</strong></div>
            </article>
          </section>

          {!apiKeyConfigured ? (
            <div className="admin-model-notice warning" role="status">
              <CircleAlert size={18} />
              <div><strong>需要先配置服务端密钥</strong><span>请在部署环境中设置 AI_API_KEY；后台不会显示、传输或保存密钥明文。</span></div>
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
                  onChange={(event) => updateSetting('baseUrl', event.target.value)}
                  aria-invalid={Boolean(validationErrors.baseUrl)}
                  placeholder="https://.../v1"
                />
                {validationErrors.baseUrl ? <small className="admin-field-error">{validationErrors.baseUrl}</small> : null}
              </label>
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
                      disabled={testing || !apiKeyConfigured}
                      onClick={() => void testConnection(field.key)}
                      aria-label={`测试${field.title}模型`}
                    >
                      {testingSlot === field.key ? <Loader2 className="admin-spin" size={14} /> : <Activity size={14} />}
                      {testingSlot === field.key ? '测试中' : '测试'}
                    </button>
                    <input
                      value={settings[field.key]}
                      list="ai-model-options"
                      onChange={(event) => updateSetting(field.key, event.target.value)}
                      aria-label={`${field.title}模型`}
                      aria-invalid={Boolean(validationErrors[field.key])}
                    />
                    {validationErrors[field.key] ? <small className="admin-field-error">{validationErrors[field.key]}</small> : null}
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
                <button className="admin-secondary-button" type="button" onClick={revertChanges}>
                  撤销更改
                </button>
              ) : null}
              <button className="admin-primary-button" type="submit" disabled={saving || !dirty}>
                {saving ? <Loader2 className="admin-spin" size={16} /> : <Save size={16} />}
                {saving ? '正在保存' : '保存并应用'}
              </button>
            </div>
          </section>
        </form>
      )}
    </main>
  )
}
