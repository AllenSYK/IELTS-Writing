'use client'

import { MEMBERSHIP_SOURCE_LABELS, type AdminMembership } from '@/lib/admin/membership'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  Ban,
  CheckCircle2,
  Eye,
  KeyRound,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  LockKeyhole,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import { useAdminSettings } from '@/lib/admin/admin-settings'

type LicenseRef = {
  id: string
  code_prefix: string
  plan: string
  status: string
}

type ActivationRef = {
  id: string
  user_id: string
  email: string
  activated_at: string
  expires_at: string
  status: string
  last_used_at: string | null
  license_codes?: LicenseRef | LicenseRef[] | null
}

type UserRow = {
  id: string
  email: string | null
  phone: string | null
  accountLabel: string
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  bannedUntil: string | null
  role: string
  membership: AdminMembership
  licenseStatus: string
  licenseExpiresAt: string | null
  plan: string | null
  activation?: ActivationRef | null
  isBound: boolean
  licenseId: string | null
  licensePrefix: string | null
  lastUsedAt: string | null
  evaluationCount: number
}

type UserDetail = {
  membership: AdminMembership
  user: {
    id: string
    email?: string
    phone?: string
    created_at: string
    last_sign_in_at?: string
    email_confirmed_at?: string
    banned_until?: string
  }
  profile: {
    id: string
    email: string | null
    phone: string | null
    role: string
    license_status: string
    license_expires_at: string | null
    created_at: string
  }
  activations: ActivationRef[]
}

type UsersResponse = {
  success: true
  users: UserRow[]
  total: number
  currentAdminId: string
  truncated?: boolean
}

const EMPTY_USERS: UserRow[] = []

type ConfirmState = {
  title: string
  message: string
  label: string
  verificationText?: string
  action: () => Promise<void>
} | null

function isBanned(user: UserRow) {
  return Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now())
}

export function AdminUsersClient() {
  const searchParams = useSearchParams()
  const focusedUserId = searchParams.get('userId') || ''
  const { pushToast } = useToast()
  const { settings: adminSettings } = useAdminSettings()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = Math.min(Math.max(adminSettings.pageSize, 10), 200)
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const focusedDetailRef = useRef('')

  const openDetail = useCallback(async (user: UserRow) => {
    setSelected(user)
    setDetail(null)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '无法加载用户详情。')
      setDetail(data)
    } catch (caught) {
      pushToast({ kind: 'error', title: '用户详情加载失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    }
  }, [pushToast])

  const usersKey = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: debouncedSearch, filter })
    if (focusedUserId) params.set('userId', focusedUserId)
    return `/api/admin/users?${params.toString()}`
  }, [debouncedSearch, filter, focusedUserId, page, pageSize])

  const {
    data: usersData,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<UsersResponse>(usersKey, adminJsonFetcher, { keepPreviousData: true, revalidateOnFocus: true, refreshInterval: 30_000 })
  const users = usersData?.users || EMPTY_USERS
  const loading = !usersData && isLoading
  useEffect(() => {
    if (!focusedUserId || !usersData || focusedDetailRef.current === focusedUserId) return
    const focused = usersData.users.find((user) => user.id === focusedUserId)
    if (!focused) return
    focusedDetailRef.current = focusedUserId
    const timer = window.setTimeout(() => void openDetail(focused), 0)
    return () => window.clearTimeout(timer)
  }, [focusedUserId, openDetail, usersData])

  async function updateUser(userId: string, payload: Record<string, unknown>, success: string, keepOpen = false) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败。')
      pushToast({ kind: 'success', title: success })
      const refreshed = await mutate().catch(() => undefined)
      if (keepOpen) {
        const user = refreshed?.users.find((item) => item.id === userId) || users.find((item) => item.id === userId)
        if (user) await openDetail(user)
      } else {
        setSelected(null)
        setDetail(null)
      }
    } catch (caught) {
      pushToast({ kind: 'error', title: '操作失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteUser(target: UserRow) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/users/${target.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: target.accountLabel })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.message || '删除失败。')
      pushToast({ kind: 'success', title: '用户账号已删除' })
      setSelected(null)
      setDetail(null)
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '删除用户失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
    } finally {
      setSubmitting(false)
    }
  }

  async function runConfirm() {
    const action = confirm?.action
    setConfirm(null)
    if (action) await action()
  }

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="USER MANAGEMENT"
        title="用户管理"
        description="查看账号、会员来源、订阅、试用和实际权益到期时间。"

      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar admin-user-filter">
          <label className="admin-search-field">
            <Search size={17} />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="搜索邮箱或用户 ID" />
          </label>
          <div className="admin-filter-tabs" role="tablist" aria-label="用户筛选">
            {[
              ['all', '全部用户'], ['admin', '管理员'], ['active', '有效会员'], ['inactive', '未开通'],
              ['expired', '已过期'], ['disabled', '已禁用'], ['trial', '试用中'], ['subscription', '订阅会员'], ['prepaid', '单次付款'], ['unbound', '无历史绑定']
            ].map(([value, label]) => (
              <button key={value} className={filter === value ? 'is-active' : ''} type="button" onClick={() => { setFilter(value); setPage(1) }}>{label}</button>
            ))}
          </div>
          <button className="admin-icon-button" type="button" onClick={() => void mutate()} disabled={isValidating} aria-label="刷新">
            <RefreshCw className={isValidating ? 'admin-spin' : ''} size={17} />
          </button>
        </div>

        {usersData?.truncated ? (
          <div className="admin-selection-bar">
            <span>搜索范围已达到 1000 个账号；如未找到目标，请使用更精确的邮箱或用户 ID。</span>
          </div>
        ) : null}

        {error ? <AdminError message={error.message || '无法加载用户。'} onRetry={() => void mutate()} /> : null}
        {loading ? <AdminTableSkeleton columns={9} rows={7} /> : users.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>邮箱</th><th>角色</th><th>注册时间</th><th>邮箱验证状态</th><th>会员状态</th>
                  <th>当前套餐</th><th>账号到期时间</th><th>会员来源</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const banned = isBanned(user)
                  const accountStatus = banned ? 'disabled' : user.role === 'admin' ? 'admin' : user.licenseStatus
                  return (
                    <tr key={user.id}>
                      <td data-label="账号"><strong>{user.accountLabel}</strong><small className="admin-id-cell">{user.id}</small></td>
                      <td data-label="角色"><AdminBadge value={user.role} /></td>
                      <td data-label="注册时间">{formatAdminDate(user.createdAt)}</td>
                      <td data-label="邮箱验证状态"><span className={`admin-status ${user.emailConfirmedAt ? 'good' : 'warning'}`}>{user.emailConfirmedAt ? '已验证' : '未验证'}</span></td>
                      <td data-label="会员状态"><AdminBadge value={accountStatus} /></td>
                      <td data-label="当前套餐">{user.plan ? <span className="admin-plan-pill">{user.plan}</span> : '—'}</td>
                      <td data-label="账号到期时间">{formatAdminDate(user.licenseExpiresAt)}</td>
                      <td data-label="会员来源"><strong>{MEMBERSHIP_SOURCE_LABELS[user.membership.source]}</strong><small className="admin-id-cell">{user.membership.source === 'trial' ? user.membership.trialOffer === 'card' ? '绑卡 3 天' : '免绑卡 1 天' : user.membership.autoRenew ? '自动续费中' : user.membership.source === 'subscription' ? '已取消续费' : '不自动续费'}</small></td>
                      <td data-label="操作">
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" onClick={() => void openDetail(user)} aria-label="查看详情"><Eye size={15} /></button>
                          {banned ? (
                            <button className="admin-icon-button success" type="button" onClick={() => void updateUser(user.id, { action: 'enable' }, '用户账号已启用')} aria-label="启用"><CheckCircle2 size={15} /></button>
                          ) : (
                            <button className="admin-icon-button warning" type="button" disabled={user.role === 'admin' || user.id === usersData?.currentAdminId || submitting} onClick={() => setConfirm({
                              title: '禁用这个用户账号？',
                              message: `${user.accountLabel} 将无法继续登录。`,
                              label: '确认禁用',
                              verificationText: user.accountLabel,
                              action: () => updateUser(user.id, { action: 'disable', confirmation: user.accountLabel }, '用户账号已禁用')
                            })} aria-label="禁用" title={user.role === 'admin' ? '请先取消管理员角色' : user.id === usersData?.currentAdminId ? '不能禁用当前管理员' : '禁用账号'}><Ban size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminEmpty
            title={filter === 'unbound' ? '没有未绑定激活码的用户' : '没有符合条件的用户'}
            message={filter === 'unbound' ? '当前所有用户都已有绑定记录。' : '尝试调整搜索词或状态筛选。'}
          />
        )}

        {!focusedUserId && (usersData?.total || 0) > pageSize ? (
          <div className="admin-pagination">
            <button className="admin-secondary-button" type="button" disabled={page <= 1 || isValidating} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <div>第 {page} / {Math.max(1, Math.ceil((usersData?.total || 0) / pageSize))} 页，共 {usersData?.total || 0} 位用户</div>
            <button className="admin-secondary-button" type="button" disabled={page >= Math.ceil((usersData?.total || 0) / pageSize) || isValidating} onClick={() => setPage((current) => current + 1)}>下一页</button>
          </div>
        ) : null}
      </section>

      <CenteredDialog open={Boolean(selected)} title="用户详情" description="查看账号和当前会员权益；订阅、付款与试用记录可进入会员管理查看。" className="admin-detail-dialog" onClose={() => { setSelected(null); setDetail(null) }}>
        {selected ? (
          <div className="admin-detail-stack">
            <section className="admin-user-detail-hero">
              <span className="admin-user-avatar large">{selected.accountLabel.slice(0, 1).toUpperCase()}</span>
              <div><strong>{selected.accountLabel}</strong><small>{selected.id}</small></div>
              <AdminBadge value={isBanned(selected) ? 'disabled' : selected.role === 'admin' ? 'admin' : selected.licenseStatus} />
            </section>
            {!detail ? <AdminTableSkeleton columns={2} rows={5} /> : (
              <>
                <dl className="admin-definition-grid">
                  <div><dt>角色</dt><dd>{detail.profile.role === 'admin' ? '管理员' : '普通用户'}</dd></div>
                  <div><dt>邮箱验证</dt><dd>{detail.user.email_confirmed_at ? '已验证' : '未验证'}</dd></div>
                  <div><dt>注册时间</dt><dd>{formatAdminDate(detail.user.created_at)}</dd></div>
                  <div><dt>最近登录</dt><dd>{formatAdminDate(detail.user.last_sign_in_at)}</dd></div>
                  <div><dt>会员状态</dt><dd><AdminBadge value={detail.membership.status} /></dd></div>
                  <div><dt>账号到期时间</dt><dd>{formatAdminDate(detail.membership.expiresAt)}<small>{MEMBERSHIP_SOURCE_LABELS[detail.membership.source]}</small></dd></div>
                </dl>
                <section className="admin-binding-summary">
                  <div><span className="admin-list-icon"><KeyRound size={18} /></span><div><strong>会员、付款与试用</strong><p>试用机会：{detail.membership.trialState === 'used' ? '已使用' : detail.membership.trialState === 'reserved' ? '已预留，尚未开通' : '未领取'}；{detail.membership.autoRenew ? '自动续费中' : '不自动续费'}。</p></div></div>
                  <a className="admin-primary-button" href={`/admin/memberships?userId=${selected.id}`}>查看会员记录</a>
                </section>
                <section>
                  <div className="admin-panel-heading">
                    <div><p className="admin-eyebrow">EMAIL BINDINGS</p><h3>邮箱绑定记录</h3></div>
                    <a className="admin-text-button" href={`/admin/bindings?userId=${selected.id}`}>查看此邮箱的绑定记录</a>
                  </div>
                  <section className="admin-binding-summary">
                    <div>
                      <span className="admin-list-icon"><KeyRound size={18} /></span>
                      <div>
                        <strong>{selected.isBound ? '已绑定激活码' : '未绑定激活码'}</strong>
                        <p>{selected.isBound ? '套餐、账号到期时间和绑定状态请进入邮箱绑定页面查看。' : '当前账号尚无绑定关系。'}</p>
                      </div>
                    </div>
                    <a className="admin-primary-button" href={`/admin/bindings?userId=${selected.id}`}>查看绑定历史</a>
                  </section>
                </section>
                <section>
                  <div className="admin-panel-heading"><div><p className="admin-eyebrow">ACCOUNT CONTROL</p><h3>账号控制</h3></div></div>
                  <div className="admin-dialog-action-grid">
                    <button className="admin-secondary-button" type="button" disabled={submitting || selected.id === usersData?.currentAdminId} onClick={() => setConfirm({
                      title: selected.role === 'admin' ? '取消该账号的管理员权限？' : '授予该账号管理员权限？',
                      message: selected.role === 'admin'
                        ? '取消后，该账号将无法继续进入管理员系统。'
                        : '管理员可以查看敏感数据并执行高风险操作。',
                      label: selected.role === 'admin' ? '确认取消管理员' : '确认授予管理员',
                      verificationText: selected.accountLabel,
                      action: () => updateUser(
                        selected.id,
                        {
                          action: 'role',
                          role: selected.role === 'admin' ? 'user' : 'admin',
                          confirmation: selected.accountLabel
                        },
                        selected.role === 'admin' ? '已取消管理员角色' : '已设为管理员'
                      )
                    })}>
                      <UserCog size={15} />{selected.role === 'admin' ? '取消管理员' : '设为管理员'}
                    </button>
                    <button className="admin-secondary-button" type="button" onClick={() => void updateUser(selected.id, { action: 'reset-password' }, '密码重置邮件已发送', true)}>
                      <LockKeyhole size={15} />发送重置密码邮件
                    </button>
                    {isBanned(selected) ? (
                      <button className="admin-secondary-button" type="button" onClick={() => void updateUser(selected.id, { action: 'enable' }, '用户账号已启用')}><CheckCircle2 size={15} />启用账号</button>
                    ) : (
                      <button className="admin-secondary-button danger" type="button" disabled={submitting || selected.id === usersData?.currentAdminId} onClick={() => setConfirm({
                        title: '禁用这个用户账号？',
                        message: '用户将无法登录，直到管理员重新启用。',
                        label: '确认禁用',
                        verificationText: selected.accountLabel,
                        action: () => updateUser(selected.id, { action: 'disable', confirmation: selected.accountLabel }, '用户账号已禁用')
                      })}><Ban size={15} />禁用账号</button>
                    )}
                    <button className="admin-secondary-button danger" type="button" disabled={submitting || selected.role === 'admin' || selected.id === usersData?.currentAdminId} onClick={() => setConfirm({
                      title: '删除这个用户账号？',
                      message: '账号将立即停用且无法恢复；业务数据、绑定历史和审计记录会保留。',
                      label: '确认删除账号',
                      verificationText: selected.accountLabel,
                      action: () => deleteUser(selected)
                    })} title={selected.role === 'admin' ? '请先取消管理员角色' : '删除账号'}><Trash2 size={15} />删除用户</button>
                  </div>
                </section>
              </>
            )}
          </div>
        ) : null}
      </CenteredDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label}
        verificationText={confirm?.verificationText}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </main>
  )
}
