export type DraftSaveOutcome = 'saved' | 'offline' | 'failed' | 'skipped'

/** Serialize autosaves and explicit saves so an exit waits for its own snapshot. */
export function createDraftSaveQueue() {
  let pending: Promise<unknown> = Promise.resolve()
  return {
    run<T>(save: () => Promise<T>): Promise<T> {
      const result = pending.then(save)
      // A failed request must not prevent subsequent saves or retries.
      pending = result.catch(() => undefined)
      return result
    }
  }
}
