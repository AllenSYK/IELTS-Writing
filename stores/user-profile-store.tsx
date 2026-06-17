'use client'

import {
  DefaultUserProfile,
  loadUserProfile,
  saveUserProfile,
  type UserProfile
} from '@/lib/user-profile'
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
  const [profile, setProfile] = useState<UserProfile>(DefaultUserProfile)

  useEffect(() => {
    setProfile(loadUserProfile())

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'aerowrite-user-profile-v1') {
        setProfile(loadUserProfile())
      }
    }
    const handleProfileEvent = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null
      setProfile(detail && typeof detail === 'object' ? (detail as UserProfile) : loadUserProfile())
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('aerowrite:user-profile-updated', handleProfileEvent)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('aerowrite:user-profile-updated', handleProfileEvent)
    }
  }, [])

  const saveProfile = useCallback(async (nextProfile: UserProfile) => {
    const saved = saveUserProfile(nextProfile)
    setProfile(saved)
    return saved
  }, [])

  const reloadProfile = useCallback(() => setProfile(loadUserProfile()), [])

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
