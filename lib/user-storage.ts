export const UserStorageSeparator = ':user:'

export function userScopedStorageKey(baseKey: string, userId: string) {
  if (!userId.trim()) throw new Error('A valid authenticated user id is required.')
  return `${baseKey}${UserStorageSeparator}${userId}`
}

export function belongsToUserStorageKey(key: string, userId: string) {
  return key.endsWith(`${UserStorageSeparator}${userId}`)
}

const EphemeralLocalPrefixes = [
  'aerowrite-draft-',
  'aerowrite-timer-',
  'aerowrite-question-cache:',
  'aerowrite-editor-position-',
  'aerowrite-editor-split-',
  'aerowrite-history-filters-v1',
  'aerowrite-analytics-range',
  'aerowrite-result-tab-'
]

const EphemeralSessionPrefixes = [
  'aerowrite-question-cache:',
  'aerowrite-prompt-selection-v1',
  'aerowrite-scroll:'
]

function removeMatchingUserKeys(storage: Storage, userId: string, prefixes: string[]) {
  Object.keys(storage)
    .filter((key) => belongsToUserStorageKey(key, userId) && prefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => storage.removeItem(key))
}

export function clearUserEphemeralBrowserState(userId: string) {
  if (typeof window === 'undefined') return
  removeMatchingUserKeys(window.localStorage, userId, EphemeralLocalPrefixes)
  removeMatchingUserKeys(window.sessionStorage, userId, EphemeralSessionPrefixes)
}

