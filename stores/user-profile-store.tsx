'use client'

import {
  DefaultUserProfile,
  loadUserProfile,
  saveUserProfile,
  type UserProfile
} from '@/lib/user-profile'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { userScopedStorageKey } from '@/lib/user-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

type UserProfileContextValue = {
  profile: UserProfile
  saveProfile: (profile: UserProfile) => Promise<UserProfile>
  reloadProfile: () => void
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { userId } = useUserSession()
  const [profile, setProfile] = useState<UserProfile>(DefaultUserProfile)

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      window.queueMicrotask(() => {
        if (!cancelled) setProfile(DefaultUserProfile)
      })
      return () => {
        cancelled = true
      }
    }
    window.queueMicrotask(() => {
      if (!cancelled) setProfile(loadUserProfile(userId))
    })
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

  const saveProfile = useCallback(async (nextProfile: UserProfile) => {
    if (!userId) return DefaultUserProfile
    const saved = saveUserProfile(userId, nextProfile)
    setProfile(saved)
    return saved
  }, [userId])

  const reloadProfile = useCallback(() => setProfile(userId ? loadUserProfile(userId) : DefaultUserProfile), [userId])

  const value = useMemo(
    () => ({
      profile: profile || DefaultUserProfile,
      saveProfile,
      reloadProfile
    }),
    [profile, reloadProfile, saveProfile]
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export function useUserProfile() {
  const context = useContext(UserProfileContext)
  if (!context) throw new Error('useUserProfile must be used inside UserProfileProvider')
  return context
}
