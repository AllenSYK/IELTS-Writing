'use client'

import Link from 'next/link'
import { MaterialIcon } from '@/components/app-ui'
import { useUserProfile } from '@/stores/user-profile-store'
import { ProfileAvatar } from './ProfileAvatar'

export function AppHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { profile } = useUserProfile()

  return (
    <header className="app-header">
      <div className="app-header-copy">
        <p className="ui-label">{subtitle}</p>
        <h1 className="app-header-title">{title}</h1>
      </div>

      <div className="app-header-actions">
        <a
          className="ui-icon-button"
          href="https://xhslink.com/m/3TO45Vd0bey"
          target="_blank"
          rel="noreferrer"
          title="打开小红书"
          aria-label="打开小红书"
        >
          <MaterialIcon name="share" />
        </a>
        <Link className="ui-icon-button" href="/settings" aria-label="打开设置" title="设置">
          <MaterialIcon name="settings" />
        </Link>
        <ProfileAvatar profile={profile} />
      </div>
    </header>
  )
}
