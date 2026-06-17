type AdminEdgeOptions = {
  request?: Request
}

export class AdminEdgeError extends Error {
  status: number
  code?: string
  data: unknown

  constructor(message: string, status: number, code: string | undefined, data: unknown) {
    super(message)
    this.name = 'AdminEdgeError'
    this.status = status
    this.code = code
    this.data = data
  }
}

export function getAdminFunctionUrl() {
  const explicit = process.env.ADMIN_LICENSE_FUNCTION_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('ADMIN_LICENSE_FUNCTION_URL or NEXT_PUBLIC_SUPABASE_URL must be configured.')
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-license`
}

export async function callAdminFunction<T = unknown>(action: string, payload?: unknown, options: AdminEdgeOptions = {}) {
  const secret = process.env.ADMIN_EDGE_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('ADMIN_EDGE_SECRET must be configured on the server.')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-admin-secret': secret
  }
  const forwardedFor = options.request?.headers.get('x-forwarded-for') || options.request?.headers.get('x-real-ip')
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor

  const response = await fetch(getAdminFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
    cache: 'no-store'
  })
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string }
  if (!response.ok || data.error) {
    throw new AdminEdgeError(data.message || data.error || '管理员请求失败。', response.status, data.error, data)
  }
  return data as T
}
