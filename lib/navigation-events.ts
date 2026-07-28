type Listener = () => void

let isNavigating = false
const listeners = new Set<Listener>()

export const navigationEvents = {
  start() {
    if (isNavigating) return
    isNavigating = true
    listeners.forEach((listener) => listener())
  },
  
  complete() {
    if (!isNavigating) return
    isNavigating = false
    listeners.forEach((listener) => listener())
  },
  
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  
  getIsNavigating() {
    return isNavigating
  }
}
