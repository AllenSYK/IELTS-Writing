'use client'

import Link from 'next/link'
import { MaterialIcon } from '@/components/app-ui'

export function AppHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="app-header">
      <div className="app-header-leading">
        <div className="app-header-copy">
          <p className="ui-label">{subtitle}</p>
          <h1 className="app-header-title">{title}</h1>
        </div>
        <Link className="app-header-create" href="/practice">
          <MaterialIcon name="edit_note" size={18} />
          开始创作
        </Link>
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
      </div>
    </header>
  )
}
