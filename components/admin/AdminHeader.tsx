'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu, Plus, Search } from 'lucide-react'

const pageMeta = [
  { match: (path: string) => path === '/admin', eyebrow: 'Overview', title: '管理中心' },
  { match: (path: string) => path.startsWith('/admin/licenses'), eyebrow: 'Licenses', title: '激活码管理' },
  { match: (path: string) => path.startsWith('/admin/activations'), eyebrow: 'Activations', title: '激活记录' },
  { match: (path: string) => path.startsWith('/admin/users'), eyebrow: 'Users', title: '用户管理' },
  { match: (path: string) => path.startsWith('/admin/settings'), eyebrow: 'Settings', title: '管理设置' }
]

export function AdminHeader({ adminEmail, onMenu }: { adminEmail?: string; onMenu: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const meta = pageMeta.find((item) => item.match(pathname)) ?? pageMeta[0]

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (!query) return
    const target = pathname.startsWith('/admin/users') || pathname.startsWith('/admin/activations')
      ? pathname
      : '/admin/licenses'
    router.push(`${target}?search=${encodeURIComponent(query)}`)
  }

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-title">
        <button className="admin-icon-button admin-mobile-menu" type="button" aria-label="打开导航" onClick={onMenu}>
          <Menu size={19} aria-hidden="true" />
        </button>
        <div>
          <span>{meta.eyebrow}</span>
          <strong>{meta.title}</strong>
        </div>
      </div>

      <form className="admin-global-search" role="search" onSubmit={submitSearch}>
        <Search size={17} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索激活码、邮箱或用户 ID"
          aria-label="全局搜索"
        />
      </form>

      <div className="admin-topbar-actions">
        <button className="admin-icon-button" type="button" aria-label="通知" title="暂无新通知">
          <Bell size={18} aria-hidden="true" />
        </button>
        <Link className="admin-primary-button admin-header-create" href="/admin/licenses?create=1">
          <Plus size={17} aria-hidden="true" />
          <span>生成激活码</span>
        </Link>
        <span className="admin-header-avatar" title={adminEmail || '管理员'}>
          {(adminEmail || 'A').slice(0, 1).toUpperCase()}
        </span>
      </div>
    </header>
  )
}
