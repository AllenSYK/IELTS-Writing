export function createSingleFlight() {
  let inFlight = false

  return async function runSingleFlight<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (inFlight) return undefined

    inFlight = true
    try {
      return await operation()
    } finally {
      inFlight = false
    }
  }
}
