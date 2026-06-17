'use client'

import { initialsFromProfile, type UserProfile } from '@/lib/user-profile'

export function ProfileAvatar({
  profile,
  size = 'md',
  label = '用户头像'
}: {
  profile: UserProfile
  size?: 'md' | 'lg'
  label?: string
}) {
  const initials = initialsFromProfile(profile)

  if (profile.avatarUrl) {
    return (
      <span className={`profile-avatar profile-avatar-${size}`} aria-label={label}>
        <img alt="" src={profile.avatarUrl} />
      </span>
    )
  }

  return (
    <span className={`profile-avatar profile-avatar-${size}`} aria-label={`${label}：${initials}`}>
      <span>{initials}</span>
    </span>
  )
}
