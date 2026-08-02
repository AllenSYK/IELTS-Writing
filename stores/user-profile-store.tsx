'use client'

import {
  DefaultUserProfile,
  loadUserProfile,
  saveUserProfile,
  type UserProfile
} from '@/lib/user-profile'
import { useAuth } from '@/components/auth/UserSessionProvider'
import { userScopedStorageKey } from '@/lib/user-storage'
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

type ServerProfile = {
  displayName: string | null
  email: string | null
  manualAverageScore: number | null
}

type UserProfileContextValue = {
  profile: UserProfile
  displayName: string
  email: string | null
  manualAverageScore: number | null
  displayNameLoading: boolean
  ensureServerProfile: () => Promise<ServerProfile | null>
  saveProfile: (profile: UserProfile) => Promise<UserProfile>
  updateDisplayName: (name: string) => Promise<void>
  updateManualAverageScore: (score: number | null) => Promise<void>
  reloadProfile: () => void
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

const DEFAULT_DISPLAY_NAME = '雅思追梦人'

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const [profile, setProfile] = useState<UserProfile>(DefaultUserProfile)
  const [serverDisplayName, setServerDisplayName] = useState<string | null>(null)
  const [serverEmail, setServerEmail] = useState<string | null>(null)
  const [manualAverageScore, setManualAverageScore] = useState<number | null>(null)
  const [serverLoading, setServerLoading] = useState(false)
  const activeUserIdRef = useRef(userId)
  const fetchedUserIdRef = useRef<string | null>(null)
  const serverProfileRef = useRef<ServerProfile | null>(null)
  const requestRef = useRef<{ userId: string; promise: Promise<ServerProfile | null> } | null>(null)

  // Reset fetch state on userId change
  useEffect(() => {
    activeUserIdRef.current = userId
    fetchedUserIdRef.current = null
    serverProfileRef.current = null
    requestRef.current = null
    window.queueMicrotask(() => {
      setServerLoading(false)
      setServerDisplayName(null)
      setServerEmail(null)
      setManualAverageScore(null)
    })
  }, [userId])

  // Load local profile fields from localStorage
  useEffect(() => {
    let cancelled = false
    if (!userId) {
      window.queueMicrotask(() => {
        if (!cancelled) {
          setProfile(DefaultUserProfile)
        }
      })
      return () => { cancelled = true }
    }
    window.queueMicrotask(() => {
      if (!cancelled) setProfile(loadUserProfile(userId))
    })

    // Cross-tab sync for local profile fields
    const storageKey = userScopedStorageKey('ielts-writing-user-profile-v1', userId)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setProfile(loadUserProfile(userId))
      }
    }
    const handleProfileEvent = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null
      if (detail?.userId !== userId) return
      setProfile(detail.profile && typeof detail.profile === 'object' ? (detail.profile as UserProfile) : loadUserProfile(userId))
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('ielts-writing:user-profile-updated', handleProfileEvent)
    return () => {
      cancelled = true
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('ielts-writing:user-profile-updated', handleProfileEvent)
    }
  }, [userId])

  const ensureServerProfile = useCallback(async (): Promise<ServerProfile | null> => {
    const requestedUserId = userId
    if (!requestedUserId) return null
    if (fetchedUserIdRef.current === requestedUserId) return serverProfileRef.current
    if (requestRef.current?.userId === requestedUserId) return requestRef.current.promise

    setServerLoading(true)
    const promise = (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        if (!res.ok) return null
        const data = await res.json() as { success?: boolean; profile?: ServerProfile }
        if (!data.success || !data.profile) return null

        fetchedUserIdRef.current = requestedUserId
        serverProfileRef.current = data.profile
        if (activeUserIdRef.current !== requestedUserId) return data.profile

        setServerDisplayName(data.profile.displayName)
        setServerEmail(data.profile.email)
        setManualAverageScore(data.profile.manualAverageScore)

        if (data.profile.displayName !== null) {
          const cached = loadUserProfile(requestedUserId)
          if (cached.fullName !== data.profile.displayName) {
            saveUserProfile(requestedUserId, { ...cached, fullName: data.profile.displayName })
            setProfile(loadUserProfile(requestedUserId))
          }
        }
        return data.profile
      } catch {
        return null
      } finally {
        if (activeUserIdRef.current === requestedUserId) setServerLoading(false)
        if (requestRef.current?.userId === requestedUserId) requestRef.current = null
      }
    })()

    requestRef.current = { userId: requestedUserId, promise }
    return promise
  }, [userId])

  // The merged displayName: server > localStorage > default
  const displayName = serverDisplayName ?? (profile.fullName?.trim() || DEFAULT_DISPLAY_NAME)
  const displayNameLoading = serverLoading

  const saveProfile = useCallback(async (nextProfile: UserProfile) => {
    if (!userId) return DefaultUserProfile
    const saved = saveUserProfile(userId, nextProfile)
    setProfile(saved)
    return saved
  }, [userId])

  const updateDisplayName = useCallback(async (name: string) => {
    if (!userId) throw new Error('未登录')
    const trimmed = name.trim()
    if (!trimmed) throw new Error('昵称不能为空')
    if (trimmed.length > 20) throw new Error('昵称不能超过 20 个字符')

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: trimmed })
    })
    const data = await res.json() as { success?: boolean; profile?: ServerProfile; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || '保存失败')
    }

    // Update server state
    const nextServerProfile: ServerProfile = {
      displayName: data.profile?.displayName ?? trimmed,
      email: data.profile?.email ?? serverProfileRef.current?.email ?? null,
      manualAverageScore: data.profile?.manualAverageScore ?? serverProfileRef.current?.manualAverageScore ?? null
    }
    fetchedUserIdRef.current = userId
    serverProfileRef.current = nextServerProfile
    setServerDisplayName(nextServerProfile.displayName)
    if (nextServerProfile.email) setServerEmail(nextServerProfile.email)

    // Sync to localStorage cache
    const cached = loadUserProfile(userId)
    const updated = { ...cached, fullName: data.profile?.displayName ?? trimmed }
    saveUserProfile(userId, updated)
    setProfile(updated)
  }, [userId])

  const updateManualAverageScore = useCallback(async (score: number | null) => {
    if (!userId) throw new Error('未登录')
    if (
      score !== null
      && (!Number.isFinite(score) || score < 0 || score > 9 || !Number.isInteger(score * 2))
    ) {
      throw new Error('平均分必须是 0 到 9 之间的 0.5 分档')
    }

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualAverageScore: score })
    })
    const data = await res.json() as { success?: boolean; profile?: ServerProfile; message?: string }
    if (!res.ok || !data.success) {
      throw new Error(data.message || '保存失败')
    }

    const nextScore = data.profile?.manualAverageScore ?? score
    fetchedUserIdRef.current = userId
    serverProfileRef.current = {
      displayName: data.profile?.displayName ?? serverProfileRef.current?.displayName ?? null,
      email: data.profile?.email ?? serverProfileRef.current?.email ?? null,
      manualAverageScore: nextScore
    }
    setManualAverageScore(nextScore)
    window.dispatchEvent(new CustomEvent('ielts-writing:analytics-invalidated'))
  }, [userId])

  const reloadProfile = useCallback(() => {
    fetchedUserIdRef.current = null
    serverProfileRef.current = null
    setProfile(userId ? loadUserProfile(userId) : DefaultUserProfile)
    void ensureServerProfile()
  }, [ensureServerProfile, userId])

  const value = useMemo(
    () => ({
      profile: profile || DefaultUserProfile,
      displayName,
      email: serverEmail,
      manualAverageScore,
      displayNameLoading,
      ensureServerProfile,
      saveProfile,
      updateDisplayName,
      updateManualAverageScore,
      reloadProfile
    }),
    [profile, displayName, serverEmail, manualAverageScore, displayNameLoading, ensureServerProfile, saveProfile, updateDisplayName, updateManualAverageScore, reloadProfile]
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile() {
  const context = useContext(UserProfileContext)
  if (!context) throw new Error('useUserProfile must be used inside UserProfileProvider')
  return context
}
