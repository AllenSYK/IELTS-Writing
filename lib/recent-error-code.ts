export type RecentErrorCodeEntry = {
  code: string
  context: string
  errorName: string
  at: number
}

const StorageKey = 'ielts-writing-recent-error-codes-v1'
const MaxEntries = 5
export const RecentErrorCodesChangedEvent = 'ielts-writing-recent-error-codes-changed'

function readEntries(): RecentErrorCodeEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(StorageKey) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is RecentErrorCodeEntry => {
        if (!item || typeof item !== 'object') return false
        const entry = item as Partial<RecentErrorCodeEntry>
        return typeof entry.code === 'string' && typeof entry.at === 'number'
      })
      .slice(0, MaxEntries)
  } catch {
    return []
  }
}

export function recordRecentErrorCode(context: string, errorName = 'unknown') {
  if (typeof window === 'undefined') return
  try {
    const code = `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const entry: RecentErrorCodeEntry = {
      code,
      context,
      errorName,
      at: Date.now()
    }
    const next = [entry, ...readEntries()].slice(0, MaxEntries)
    window.localStorage.setItem(StorageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(RecentErrorCodesChangedEvent))
  } catch {
    // 存储不可用时静默跳过，不影响主流程。
  }
}

export function readRecentErrorCodes(): RecentErrorCodeEntry[] {
  return readEntries()
}
