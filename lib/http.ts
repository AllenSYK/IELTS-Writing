import { ZodError } from 'zod'

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...(init?.headers || {})
    }
  })
}

export function apiError(error: unknown, fallback = '请求失败。') {
  if (error instanceof Response) {
    return error
  }
  if (error instanceof ZodError) {
    return json({ error: 'invalid_input', details: error.flatten() }, { status: 400 })
  }
  if (error instanceof Error && error.name === 'AdminEdgeError') {
    const status = typeof (error as Error & { status?: unknown }).status === 'number' ? (error as Error & { status: number }).status : 502
    const data = (error as Error & { data?: unknown }).data
    return json(typeof data === 'object' && data !== null ? data : { error: 'admin_edge_error', message: error.message }, { status: status >= 400 ? status : 502 })
  }
  if (error instanceof Error) {
    console.error('[api-error]', error.name, error.message)
    const status = error.message.includes('Supabase service configuration') ? 503 : 500
    return json({ error: 'server_error', message: status === 500 ? fallback : error.message }, { status })
  }
  console.error('[api-error]', error)
  return json({ error: 'server_error', message: fallback }, { status: 500 })
}
