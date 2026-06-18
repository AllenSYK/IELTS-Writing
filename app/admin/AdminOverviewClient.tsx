'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CircleCheckBig,
  Clock3,
  Download,
  KeyRound,
  Plus,
  ShieldCheck,
  UserCheck,
  UserPlus,
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

type OverviewData = {
  stats: {
    totalLicenses: number
    activatedLicenses: number
    unusedLicenses: number
    expiredLicenses: number
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    todayUsers: number
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
  recentActivations: Array<{
    id: string
    email: string
    status: string
    activated_at: string
    expires_at: string
    license_codes: { code_prefix: string; plan: string } | Array<{ code_prefix: string; plan: string }> | null
  }>
  recentUsers: Array<{
    id: string
    email: string | null
    role: string
    license_status: string
    created_at: string
  }>
  expiringLicenses: Array<{
    id: string
    code_prefix: string
    plan: string
    status: string
    expires_at: string
  }>
}

export function AdminOverviewClient() {
  const { pushToast } = useToast()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/overview', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || '无法加载总览。')
      setData(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法加载总览。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

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
    { label: '已激活激活码', value: stats?.activatedLicenses ?? 0, helper: '已产生绑定记录', icon: <CircleCheckBig size={20} />, tone: 'green' as const },
    { label: '未使用激活码', value: stats?.unusedLicenses ?? 0, helper: '可立即分配使用', icon: <Clock3 size={20} />, tone: 'violet' as const },
    { label: '已过期激活码', value: stats?.expiredLicenses ?? 0, helper: '整体有效期已结束', icon: <CalendarClock size={20} />, tone: 'red' as const },
    { label: '用户总数', value: stats?.totalUsers ?? 0, helper: '全部注册账号', icon: <UsersRound size={20} />, tone: 'blue' as const },
    { label: '已激活用户', value: stats?.activeUsers ?? 0, helper: '当前拥有有效权限', icon: <UserCheck size={20} />, tone: 'green' as const },
    { label: '未激活用户', value: stats?.inactiveUsers ?? 0, helper: '尚未绑定有效激活码', icon: <ShieldCheck size={20} />, tone: 'amber' as const },
    { label: '今日新增用户', value: stats?.todayUsers ?? 0, helper: '自今日 00:00 起', icon: <UserPlus size={20} />, tone: 'violet' as const }
  ]

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader
        eyebrow="ADMIN OVERVIEW"
        title="管理中心"
        description="管理激活码、用户和使用权限，关键状态一眼可见。"
        actions={(
          <>
            <button className="admin-secondary-button" type="button" onClick={exportOverview} disabled={!data}>
              <Download size={16} />导出数据
            </button>
            <Link className="admin-primary-button" href="/admin/licenses?create=1"><Plus size={16} />生成激活码</Link>
          </>
        )}
      />

      {error ? <AdminError message={error} onRetry={() => void load()} /> : null}

      <section className="admin-stat-grid" aria-label="关键数据">
        {loading
          ? Array.from({ length: 8 }).map((_, index) => <div className="admin-stat-card admin-skeleton-card" key={index} />)
          : cards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-panel-span-2">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-eyebrow">RECENT LICENSES</p>
              <h2>最近生成的激活码</h2>
            </div>
            <Link className="admin-text-button" href="/admin/licenses">查看全部 <ArrowRight size={15} /></Link>
          </div>
          {loading ? <AdminTableSkeleton columns={5} /> : data?.recentLicenses.length ? (
            <div className="admin-compact-list">
              {data.recentLicenses.map((license) => (
                <Link key={license.id} href={`/admin/licenses?focus=${license.id}`}>
                  <span className="admin-list-icon"><KeyRound size={17} /></span>
                  <span><strong>{license.code_prefix}-••••-••••</strong><small>{license.plan} · {formatAdminDate(license.created_at)}</small></span>
                  <span>{license.activation_count}/{license.max_activations}</span>
                  <AdminBadge value={license.status} />
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : <AdminEmpty title="还没有激活码" message="生成第一批激活码后，它们会显示在这里。" />}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">QUICK ACTIONS</p><h2>快捷操作</h2></div>
          </div>
          <div className="admin-quick-grid">
            <Link href="/admin/licenses?create=1"><Plus size={19} /><span><strong>生成激活码</strong><small>创建单个或批量激活码</small></span></Link>
            <Link href="/admin/licenses"><KeyRound size={19} /><span><strong>查看所有激活码</strong><small>筛选、禁用或撤销</small></span></Link>
            <Link href="/admin/users"><UsersRound size={19} /><span><strong>查看用户</strong><small>管理账号和权限</small></span></Link>
            <button type="button" onClick={exportOverview}><Download size={19} /><span><strong>导出数据</strong><small>下载当前总览快照</small></span></button>
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">ACTIVATIONS</p><h2>最近激活记录</h2></div>
            <Link className="admin-text-button" href="/admin/activations">全部记录</Link>
          </div>
          {loading ? <AdminTableSkeleton columns={3} rows={4} /> : data?.recentActivations.length ? (
            <div className="admin-timeline">
              {data.recentActivations.map((item) => {
                const license = Array.isArray(item.license_codes) ? item.license_codes[0] : item.license_codes
                return (
                  <div key={item.id}>
                    <span><Activity size={15} /></span>
                    <div><strong>{item.email}</strong><small>{license?.code_prefix || '未知激活码'} · {formatAdminDate(item.activated_at)}</small></div>
                    <AdminBadge value={item.status} />
                  </div>
                )
              })}
            </div>
          ) : <AdminEmpty title="暂无激活记录" message="用户成功激活后会显示在这里。" />}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">NEW USERS</p><h2>最近注册用户</h2></div>
            <Link className="admin-text-button" href="/admin/users">用户管理</Link>
          </div>
          {loading ? <AdminTableSkeleton columns={3} rows={4} /> : data?.recentUsers.length ? (
            <div className="admin-timeline">
              {data.recentUsers.map((user) => (
                <div key={user.id}>
                  <span><UsersRound size={15} /></span>
                  <div><strong>{user.email || '暂无邮箱'}</strong><small>{formatAdminDate(user.created_at)}</small></div>
                  <AdminBadge value={user.role === 'admin' ? 'admin' : user.license_status} />
                </div>
              ))}
            </div>
          ) : <AdminEmpty title="暂无注册用户" message="新注册账号会显示在这里。" />}
        </article>

        <article className="admin-panel">
          <div className="admin-panel-heading">
            <div><p className="admin-eyebrow">EXPIRING SOON</p><h2>即将到期的激活码</h2></div>
          </div>
          {loading ? <AdminTableSkeleton columns={3} rows={4} /> : data?.expiringLicenses.length ? (
            <div className="admin-timeline">
              {data.expiringLicenses.map((license) => (
                <div key={license.id}>
                  <span className="warning"><CalendarClock size={15} /></span>
                  <div><strong>{license.code_prefix}</strong><small>{license.plan} · {formatAdminDate(license.expires_at)}</small></div>
                  <AdminBadge value={license.status} />
                </div>
              ))}
            </div>
          ) : <AdminEmpty title="近期没有到期项目" message="未来 14 天内没有激活码整体到期。" />}
        </article>
      </section>
    </main>
  )
}
