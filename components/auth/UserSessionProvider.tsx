'use client'

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
import { accountDisplayName } from '@/lib/phone-auth'

type UserSessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

type UserSessionContextValue = {
  userId: string | null
  accountLabel: string | null
  status: UserSessionStatus
  refreshUser: () => Promise<string | null>
  prepareForLogout: () => void
}

const UserSessionContext = createContext<UserSessionContextValue | null>(null)

export function UserSessionProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient()
    } catch {
      return null
    }
  }, [])
  const currentUserIdRef = useRef<string | null>(null)
  const hasFetchedRef = useRef(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [accountLabel, setAccountLabel] = useState<string | null>(null)
  const [status, setStatus] = useState<UserSessionStatus>('loading')

  const applyUser = useCallback((user: { id: string; email?: string | null; phone?: string | null } | null) => {
    const nextUserId = user?.id ?? null
    if (currentUserIdRef.current === nextUserId) return
    currentUserIdRef.current = nextUserId
    setUserId(nextUserId)
    setAccountLabel(user ? accountDisplayName(user) : null)
    setStatus(nextUserId ? 'authenticated' : 'unauthenticated')
  }, [])

  const refreshUser = useCallback(async () => {
    if (!supabase) {
      applyUser(null)
      return null
    }
    const { data, error } = await supabase.auth.getUser()
    const user = error ? null : data.user
    applyUser(user ?? null)
    return user?.id ?? null
  }, [applyUser, supabase])

  const prepareForLogout = useCallback(() => {
    const activeUserId = currentUserIdRef.current
    if (activeUserId) clearUserEphemeralBrowserState(activeUserId)
    currentUserIdRef.current = null
    setUserId(null)
    setAccountLabel(null)
    setStatus('unauthenticated')
    hasFetchedRef.current = false
  }, [])

  useEffect(() => {
    if (!supabase) {
      window.queueMicrotask(() => applyUser(null))
      return
    }
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true
    let cancelled = false
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!cancelled) applyUser(error ? null : data.user ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [applyUser, supabase])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        prepareForLogout()
        return
      }
      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        applyUser(session?.user ?? null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [applyUser, prepareForLogout, supabase])

  const value = useMemo(
    () => ({ userId, accountLabel, status, refreshUser, prepareForLogout }),
    [accountLabel, prepareForLogout, refreshUser, status, userId]
  )

  return <UserSessionContext.Provider value={value}>{children}</UserSessionContext.Provider>
}

export function useUserSession() {
  const context = useContext(UserSessionContext)
  if (!context) throw new Error('useUserSession must be used inside UserSessionProvider')
  return context
}
