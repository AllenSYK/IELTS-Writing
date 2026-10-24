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

type SessionUser = { id: string; email?: string | null; phone?: string | null }

type AuthContextValue = {
  userId: string | null
  status: UserSessionStatus
}

type UserSessionContextValue = AuthContextValue & {
  accountLabel: string | null
  refreshUser: () => Promise<string | null>
  prepareForLogout: () => void
  retryAuth: () => void
}

type UserSessionProviderProps = {
  children: ReactNode
  initialUser?: SessionUser | null
}

const AuthContext = createContext<AuthContextValue | null>(null)
const UserSessionContext = createContext<UserSessionContextValue | null>(null)

const AUTH_LOOKUP_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} 超时（${timeoutMs}ms）`))
    }, timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function UserSessionProvider({ children, initialUser = null }: UserSessionProviderProps) {
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient()
    } catch {
      return null
    }
  }, [])
  const initialUserRef = useRef(initialUser)
  const currentUserIdRef = useRef<string | null>(initialUser?.id ?? null)
  const currentStatusRef = useRef<UserSessionStatus>(initialUser ? 'authenticated' : 'loading')
  const initAttemptRef = useRef(0)
  const [userId, setUserId] = useState<string | null>(initialUser?.id ?? null)
  const [accountLabel, setAccountLabel] = useState<string | null>(
    initialUser ? accountDisplayName(initialUser) : null
  )
  const [status, setStatus] = useState<UserSessionStatus>(initialUser ? 'authenticated' : 'loading')

  const applyUser = useCallback((user: SessionUser | null) => {
    const nextUserId = user?.id ?? null
    const nextStatus: UserSessionStatus = nextUserId ? 'authenticated' : 'unauthenticated'
    if (currentUserIdRef.current === nextUserId && currentStatusRef.current === nextStatus) return
    currentUserIdRef.current = nextUserId
    currentStatusRef.current = nextStatus
    setUserId(nextUserId)
    setAccountLabel(user ? accountDisplayName(user) : null)
    setStatus(nextStatus)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!supabase) {
      if (!initialUserRef.current) applyUser(null)
      return currentUserIdRef.current
    }
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_LOOKUP_TIMEOUT_MS,
        'auth:getUser'
      )
      if (error) throw error
      applyUser(data.user ?? null)
      return data.user?.id ?? null
    } catch {
      // 拉取失败时保留已有身份，避免误判为未登录。
      return currentUserIdRef.current
    }
  }, [applyUser, supabase])

  const prepareForLogout = useCallback(() => {
    const activeUserId = currentUserIdRef.current
    if (activeUserId) clearUserEphemeralBrowserState(activeUserId)
    initialUserRef.current = null
    currentUserIdRef.current = null
    currentStatusRef.current = 'unauthenticated'
    setUserId(null)
    setAccountLabel(null)
    setStatus('unauthenticated')
  }, [])

  const retryAuth = useCallback(() => {
    if (!supabase) {
      applyUser(initialUserRef.current ?? null)
      return
    }
    if (currentStatusRef.current === 'loading') {
      initAttemptRef.current += 1
    }
    void refreshUser()
  }, [applyUser, refreshUser, supabase])

  useEffect(() => {
    if (!supabase) {
      applyUser(initialUserRef.current ?? null)
      return
    }
    // StrictMode 下首次 effect 会被清理：不在此处写入“已初始化”标记，
    // 否则清理后不会再发起查询，状态会永远停在 loading。
    const attempt = ++initAttemptRef.current
    let cancelled = false

    void (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getUser(),
          AUTH_LOOKUP_TIMEOUT_MS,
          'auth:getUser'
        )
        if (cancelled || attempt !== initAttemptRef.current) return
        if (error) throw error
        applyUser(data.user ?? null)
      } catch {
        if (cancelled || attempt !== initAttemptRef.current) return
        if (initialUserRef.current) {
          // 服务端已确认身份：保留该结果，不因客户端查询失败而掉线。
          return
        }
        applyUser(null)
      }
    })()

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
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        applyUser(session?.user ?? null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [applyUser, prepareForLogout, supabase])

  const authValue = useMemo(
    () => ({ userId, status }),
    [userId, status]
  )

  const sessionValue = useMemo(
    () => ({ userId, accountLabel, status, refreshUser, prepareForLogout, retryAuth }),
    [accountLabel, prepareForLogout, refreshUser, retryAuth, status, userId]
  )

  return (
    <AuthContext.Provider value={authValue}>
      <UserSessionContext.Provider value={sessionValue}>
        {children}
      </UserSessionContext.Provider>
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside UserSessionProvider')
  return context
}

export function useUserSession() {
  const context = useContext(UserSessionContext)
  if (!context) throw new Error('useUserSession must be used inside UserSessionProvider')
  return context
}
