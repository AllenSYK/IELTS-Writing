export const UserStorageSeparator = ':user:'
const CurrentStoragePrefix = 'ielts-writing'
const LegacyStoragePrefix = 'aerowrite'

function legacyKeyFor(key: string) {
  return key.startsWith(CurrentStoragePrefix)
    ? `${LegacyStoragePrefix}${key.slice(CurrentStoragePrefix.length)}`
    : null
}

export function readStorageValue(storage: Storage, key: string) {
  const current = storage.getItem(key)
  if (current !== null) return current

  const legacyKey = legacyKeyFor(key)
  if (!legacyKey) return null
  const legacy = storage.getItem(legacyKey)
  if (legacy !== null) storage.setItem(key, legacy)
  return legacy
}

export function removeStorageValue(storage: Storage, key: string) {
  storage.removeItem(key)
  const legacyKey = legacyKeyFor(key)
  if (legacyKey) storage.removeItem(legacyKey)
}

export function userScopedStorageKey(baseKey: string, userId: string) {
  if (!userId.trim()) throw new Error('A valid authenticated user id is required.')
  const key = `${baseKey}${UserStorageSeparator}${userId}`
  if (typeof window !== 'undefined') {
    readStorageValue(window.localStorage, key)
    readStorageValue(window.sessionStorage, key)
  }
  return key
}

export function belongsToUserStorageKey(key: string, userId: string) {
  return key.endsWith(`${UserStorageSeparator}${userId}`)
}

const EphemeralLocalPrefixes = [
  'ielts-writing-draft-',
  'ielts-writing-timer-',
  'ielts-writing-question-cache:',
  'ielts-writing-editor-position-',
  'ielts-writing-editor-split-',
  'ielts-writing-history-filters-v1',
  'ielts-writing-analytics-range',
  'ielts-writing-result-tab-'
]

const EphemeralSessionPrefixes = [
  'ielts-writing-question-cache:',
  'ielts-writing-analytics-cache',
  'ielts-writing-prompt-selection-v1',
  'ielts-writing-scroll:'
]

function removeMatchingUserKeys(storage: Storage, userId: string, prefixes: string[]) {
  Object.keys(storage)
    .filter((key) => belongsToUserStorageKey(key, userId) && prefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => removeStorageValue(storage, key))
}

export function clearUserEphemeralBrowserState(userId: string) {
  if (typeof window === 'undefined') return
  removeMatchingUserKeys(window.localStorage, userId, EphemeralLocalPrefixes)
  removeMatchingUserKeys(window.sessionStorage, userId, EphemeralSessionPrefixes)
}
