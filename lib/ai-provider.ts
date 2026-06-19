import { z } from 'zod'
import { measureGradingStage } from '@/lib/grading-performance'

export type AiConfig = {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

export type AiMessage = {
  role: 'system' | 'user'
  content: string
}

type CompletionOptions = {
  maxTokens: number
  requestId: string
  stage?: string
  responseFormat?: { type: 'json_object' }
}

const ProviderDefaults: Record<string, Pick<AiConfig, 'baseUrl' | 'model'>> = {
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  }
}

const DEFAULT_AI_TIMEOUT_MS = 240_000

const StreamChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().optional()
    }).passthrough(),
    finish_reason: z.string().nullable().optional()
  }).passthrough()).min(1)
}).passthrough()

export class AiConfigurationError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(`Missing AI configuration: ${missing.join(', ')}`)
    this.name = 'AiConfigurationError'
    this.missing = missing
  }
}

export class AiProviderError extends Error {
  readonly status?: number
  readonly code: string

  constructor(message: string, status?: number, code = 'ai_provider_failed') {
    super(message)
    this.name = 'AiProviderError'
    this.status = status
    this.code = code
  }
}

export class AiResponseError extends AiProviderError {
  readonly details?: string

  constructor(message: string, code: string, details?: string) {
    super(message, undefined, code)
    this.name = 'AiResponseError'
    this.details = details
  }
}

export function apiStatusForAiError(error: AiProviderError) {
  if (error.code === 'ai_rate_limited') return 429
  if (error.code === 'ai_request_timeout') return 504
  return 502
}

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
}

export function getAiConfig({
  modelEnv = 'AI_MODEL',
  defaultModel
}: {
  modelEnv?: string
  defaultModel?: string
} = {}): AiConfig {
  const provider = env('AI_PROVIDER') || 'qwen'
  const defaults = ProviderDefaults[provider.toLowerCase()]
  const apiKey = env('AI_API_KEY')
  const baseUrl = env('AI_BASE_URL') || defaults?.baseUrl || ''
  const model = env(modelEnv) || defaultModel || defaults?.model || ''
  const missing = [
    !apiKey ? 'AI_API_KEY' : '',
    !baseUrl ? 'AI_BASE_URL' : '',
    !model ? 'AI_MODEL' : ''
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new AiConfigurationError(missing)
  }

  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    model
  }
}

export function getGradingAiConfig() {
  return getAiConfig({
    modelEnv: 'QWEN_GRADING_MODEL',
    defaultModel: 'qwen3.5-plus'
  })
}

export function createAiRequestId(prefix: 'eval' | 'gen') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function configuredTimeoutMs() {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS)
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_AI_TIMEOUT_MS
}

function providerHttpError(status: number) {
  if (status === 401) {
    return new AiProviderError('API Key错误：请检查 AI_API_KEY。', status, 'ai_api_key_invalid')
  }
  if (status === 404) {
    return new AiProviderError('模型或接口地址错误：请检查 AI_MODEL 和 AI_BASE_URL。', status, 'ai_model_or_endpoint_invalid')
  }
  if (status === 429) {
    return new AiProviderError('请求过于频繁，请稍后重试。', status, 'ai_rate_limited')
  }
  if (status >= 500) {
    return new AiProviderError(`AI 服务暂时不可用 (HTTP ${status})，请稍后重试。`, status, 'ai_server_error')
  }
  return new AiProviderError(`AI 服务返回 HTTP ${status} 错误。`, status, 'ai_http_error')
}

function readStreamChunk(data: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const chunk = StreamChunkSchema.safeParse(parsed)
  return chunk.success ? chunk.data : null
}

export async function fetchAiCompletion(
  config: AiConfig,
  messages: AiMessage[],
  options: CompletionOptions
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), configuredTimeoutMs())

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        enable_thinking: false,
        temperature: 0.2,
        max_tokens: options.maxTokens,
        stream: true,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {})
      })
    })

    if (!response.ok) {
      throw providerHttpError(response.status)
    }
    if (!response.body) {
      throw new AiProviderError('AI 服务未返回流式响应。', undefined, 'ai_no_stream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''
    let malformedChunkCount = 0
    let finishReason: string | undefined

    const consumeLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) return
      const data = trimmed.slice(6)
      if (!data || data === '[DONE]') return

      const chunk = readStreamChunk(data)
      if (!chunk) {
        malformedChunkCount += 1
        return
      }
      const choice = chunk.choices[0]
      if (choice.delta.content) fullContent += choice.delta.content
      if (choice.finish_reason && !finishReason) finishReason = choice.finish_reason
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      lines.forEach(consumeLine)
    }

    buffer += decoder.decode()
    if (buffer.trim()) consumeLine(buffer)

    if (malformedChunkCount > 0) {
      console.warn('[ai-stream-invalid]', {
        requestId: options.requestId,
        malformedChunkCount,
        finishReason: finishReason ?? null
      })
    }
    if (!fullContent.trim()) {
      throw new AiProviderError('AI 服务返回空内容。', undefined, 'ai_empty_response')
    }

    return fullContent.trim()
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('AI服务响应时间过长，本次请求已停止，请稍后重试。', undefined, 'ai_request_timeout')
    }
    if (error instanceof TypeError) {
      throw new AiProviderError('网络错误：无法连接 AI 服务，请检查网络或 AI_BASE_URL。', undefined, 'ai_network_error')
    }
    throw new AiProviderError('AI 请求失败：请稍后重试。', undefined, 'ai_provider_failed')
  } finally {
    clearTimeout(timeoutId)
  }
}

function stripMarkdownCodeFence(text: string) {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/)
  return (fenced ? fenced[1] : trimmed).trim()
}

function extractJsonObject(text: string) {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  return firstBrace >= 0 && lastBrace > firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : null
}

function parseCandidate(candidate: string) {
  return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as unknown
}

export function parseAiJsonObject(text: string) {
  const cleaned = stripMarkdownCodeFence(text)
  try {
    return parseCandidate(cleaned)
  } catch {
    const extracted = extractJsonObject(cleaned)
    if (extracted && extracted !== cleaned) {
      try {
        return parseCandidate(extracted)
      } catch {
        // The caller retries validated model output once; speculative repair would hide invalid data.
      }
    }
  }

  throw new AiResponseError(
    '批改结果格式异常，内容已保留。你可以重新请求。',
    'ai_json_parse_error'
  )
}

export async function requestValidatedJson<T>({
  config,
  messages,
  maxTokens,
  requestId,
  stage = 'completion',
  validate
}: {
  config: AiConfig
  messages: AiMessage[]
  maxTokens: number
  requestId: string
  stage?: string
  validate: (value: unknown) => T
}) {
  let validationError: AiResponseError | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestMessages = attempt === 0
      ? messages
      : [
          ...messages,
          {
            role: 'user' as const,
            content: [
              'The previous JSON did not pass server validation.',
              validationError?.details ? `Validation errors: ${validationError.details}` : '',
              'Return one corrected JSON object only, without markdown or commentary.'
            ].filter(Boolean).join('\n')
          }
        ]

    try {
      const text = await measureGradingStage({
        requestId,
        model: config.model,
        stage,
        attempt: attempt + 1,
        run: () => fetchAiCompletion(config, requestMessages, {
          maxTokens,
          requestId,
          stage,
          responseFormat: { type: 'json_object' }
        })
      })
      return validate(parseAiJsonObject(text))
    } catch (error) {
      if (attempt === 1 || !(error instanceof AiResponseError)) throw error
      validationError = error
    }
  }

  throw new AiResponseError('AI 返回数据验证失败。', 'ai_response_validation_failed')
}
