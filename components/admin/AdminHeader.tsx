'use client'

import { FormEvent, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BrainCircuit, Menu, Plus, Search, X } from 'lucide-react'
import { getAdminRouteMeta } from '@/lib/admin/admin-routes'

export function AdminHeader({ adminEmail, onMenu }: { adminEmail?: string; onMenu: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlSearch = searchParams.get('search') || ''
  const [search, setSearch] = useState(urlSearch)
  const [isComposing, setIsComposing] = useState(false)
  const meta = getAdminRouteMeta(pathname)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 输入法组合状态下不提交
    if (isComposing) return
    
    const query = search.trim()
    const searchConfig = meta.search
    
    // 如果当前页面没有搜索配置（如概览页），则不执行搜索
    if (!searchConfig) return
    
    if (!query) {
      // 清空搜索时恢复默认列表
      window.location.assign(searchConfig.targetPath)
      return
    }
    
    window.location.assign(`${searchConfig.targetPath}?${searchConfig.paramName}=${encodeURIComponent(query)}`)
  }

  function clearSearch() {
    setSearch('')
    const searchConfig = meta.search
    if (searchConfig) {
      window.location.assign(searchConfig.targetPath)
    }
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

      {meta.search && (
        <form className="admin-global-search" role="search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={meta.search.placeholder}
            aria-label={meta.search.placeholder}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear"
              onClick={clearSearch}
              aria-label="清除搜索"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </form>
      )}

      <div className="admin-topbar-actions">
        <a
          className={`admin-secondary-button admin-header-models ${pathname.startsWith('/admin/models') ? 'is-active' : ''}`}
          href="/admin/models"
          aria-current={pathname.startsWith('/admin/models') ? 'page' : undefined}
        >
          <BrainCircuit size={17} aria-hidden="true" />
          <span>模型配置</span>
        </a>
        <a className="admin-primary-button admin-header-create" href="/admin/licenses?create=1">
          <Plus size={17} aria-hidden="true" />
          <span>生成激活码</span>
        </a>
        <span className="admin-header-avatar" title={adminEmail || '管理员'}>
          {(adminEmail || 'A').slice(0, 1).toUpperCase()}
        </span>
      </div>
    </header>
  )
}
