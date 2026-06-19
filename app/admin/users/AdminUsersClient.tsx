'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import {
  Ban,
  CheckCircle2,
  Eye,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  LockKeyhole
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { ConfirmDialog, useDebouncedValue, useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'

type LicenseRef = {
  id: string
  code_value: string | null
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
  createdAt: string
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  bannedUntil: string | null
  role: string
  licenseStatus: string
  licenseExpiresAt: string | null
  plan: string | null
  activation?: ActivationRef | null
  isBound: boolean
  licenseId: string | null
  licenseCode: string | null
  licensePrefix: string | null
  lastUsedAt: string | null
  evaluationCount: number
}

type UserDetail = {
  user: {
    id: string
    email?: string
    created_at: string
    last_sign_in_at?: string
    email_confirmed_at?: string
    banned_until?: string
  }
  profile: {
    id: string
    email: string | null
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
}

const EMPTY_USERS: UserRow[] = []

type ConfirmState = { title: string; message: string; label: string; action: () => Promise<void> } | null

function isBanned(user: UserRow) {
  return Boolean(user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now())
}

export function AdminUsersClient() {
  const searchParams = useSearchParams()
  const focusedUserId = searchParams.get('userId') || ''
  const { pushToast } = useToast()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const debouncedSearch = useDebouncedValue(search, 320)
  const [filter, setFilter] = useState('all')
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bindCode, setBindCode] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchMode, setBatchMode] = useState<'existing' | 'new'>('existing')
  const [batchCode, setBatchCode] = useState('')
  const [batchPlan, setBatchPlan] = useState('standard')
  const [batchDays, setBatchDays] = useState(365)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const focusedDetailRef = useRef('')

  const openDetail = useCallback(async (user: UserRow) => {
    setSelected(user)
    setDetail(null)
    setBindCode('')
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
    const params = new URLSearchParams({ pageSize: '100', search: debouncedSearch, filter })
    if (focusedUserId) params.set('userId', focusedUserId)
    return `/api/admin/users?${params.toString()}`
  }, [debouncedSearch, filter, focusedUserId])

  const {
    data: usersData,
    error,
    isLoading,
    isValidating,
    mutate
  } = useSWR<UsersResponse>(usersKey, adminJsonFetcher, { keepPreviousData: true })
  const users = usersData?.users || EMPTY_USERS
  const loading = !usersData && isLoading
  const activeSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((id) => users.some((user) => user.id === id))),
    [selectedIds, users]
  )

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

  async function deleteUser(userId: string) {
    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
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

  async function bindUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !bindCode.trim()) return
    await updateUser(selected.id, { action: 'bind', licenseCode: bindCode.trim() }, '激活码已绑定')
  }

  async function batchBind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targets = users.filter((user) => activeSelectedIds.has(user.id))
    if (!targets.length) return
    setSubmitting(true)
    try {
      let codes: string[] = []
      if (batchMode === 'new') {
        const createResponse = await fetch('/api/admin/licenses/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: targets.length,
            plan: batchPlan,
            durationDays: batchDays,
            maxActivations: 1,
            expiresAt: null,
            note: `批量绑定 ${targets.length} 位用户`
          })
        })
        const created = await createResponse.json().catch(() => ({}))
        if (!createResponse.ok || !created.success) throw new Error(created.message || '批量生成激活码失败。')
        codes = (created.codes || []).map((item: { code: string }) => item.code)
      } else {
        if (!batchCode.trim()) throw new Error('请输入现有完整激活码。')
        codes = targets.map(() => batchCode.trim())
      }

      const results = await Promise.all(targets.map(async (user, index) => {
        const response = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bind', licenseCode: codes[index] })
        })
        const data = await response.json().catch(() => ({}))
        return { ok: response.ok && data.success, email: user.email, message: data.message }
      }))
      const succeeded = results.filter((item) => item.ok).length
      const failed = results.length - succeeded
      pushToast({
        kind: failed ? 'warning' : 'success',
        title: `批量绑定完成：成功 ${succeeded}，失败 ${failed}`,
        message: failed ? results.find((item) => !item.ok)?.message : undefined
      })
      setBatchOpen(false)
      setSelectedIds(new Set())
      await mutate().catch(() => undefined)
    } catch (caught) {
      pushToast({ kind: 'error', title: '批量绑定失败', message: caught instanceof Error ? caught.message : '请稍后重试。' })
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
        description="查看用户账号、角色、邮箱验证、激活状态、套餐与账号有效期。"
        actions={(
          <button className="admin-primary-button" type="button" onClick={() => setBatchOpen(true)} disabled={!activeSelectedIds.size}>
            <KeyRound size={16} />批量绑定激活码{activeSelectedIds.size ? `（${activeSelectedIds.size}）` : ''}
          </button>
        )}
      />

      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar admin-user-filter">
          <label className="admin-search-field">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索邮箱或用户 ID" />
          </label>
          <div className="admin-filter-tabs" role="tablist" aria-label="用户筛选">
            {[
              ['all', '全部用户'], ['admin', '管理员'], ['active', '已激活'], ['inactive', '未激活'],
              ['expired', '已过期'], ['disabled', '已禁用'], ['unbound', '未绑定激活码']
            ].map(([value, label]) => (
              <button key={value} className={filter === value ? 'is-active' : ''} type="button" onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          <button className="admin-icon-button" type="button" onClick={() => void mutate()} disabled={isValidating} aria-label="刷新">
            <RefreshCw className={isValidating ? 'admin-spin' : ''} size={17} />
          </button>
        </div>

        {activeSelectedIds.size ? (
          <div className="admin-selection-bar">
            <span>已选择 <strong>{activeSelectedIds.size}</strong> 位用户</span>
            <button className="admin-primary-button compact" type="button" onClick={() => setBatchOpen(true)}><KeyRound size={15} />批量绑定</button>
            <button className="admin-text-button" type="button" onClick={() => setSelectedIds(new Set())}>取消选择</button>
          </div>
        ) : null}

        {error ? <AdminError message={error.message || '无法加载用户。'} onRetry={() => void mutate()} /> : null}
        {loading ? <AdminTableSkeleton columns={9} rows={7} /> : users.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-checkbox-column"><span className="sr-only">选择</span></th>
                  <th>邮箱</th><th>角色</th><th>注册时间</th><th>邮箱验证状态</th><th>激活状态</th>
                  <th>当前套餐</th><th>账号到期时间</th><th>绑定情况</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const banned = isBanned(user)
                  const accountStatus = banned ? 'disabled' : user.role === 'admin' ? 'admin' : user.licenseStatus
                  return (
                    <tr key={user.id}>
                      <td className="admin-checkbox-column" data-label="选择">
                        <input
                          type="checkbox"
                          checked={activeSelectedIds.has(user.id)}
                          onChange={(event) => setSelectedIds((current) => {
                            const next = new Set(current)
                            if (event.target.checked) next.add(user.id)
                            else next.delete(user.id)
                            return next
                          })}
                          aria-label={`选择 ${user.email || user.id}`}
                        />
                      </td>
                      <td data-label="邮箱"><strong>{user.email || '暂无邮箱'}</strong><small className="admin-id-cell">{user.id}</small></td>
                      <td data-label="角色"><AdminBadge value={user.role} /></td>
                      <td data-label="注册时间">{formatAdminDate(user.createdAt)}</td>
                      <td data-label="邮箱验证状态"><span className={`admin-status ${user.emailConfirmedAt ? 'good' : 'warning'}`}>{user.emailConfirmedAt ? '已验证' : '未验证'}</span></td>
                      <td data-label="激活状态"><AdminBadge value={accountStatus} /></td>
                      <td data-label="当前套餐">{user.plan ? <span className="admin-plan-pill">{user.plan}</span> : '—'}</td>
                      <td data-label="账号到期时间">{formatAdminDate(user.licenseExpiresAt)}</td>
                      <td data-label="绑定情况"><span className={`admin-status ${user.isBound ? 'good' : 'neutral'}`}>{user.isBound ? '已绑定激活码' : '未绑定激活码'}</span></td>
                      <td data-label="操作">
                        <div className="admin-row-actions">
                          <button className="admin-icon-button" type="button" onClick={() => void openDetail(user)} aria-label="查看详情"><Eye size={15} /></button>
                          {banned ? (
                            <button className="admin-icon-button success" type="button" onClick={() => void updateUser(user.id, { action: 'enable' }, '用户账号已启用')} aria-label="启用"><CheckCircle2 size={15} /></button>
                          ) : (
                            <button className="admin-icon-button warning" type="button" onClick={() => setConfirm({
                              title: '禁用这个用户账号？',
                              message: `${user.email || user.id} 将无法继续登录。`,
                              label: '确认禁用',
                              action: () => updateUser(user.id, { action: 'disable' }, '用户账号已禁用')
                            })} aria-label="禁用"><Ban size={15} /></button>
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
      </section>

      <CenteredDialog open={Boolean(selected)} title="用户详情" description="查看用户账号本身；详细绑定历史在邮箱绑定页面管理。" className="admin-detail-dialog" onClose={() => { setSelected(null); setDetail(null) }}>
        {selected ? (
          <div className="admin-detail-stack">
            <section className="admin-user-detail-hero">
              <span className="admin-user-avatar large">{(selected.email || 'U').slice(0, 1).toUpperCase()}</span>
              <div><strong>{selected.email || '暂无邮箱'}</strong><small>{selected.id}</small></div>
              <AdminBadge value={isBanned(selected) ? 'disabled' : selected.role === 'admin' ? 'admin' : selected.licenseStatus} />
            </section>
            {!detail ? <AdminTableSkeleton columns={2} rows={5} /> : (
              <>
                <dl className="admin-definition-grid">
                  <div><dt>角色</dt><dd>{detail.profile.role === 'admin' ? '管理员' : '普通用户'}</dd></div>
                  <div><dt>邮箱验证</dt><dd>{detail.user.email_confirmed_at ? '已验证' : '未验证'}</dd></div>
                  <div><dt>注册时间</dt><dd>{formatAdminDate(detail.user.created_at)}</dd></div>
                  <div><dt>最近登录</dt><dd>{formatAdminDate(detail.user.last_sign_in_at)}</dd></div>
                  <div><dt>账号激活状态</dt><dd><AdminBadge value={detail.profile.license_status} /></dd></div>
                  <div><dt>账号到期时间</dt><dd>{formatAdminDate(detail.profile.license_expires_at)}<small>由当前有效邮箱绑定决定</small></dd></div>
                </dl>
                <section>
                  <div className="admin-panel-heading">
                    <div><p className="admin-eyebrow">EMAIL BINDINGS</p><h3>邮箱绑定记录</h3></div>
                    <Link className="admin-text-button" href={`/admin/bindings?userId=${selected.id}`}>查看此邮箱的绑定记录</Link>
                  </div>
                  <section className="admin-binding-summary">
                    <div>
                      <span className="admin-list-icon"><KeyRound size={18} /></span>
                      <div>
                        <strong>{selected.isBound ? '已绑定激活码' : '未绑定激活码'}</strong>
                        <p>{selected.isBound ? '套餐、账号到期时间和绑定状态请进入邮箱绑定页面查看。' : '当前账号尚无绑定关系。'}</p>
                      </div>
                    </div>
                    <Link className="admin-primary-button" href={`/admin/bindings?userId=${selected.id}`}>查看绑定历史</Link>
                  </section>
                  {!selected.isBound ? (
                    <form className="admin-inline-bind" onSubmit={bindUser}>
                      <div><strong>该用户尚未绑定激活码</strong><p>输入完整激活码后手动绑定。</p></div>
                      <label className="admin-field"><span>完整激活码</span><input value={bindCode} onChange={(event) => setBindCode(event.target.value)} placeholder="IELTS-XXXX-XXXX-XXXX" required /></label>
                      <button className="admin-primary-button" type="submit" disabled={submitting}>{submitting ? <Loader2 className="admin-spin" size={16} /> : <KeyRound size={16} />}绑定激活码</button>
                    </form>
                  ) : null}
                </section>
                <section>
                  <div className="admin-panel-heading"><div><p className="admin-eyebrow">ACCOUNT CONTROL</p><h3>账号控制</h3></div></div>
                  <div className="admin-dialog-action-grid">
                    <button className="admin-secondary-button" type="button" onClick={() => void updateUser(selected.id, { action: 'role', role: selected.role === 'admin' ? 'user' : 'admin' }, selected.role === 'admin' ? '已取消管理员角色' : '已设为管理员')}>
                      <UserCog size={15} />{selected.role === 'admin' ? '取消管理员' : '设为管理员'}
                    </button>
                    <button className="admin-secondary-button" type="button" onClick={() => void updateUser(selected.id, { action: 'reset-password' }, '密码重置邮件已发送', true)}>
                      <LockKeyhole size={15} />发送重置密码邮件
                    </button>
                    {isBanned(selected) ? (
                      <button className="admin-secondary-button" type="button" onClick={() => void updateUser(selected.id, { action: 'enable' }, '用户账号已启用')}><CheckCircle2 size={15} />启用账号</button>
                    ) : (
                      <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                        title: '禁用这个用户账号？',
                        message: '用户将无法登录，直到管理员重新启用。',
                        label: '确认禁用',
                        action: () => updateUser(selected.id, { action: 'disable' }, '用户账号已禁用')
                      })}><Ban size={15} />禁用账号</button>
                    )}
                    <button className="admin-secondary-button danger" type="button" onClick={() => setConfirm({
                      title: '永久删除这个用户？',
                      message: '用户账号、邮箱绑定记录和关联数据可能会被永久删除，且无法恢复。',
                      label: '永久删除',
                      action: () => deleteUser(selected.id)
                    })}><Trash2 size={15} />删除用户</button>
                  </div>
                </section>
              </>
            )}
          </div>
        ) : null}
      </CenteredDialog>

      <CenteredDialog open={batchOpen} title="批量绑定激活码" description={`为已选择的 ${activeSelectedIds.size} 位用户分配使用权限。`} className="admin-create-dialog" onClose={() => !submitting && setBatchOpen(false)} footer={(
        <>
          <button className="admin-secondary-button" type="button" onClick={() => setBatchOpen(false)} disabled={submitting}>取消</button>
          <button className="admin-primary-button" type="submit" form="batch-bind-form" disabled={submitting || !activeSelectedIds.size}>
            {submitting ? <Loader2 className="admin-spin" size={16} /> : <ShieldCheck size={16} />}{submitting ? '正在绑定' : '开始批量绑定'}
          </button>
        </>
      )}>
        <form id="batch-bind-form" className="admin-generate-form" onSubmit={batchBind}>
          <div className="admin-segmented">
            <button className={batchMode === 'existing' ? 'is-active' : ''} type="button" onClick={() => setBatchMode('existing')}>使用现有激活码</button>
            <button className={batchMode === 'new' ? 'is-active' : ''} type="button" onClick={() => setBatchMode('new')}>新生成激活码</button>
          </div>
          {batchMode === 'existing' ? (
            <label className="admin-field"><span>完整激活码</span><input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder="激活码需有足够的最大激活次数" required /></label>
          ) : (
            <div className="admin-form-grid">
              <label className="admin-field"><span>套餐</span><select value={batchPlan} onChange={(event) => setBatchPlan(event.target.value)}><option value="standard">Standard</option><option value="pro">Pro</option><option value="premium">Premium</option><option value="admin">Admin</option></select></label>
              <label className="admin-field"><span>账号有效天数</span><input type="number" min={1} max={3650} value={batchDays} onChange={(event) => setBatchDays(Number(event.target.value))} /></label>
            </div>
          )}
          <div className="admin-confirm-summary">
            <strong>将处理 {activeSelectedIds.size} 位用户</strong>
            <p>{batchMode === 'existing' ? '所有用户尝试绑定同一个现有激活码，受最大激活次数限制。' : '系统会为每位用户生成一个独立激活码并立即绑定。'}</p>
          </div>
        </form>
      </CenteredDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </main>
  )
}
