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
  const [serverFetched, setServerFetched] = useState(false)
  const fetchedRef = useRef(false)

  // Reset fetch state on userId change
  useEffect(() => {
    fetchedRef.current = false
    window.queueMicrotask(() => {
      setServerFetched(false)
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

  // Fetch display_name from server
  useEffect(() => {
    if (!userId) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    let cancelled = false

    async function fetchDisplayName() {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { success?: boolean; profile?: ServerProfile }
        if (cancelled) return

        if (data.success && data.profile) {
          setServerDisplayName(data.profile.displayName)
          setServerEmail(data.profile.email)
          setManualAverageScore(data.profile.manualAverageScore)

          // Sync server displayName into localStorage cache
          if (data.profile.displayName !== null) {
            const cached = loadUserProfile(userId!)
            if (cached.fullName !== data.profile.displayName) {
              saveUserProfile(userId!, { ...cached, fullName: data.profile.displayName })
              setProfile(loadUserProfile(userId!))
            }
          }
        }
      } catch {
        // Silent fail — localStorage cache is already shown
      } finally {
        if (!cancelled) setServerFetched(true)
      }
    }

    fetchDisplayName()
    return () => { cancelled = true }
  }, [userId])

  // The merged displayName: server > localStorage > default
  const displayName = serverDisplayName ?? (profile.fullName?.trim() || DEFAULT_DISPLAY_NAME)
  const displayNameLoading = !serverFetched && !!userId

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
    setServerDisplayName(data.profile?.displayName ?? trimmed)
    if (data.profile?.email) setServerEmail(data.profile.email)

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

    setManualAverageScore(data.profile?.manualAverageScore ?? score)
    window.dispatchEvent(new CustomEvent('ielts-writing:analytics-invalidated'))
  }, [userId])

  const reloadProfile = useCallback(() => {
    fetchedRef.current = false
    setServerFetched(false)
    setProfile(userId ? loadUserProfile(userId) : DefaultUserProfile)
  }, [userId])

  const value = useMemo(
    () => ({
      profile: profile || DefaultUserProfile,
      displayName,
      email: serverEmail,
      manualAverageScore,
      displayNameLoading,
      saveProfile,
      updateDisplayName,
      updateManualAverageScore,
      reloadProfile
    }),
    [profile, displayName, serverEmail, manualAverageScore, displayNameLoading, saveProfile, updateDisplayName, updateManualAverageScore, reloadProfile]
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile() {
  const context = useContext(UserProfileContext)
  if (!context) throw new Error('useUserProfile must be used inside UserProfileProvider')
  return context
}
