'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, Search, UsersRound } from 'lucide-react'
import { AdminLogoutButton } from '@/components/admin/AdminLogoutButton'

type UserRow = {
  id: string
  email: string | null
  createdAt: string
  lastSignInAt: string | null
  role: string
  licenseStatus: string
  licenseExpiresAt: string | null
  plan: string | null
  activation?: {
    id: string
    status: string
  } | null
  lastUsedAt: string | null
  evaluationCount: number
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  return new Date(value).toLocaleString('zh-CN')
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submittingId, setSubmittingId] = useState('')
  const [error, setError] = useState('')

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ pageSize: '100', search })
      const response = await fetch(`/api/admin/users/list?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载用户。')
      setUsers(data.users || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载用户。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function updateUserActivation(user: UserRow, action: 'disable' | 'restore') {
    if (!user.activation?.id || submittingId) return
    setSubmittingId(user.id)
    setError('')
    try {
      const endpoint = action === 'disable' ? '/api/admin/licenses/revoke' : '/api/admin/licenses/extend'
      const body = action === 'disable'
        ? { activationId: user.activation.id, reason: '管理员禁用用户' }
        : { activationId: user.activation.id, days: 30 }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      await loadUsers()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败。')
    } finally {
      setSubmittingId('')
    }
  }

  return (
    <main className="admin-workspace web-admin-workspace" data-main-content tabIndex={-1}>
      <section className="admin-main-panel">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <UsersRound size={20} />
            <div>
              <strong>网页版用户管理</strong>
              <span>查看用户注册、激活、到期和 AI 使用情况</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Link className="admin-secondary-button" href="/admin/licenses">激活码管理</Link>
            <AdminLogoutButton />
          </div>
        </header>

        <div className="admin-main-content">
          <section className="admin-panel">
            <div className="admin-toolbar">
              <label className="admin-field"><span>搜索邮箱或用户 ID</span><input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <button className="admin-secondary-button" type="button" onClick={() => void loadUsers()}><Search size={16} />搜索</button>
              <button className="admin-icon-button" type="button" onClick={() => void loadUsers()} disabled={loading} aria-label="刷新"><RefreshCw size={16} /></button>
            </div>
            {error ? <p className="admin-error-text">{error}</p> : null}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>邮箱</th><th>用户 ID</th><th>注册时间</th><th>最近登录</th><th>套餐</th><th>激活状态</th><th>到期时间</th><th>最近使用</th><th>批改次数</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10}>正在加载...</td></tr>
                  ) : users.length ? users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email || '暂无邮箱'}</td>
                      <td><code>{user.id}</code></td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>{formatDate(user.lastSignInAt)}</td>
                      <td>{user.plan || '暂无'}</td>
                      <td><span className={`admin-status ${user.licenseStatus === 'active' ? 'good' : user.licenseStatus === 'suspended' ? 'bad' : 'neutral'}`}>{user.licenseStatus}</span></td>
                      <td>{formatDate(user.licenseExpiresAt)}</td>
                      <td>{formatDate(user.lastUsedAt)}</td>
                      <td>{user.evaluationCount}</td>
                      <td>
                        <div className="admin-table-actions">
                          {user.licenseStatus === 'active' && user.activation?.id ? (
                            <button className="danger" type="button" disabled={submittingId === user.id} onClick={() => void updateUserActivation(user, 'disable')}>禁用</button>
                          ) : user.activation?.id ? (
                            <button type="button" disabled={submittingId === user.id} onClick={() => void updateUserActivation(user, 'restore')}>恢复30天</button>
                          ) : (
                            <span className="admin-help">无激活</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={10}>暂无用户。</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
