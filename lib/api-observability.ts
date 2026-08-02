import { json } from '@/lib/http'

type TimingName =
  | 'auth'
  | 'profile'
  | 'activation'
  | 'license'
  | 'plan'
  | 'quota'
  | 'tasks'
  | 'database'
  | 'total'
  | (string & {})

function roundedDuration(value: number) {
  return Math.max(0, Math.round(value * 10) / 10)
}

const DatabasePhaseNames = new Set<TimingName>(['profile', 'activation', 'plan', 'quota', 'tasks'])

function requestIdentifier(request?: Request) {
  return request?.headers.get('x-request-id')?.trim() || crypto.randomUUID()
}

export type ApiObservation = ReturnType<typeof createApiObservation>

export function createApiObservation(route: string, request?: Request) {
  const requestId = requestIdentifier(request)
  const startedAt = performance.now()
  const timings = new Map<TimingName, number>()
  let finished = false

  function record(name: TimingName, durationMs: number) {
    timings.set(name, roundedDuration((timings.get(name) ?? 0) + durationMs))
  }

  function recordSince(name: TimingName, phaseStartedAt: number) {
    record(name, performance.now() - phaseStartedAt)
  }

  async function time<T>(name: TimingName, task: () => PromiseLike<T>): Promise<T> {
    const phaseStartedAt = performance.now()
    try {
      return await task()
    } finally {
      const durationMs = performance.now() - phaseStartedAt
      record(name, durationMs)
      if (DatabasePhaseNames.has(name)) record('database', durationMs)
    }
  }

  function serverTimingValue(totalDurationMs: number) {
    const entries = [...timings.entries()]
      .filter(([name]) => name !== 'total')
      .map(([name, duration]) => `${name};dur=${duration}`)
    entries.push(`total;dur=${roundedDuration(totalDurationMs)}`)
    return entries.join(', ')
  }

  function finish(response: Response) {
    if (finished) return response
    finished = true
    const totalDurationMs = performance.now() - startedAt
    const total = roundedDuration(totalDurationMs)
    const authDurationMs = roundedDuration(timings.get('auth') ?? 0)
    const databaseDurationMs = roundedDuration(timings.get('database') ?? 0)
    response.headers.set('Server-Timing', serverTimingValue(totalDurationMs))
    response.headers.set('X-Request-Id', requestId)
    console.info('[api-performance]', {
      route,
      requestId,
      region: process.env.VERCEL_REGION || 'local',
      status: response.status,
      totalDurationMs: total,
      authDurationMs,
      databaseDurationMs,
      timings: Object.fromEntries(timings)
    })
    return response
  }

  function respond(data: unknown, init?: ResponseInit) {
    return finish(json(data, init))
  }

  return {
    requestId,
    record,
    recordSince,
    time,
    finish,
    respond
  }
}
