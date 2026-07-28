'use client'

import { UserProfileProvider } from '@/stores/user-profile-store'
import { AccountSettings } from '@/components/dashboard/AccountSettings'

export function AccountSettingsWithProvider() {
  return (
    <UserProfileProvider>
      <AccountSettings />
    </UserProfileProvider>
  )
}
