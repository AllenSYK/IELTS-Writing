'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  FileText,
  KeyRound,
  LayoutDashboard,
  Link2,
  Settings,
  UsersRound,
  X
} from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { BRAND_NAME } from '@/lib/brand'
import { AdminLogoutButton } from './AdminLogoutButton'

const navigation = [
  { href: '/admin', label: '总览', icon: LayoutDashboard, exact: true },
  { href: '/admin/licenses', label: '激活码管理', icon: KeyRound },
  { href: '/admin/bindings', label: '邮箱绑定', icon: Link2 },
  { href: '/admin/users', label: '用户管理', icon: UsersRound },
  { href: '/admin/past-papers', label: '真题题库', icon: FileText },
  { href: '/admin/settings', label: '设置', icon: Settings }
]

export function AdminSidebar({
  open,
  adminEmail,
  onClose
}: {
  open: boolean
  adminEmail?: string
  onClose: () => void
}) {
  const pathname = usePathname()

  return (
    <>
      <button
        className={`admin-sidebar-backdrop ${open ? 'is-visible' : ''}`}
        type="button"
        aria-label="关闭导航"
        onClick={onClose}
      />
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`} aria-label="管理后台导航">
        <div className="admin-sidebar-brand">
          <Link className="admin-sidebar-brand-link" href="/admin" prefetch={false} aria-label={`返回 ${BRAND_NAME} 管理中心`} title={BRAND_NAME} onClick={onClose}>
            <BrandLogo size="md" showName />
            <span className="admin-sidebar-context">管理中心</span>
          </Link>
          <button className="admin-icon-button admin-sidebar-close" type="button" aria-label="关闭导航" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {navigation.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                className={`admin-sidebar-item ${active ? 'is-active' : ''}`}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <Link className="admin-user-card" href="/" prefetch={false}>
            <span className="admin-user-avatar">{(adminEmail || 'A').slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{adminEmail || '管理员账号'}</strong>
              <small>返回用户端</small>
            </span>
            <BookOpen size={17} aria-hidden="true" />
          </Link>
          <AdminLogoutButton />
        </div>
      </aside>
    </>
  )
}
