'use client'

import Link from 'next/link'
import { MaterialIcon } from '@/components/app-ui'

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <h1 className="app-header-title">{title}</h1>
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
          <Link className="ui-icon-button" href="/dashboard" prefetch aria-label="账号中心" title="账号中心">
            <MaterialIcon name="manage_accounts" />
          </Link>
        </div>
      </div>
    </header>
  )
}
