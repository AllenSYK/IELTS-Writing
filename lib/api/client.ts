export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly retryable: boolean

  constructor(
    message: string,
    status: number,
    code: string = 'api_error',
    options: { requestId?: string; retryable?: boolean } = {}
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = options.requestId
    this.retryable = options.retryable ?? isRetryableStatus(status)
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function safeErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.error === 'string' && obj.error) return obj.error
  }
  return fallback
}

function safeErrorCode(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.code === 'string' && obj.code) return obj.code
    if (typeof obj.error === 'string' && obj.error) return obj.error
  }
  return fallback
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 30000, signal: externalSignal, ...init } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const onExternalAbort = () => controller.abort('external')
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: init.cache ?? 'no-store'
    })

    if (response.status === 204) return undefined as T

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new ApiError(
        safeErrorMessage(payload, `请求失败（${response.status}）`),
        response.status,
        safeErrorCode(payload, 'api_error'),
        { retryable: isRetryableStatus(response.status) }
      )
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) {
        throw new ApiError('请求已取消', 0, 'cancelled', { retryable: false })
      }
      throw new ApiError('请求超时，请稍后重试', 0, 'timeout', { retryable: true })
    }
    throw new ApiError(
      error instanceof Error ? error.message : '网络错误',
      0,
      'network_error',
      { retryable: true }
    )
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number; maxRetries?: number } = {}
): Promise<T> {
  const { maxRetries = 1, ...rest } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchJson<T>(url, rest)
    } catch (error) {
      lastError = error
      if (error instanceof ApiError && !error.retryable) throw error
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 5000)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

export function getSafeErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message || fallback
  return fallback
}
