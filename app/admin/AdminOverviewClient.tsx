'use client'

import useSWR from 'swr'
import {
  ArrowRight,
  BrainCircuit,
  CircleCheckBig,
  Download,
  KeyRound,
  Link2,
  Plus,
  TicketCheck,
  UserMinus,
  UsersRound
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  AdminBadge,
  AdminEmpty,
  AdminError,
  AdminMetricCard,
  AdminTableSkeleton,
  formatAdminDate
} from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import { maskPhone, shortUserId } from '@/lib/phone-auth'

type OverviewData = {
  success: true
  stats: {
    totalLicenses: number
    availableLicenses: number
    exhaustedLicenses: number
    totalBindings: number
    activeBindings: number
    unboundUsers: number
  }
  recentLicenses: Array<{
    id: string
    code_prefix: string
    plan: string
    status: string
    activation_count: number
    max_activations: number
    created_at: string
  }>
  recentBindings: Array<{
    id: string
    user_id: string
    email: string
    binding_status: string
    activated_at: string
    license_codes: { id: string; code_prefix: string; plan: string } | Array<{ id: string; code_prefix: string; plan: string }> | null
  }>
  recentUsers: Array<{
    id: string
    email: string | null
    phone: string | null
    role: string
    license_status: string
    created_at: string
  }>
}

export function AdminOverviewClient() {
  const { pushToast } = useToast()
  const { data, error, isLoading, mutate } = useSWR<OverviewData>(
    '/api/admin/overview',
    adminJsonFetcher,
    { keepPreviousData: true }
  )
  const loading = !data && isLoading

  function exportOverview() {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `admin-overview-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    pushToast({ kind: 'success', title: '总览数据已导出' })
  }

  const stats = data?.stats
  const cards = [
    { label: '激活码总数', value: stats?.totalLicenses ?? 0, helper: '所有已生成激活码', icon: <KeyRound size={20} />, tone: 'blue' as const },
    { label: '可用激活码', value: stats?.availableLicenses ?? 0, helper: '仍有剩余激活次数', icon: <TicketCheck size={20} />, tone: 'green' as const },
    { label: '已用完激活码', value: stats?.exhaustedLicenses ?? 0, helper: '已达到最大激活次数', icon: <CircleCheckBig size={20} />, tone: 'amber' as const },
    { label: '邮箱绑定总数', value: stats?.totalBindings ?? 0, helper: '包含历史绑定关系', icon: <Link2 size={20} />, tone: 'violet' as const },
    { label: '有效绑定邮箱', value: stats?.activeBindings ?? 0, helper: '当前拥有有效权限', icon: <UsersRound size={20} />, tone: 'green' as const },
    { label: '未绑定邮箱用户', value: stats?.unboundUsers ?? 0, helper: '尚无当前绑定关系', icon: <UserMinus size={20} />, tone: 'red' as const }
  ]

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="ADMIN OVERVIEW"
        title="管理中心"
        description="激活码资产与邮箱权限关系分开管理，关键状态一眼可见。"
        actions={(
          <>
            <button className="admin-secondary-button" type="button" onClick={exportOverview} disabled={!data}>
              <Download size={16} />导出数据
            </button>
            <a className="admin-primary-button" href="/admin/licenses?create=1"><Plus size={16} />生成激活码</a>
          </>
        )}
      />

      {error ? <AdminError message={error.message || '无法加载总览。'} onRetry={() => void mutate()} /> : null}

      <section className="admin-stat-grid admin-stat-grid-six" aria-label="关键数据">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <div className="admin-stat-card admin-skeleton-card" key={index} />)
          : cards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-panel-span-2">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">QUICK ENTRIES</p><h2>独立管理入口</h2></div>
          </div>
          <div className="admin-quick-grid">
            <a href="/admin/licenses"><KeyRound size={19} /><span><strong>管理激活码</strong><small>生成、禁用、撤销、删除和导出激活码</small></span></a>
            <a href="/admin/bindings"><Link2 size={19} /><span><strong>查看邮箱绑定</strong><small>管理邮箱与激活码之间的权限关系</small></span></a>
            <a href="/admin/users"><UsersRound size={19} /><span><strong>用户管理</strong><small>查看账号角色、验证和激活状态</small></span></a>
            <a href="/admin/models"><BrainCircuit size={19} /><span><strong>模型配置</strong><small>分配批改、生成、计划与图片识别模型</small></span></a>
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">RECENT LICENSES</p><h2>最近生成的激活码</h2></div>
            <a className="admin-text-button" href="/admin/licenses">查看全部 <ArrowRight size={15} /></a>
          </div>
          {loading ? <AdminTableSkeleton columns={4} rows={5} /> : data?.recentLicenses.length ? (
            <div className="admin-compact-list">
              {data.recentLicenses.map((license) => (
                <a key={license.id} href={`/admin/licenses?licenseId=${license.id}`}>
                  <span className="admin-list-icon"><KeyRound size={17} /></span>
                  <span><strong>{license.code_prefix}-••••-••••</strong><small>{license.plan} · {formatAdminDate(license.created_at)}</small></span>
                  <span>{license.activation_count}/{license.max_activations}</span>
                  <AdminBadge value={license.status} />
                  <ArrowRight size={16} />
                </a>
              ))}
            </div>
          ) : <AdminEmpty title="还没有激活码" message="生成第一批激活码后，它们会显示在这里。" />}
        </article>

        <article className="admin-panel admin-panel-span-2">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">RECENT BINDINGS</p><h2>最近邮箱绑定</h2></div>
            <a className="admin-text-button" href="/admin/bindings">查看全部 <ArrowRight size={15} /></a>
          </div>
          {loading ? <AdminTableSkeleton columns={4} rows={5} /> : data?.recentBindings.length ? (
            <div className="admin-compact-list">
              {data.recentBindings.map((binding) => {
                const license = Array.isArray(binding.license_codes) ? binding.license_codes[0] : binding.license_codes
                return (
                  <a key={binding.id} href={`/admin/bindings?userId=${binding.user_id}`}>
                    <span className="admin-list-icon"><Link2 size={17} /></span>
                    <span><strong>{binding.email}</strong><small>{license?.code_prefix || '未知激活码'} · {formatAdminDate(binding.activated_at)}</small></span>
                    <span>{license?.plan || '—'}</span>
                    <AdminBadge value={binding.binding_status} />
                    <ArrowRight size={16} />
                  </a>
                )
              })}
            </div>
          ) : <AdminEmpty title="暂无邮箱绑定" message="用户成功绑定激活码后会显示在这里。" />}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">NEW USERS</p><h2>最近注册用户</h2></div>
            <a className="admin-text-button" href="/admin/users">用户管理</a>
          </div>
          {loading ? <AdminTableSkeleton columns={3} rows={5} /> : data?.recentUsers.length ? (
            <div className="admin-timeline">
              {data.recentUsers.map((user) => (
                <div key={user.id}>
                  <span><UsersRound size={15} /></span>
                  <div><strong>{user.email || maskPhone(user.phone) || shortUserId(user.id)}</strong><small>{formatAdminDate(user.created_at)}</small></div>
                  <AdminBadge value={user.role === 'admin' ? 'admin' : user.license_status} />
                </div>
              ))}
            </div>
          ) : <AdminEmpty title="暂无注册用户" message="新注册账号会显示在这里。" />}
        </article>
      </section>
    </main>
  )
}
