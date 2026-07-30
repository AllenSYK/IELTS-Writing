type Listener = () => void

let isNavigating = false
const listeners = new Set<Listener>()
let safetyTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  // Use queueMicrotask to avoid synchronous state updates during click handlers
  window.queueMicrotask(() => {
    listeners.forEach((listener) => listener())
  })
}

export const navigationEvents = {
  start() {
    if (isNavigating) return
    isNavigating = true
    notify()
    // Safety: auto-complete after 10s if complete() never fires
    if (safetyTimer) clearTimeout(safetyTimer)
    safetyTimer = setTimeout(() => {
      if (isNavigating) {
        isNavigating = false
        notify()
      }
    }, 10000)
  },
  complete() {
    if (!isNavigating) return
    isNavigating = false
    if (safetyTimer) {
      clearTimeout(safetyTimer)
      safetyTimer = null
    }
    notify()
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getIsNavigating() {
    return isNavigating
  }
}
