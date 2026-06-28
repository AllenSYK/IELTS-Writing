export class AdminApiError extends Error {
  status: number
  code?: string
  requestId?: string
  retryable: boolean

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryable = status >= 500 || status === 429
  }
}

/**
 * 生成请求ID
 * 
 * 格式: 时间戳-随机数，便于调试和追踪
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}`
}

/**
 * 管理端 API 统一 fetcher
 * 
 * 错误处理策略：
 * 1. 无网络 → 提示检查网络
 * 2. 超时 → 提示稍后重试
 * 3. 401 → 跳转登录
 * 4. 403 → 权限不足
 * 5. 404 → 资源不存在
 * 6. 409 → 数据冲突
 * 7. 429 → 稍后重试
 * 8. 500 → 服务器错误
 * 9. 非 JSON → 提示服务器异常
 * 10. 204 → 返回空数据
 */
export async function adminJsonFetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const requestId = generateRequestId()
  
  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...init?.headers,
      },
      ...init,
    })
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new AdminApiError('网络连接失败，请检查网络后重试。', 0, 'NETWORK_ERROR', requestId)
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AdminApiError('请求已取消。', 0, 'ABORTED', requestId)
    }
    throw new AdminApiError('请求失败，请稍后重试。', 0, 'UNKNOWN', requestId)
  }

  // 从响应头获取服务端生成的 requestId
  const serverRequestId = response.headers.get('X-Request-Id') || requestId

  // 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  // 尝试解析 JSON
  let data: Record<string, unknown>
  try {
    data = await response.json() as Record<string, unknown>
  } catch {
    // 非 JSON 响应（如 HTML 错误页）
    throw new AdminApiError(
      '服务器返回了无效的数据格式。',
      response.status,
      'INVALID_RESPONSE',
      serverRequestId
    )
  }

  // 成功响应但业务失败
  if (!response.ok || data.success === false) {
    const message = getErrorMessage(response.status, data.message as string | undefined)
    throw new AdminApiError(
      message, 
      response.status, 
      data.code as string | undefined, 
      (data.requestId as string) || serverRequestId
    )
  }

  // 在响应数据中附加 requestId 以便追踪
  if (typeof data === 'object' && data !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)._requestId = serverRequestId
  }

  return data as unknown as T
}

/**
 * 根据状态码生成用户友好的错误信息
 */
function getErrorMessage(status: number, serverMessage?: string): string {
  if (serverMessage && status < 500) {
    return serverMessage
  }
  
  switch (status) {
    case 400:
      return '请求参数错误，请检查输入。'
    case 401:
      return '登录已过期，请重新登录。'
    case 403:
      return '权限不足，无法执行此操作。'
    case 404:
      return '请求的资源不存在。'
    case 409:
      return '数据冲突，请刷新后重试。'
    case 429:
      return '请求过于频繁，请稍后重试。'
    case 500:
    case 502:
    case 503:
    case 504:
      return '服务器繁忙，请稍后重试。'
    default:
      return '操作失败，请稍后重试。'
  }
}

/**
 * 管理端通用 POST/PUT/PATCH/DELETE 请求
 * 
 * 自动处理错误和 JSON 解析
 * 支持 requestId 全链路追踪
 */
export async function adminApiRequest<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal,
  requestId?: string
): Promise<T> {
  const reqId = requestId || generateRequestId()
  
  return adminJsonFetcher<T>(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    signal,
    headers: {
      'X-Request-Id': reqId,
    },
  })
}

/**
 * 带审计的管理 API 请求
 * 
 * 在请求完成后自动记录审计日志
 * 审计日志由服务端 API 处理，这里只确保 requestId 被传递
 */
export async function adminApiRequestWithAudit<T>(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  signal?: AbortSignal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _auditInfo?: {
    action: string
    resourceType: string
    resourceId?: string
  }
): Promise<T> {
  const requestId = generateRequestId()
  
  try {
    const result = await adminApiRequest<T>(url, method, body, signal, requestId)
    return result
  } catch (error) {
    // 错误时也确保 requestId 被记录
    if (error instanceof AdminApiError) {
      error.requestId = requestId
    }
    throw error
  }
}
