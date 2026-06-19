'use client'

import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { clearUserEphemeralBrowserState } from '@/lib/user-storage'

type UserSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

type UserSessionContextValue = {
  userId: string | null
  status: UserSessionStatus
  refreshUser: () => Promise<string | null>
  prepareForLogout: () => void
}

const UserSessionContext = createContext<UserSessionContextValue | null>(null)

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient()
    } catch {
      return null
    }
  }, [])
  const currentUserIdRef = useRef<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<UserSessionStatus>('loading')

  const applyUserId = useCallback((nextUserId: string | null) => {
    currentUserIdRef.current = nextUserId
    setUserId(nextUserId)
    setStatus(nextUserId ? 'authenticated' : 'unauthenticated')
  }, [])

  const refreshUser = useCallback(async () => {
    if (!supabase) {
      applyUserId(null)
      return null
    }
    const { data, error } = await supabase.auth.getUser()
    const nextUserId = error ? null : data.user?.id ?? null
    applyUserId(nextUserId)
    return nextUserId
  }, [applyUserId, supabase])

  const prepareForLogout = useCallback(() => {
    const activeUserId = currentUserIdRef.current
    if (activeUserId) clearUserEphemeralBrowserState(activeUserId)
    applyUserId(null)
  }, [applyUserId])

  useEffect(() => {
    if (!supabase) {
      window.queueMicrotask(() => applyUserId(null))
      return
    }
    let cancelled = false
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!cancelled) applyUserId(error ? null : data.user?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [applyUserId, pathname, supabase])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        prepareForLogout()
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void refreshUser()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [prepareForLogout, refreshUser, supabase])

  const value = useMemo(
    () => ({ userId, status, refreshUser, prepareForLogout }),
    [prepareForLogout, refreshUser, status, userId]
  )

  return <UserSessionContext.Provider value={value}>{children}</UserSessionContext.Provider>
}

export function useUserSession() {
  const context = useContext(UserSessionContext)
  if (!context) throw new Error('useUserSession must be used inside UserSessionProvider')
  return context
}
