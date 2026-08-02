export function createFetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController()
    const upstreamSignal = init?.signal
    const forwardAbort = () => controller.abort(upstreamSignal?.reason)

    if (upstreamSignal?.aborted) {
      forwardAbort()
    } else {
      upstreamSignal?.addEventListener('abort', forwardAbort, { once: true })
    }

    const timer = setTimeout(() => {
      controller.abort(new DOMException('Request timed out', 'AbortError'))
    }, timeoutMs)

    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      upstreamSignal?.removeEventListener('abort', forwardAbort)
    }
  }
}
