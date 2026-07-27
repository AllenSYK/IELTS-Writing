function forwardedOrigin(request: Request) {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (!host) return null
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https'
  return `${protocol}://${host}`
}

/**
 * 管理端写操作必须来自本站。
 *
 * SameSite Cookie 是第一层保护；这里再校验浏览器提供的 Origin /
 * Sec-Fetch-Site，避免跨站页面触发管理写操作。没有 Origin 的服务端调用
 * 仍可通过，但后续依然必须拥有有效管理员会话。
 */
export function assertTrustedAdminMutationRequest(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new Response('Forbidden', { status: 403 })
  }

  const originHeader = request.headers.get('origin')
  if (!originHeader) return

  let origin: string
  try {
    origin = new URL(originHeader).origin
  } catch {
    throw new Response('Forbidden', { status: 403 })
  }

  const allowedOrigins = new Set([new URL(request.url).origin])
  const proxyOrigin = forwardedOrigin(request)
  if (proxyOrigin) allowedOrigins.add(proxyOrigin)

  if (!allowedOrigins.has(origin)) {
    throw new Response('Forbidden', { status: 403 })
  }
}
