'use client'

import useSWR from 'swr'
import { ArrowRight, BrainCircuit, CreditCard, Download, Gift, KeyRound, Link2, Receipt, RefreshCw, TriangleAlert, UsersRound } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminMetricCard, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { useToast } from '@/components/interaction-system'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import { maskPhone, shortUserId } from '@/lib/phone-auth'

type OverviewData = {
  stats: { totalUsers: number; totalLicenses: number; totalBindings: number; activeBindings: number }
  billing: { subscriptions: number; payments: number; trials: number; attention: number; configured: boolean; livemode: boolean | null }
  recentUsers: Array<{ id: string; email: string | null; phone: string | null; role: string; created_at: string }>
}

export function AdminOverviewClient() {
  const { pushToast } = useToast()
  const { data, error, isLoading, isValidating, mutate } = useSWR<OverviewData>('/api/admin/overview', adminJsonFetcher,
    { keepPreviousData: true, revalidateOnFocus: true, refreshInterval: 30_000 })
  const loading = !data && isLoading
  function exportOverview() {
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `admin-overview-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    pushToast({ kind: 'success', title: '总览数据已导出' })
  }
  const stats = data?.stats
  const cards = [
    { label: '注册用户', value: stats?.totalUsers ?? '—', helper: '当前账号资料总数', icon: <UsersRound size={20} />, tone: 'blue' as const },
    { label: '订阅记录', value: data?.billing.subscriptions ?? '—', helper: '含试用、取消及历史订阅', icon: <CreditCard size={20} />, tone: 'green' as const },
    { label: '单次付款订单', value: data?.billing.payments ?? '—', helper: '已确认付款的30天会员', icon: <Receipt size={20} />, tone: 'green' as const },
    { label: '试用领取记录', value: data?.billing.trials ?? '—', helper: '免绑卡1天／绑卡3天，含预留', icon: <Gift size={20} />, tone: 'violet' as const },
    { label: '待关注订阅', value: data?.billing.attention ?? '—', helper: '未完成付款、欠费或风险暂停', icon: <TriangleAlert size={20} />, tone: 'amber' as const },
    { label: '历史有效绑定', value: stats?.activeBindings ?? '—', helper: '历史激活码权益独立保留', icon: <Link2 size={20} />, tone: 'blue' as const }
  ]
  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader eyebrow="ADMIN OVERVIEW" title="管理中心" description="统一查看会员订阅、单次付款、试用与用户账号；每30秒刷新。"
        actions={<>
          <button className="admin-icon-button" type="button" aria-label="刷新总览" disabled={isValidating} onClick={() => void mutate()}><RefreshCw size={17} className={isValidating ? 'admin-spin' : ''} /></button>
          <button className="admin-secondary-button" type="button" onClick={exportOverview} disabled={!data}><Download size={16} />导出数据</button>
          <a className="admin-primary-button" href="/admin/memberships"><CreditCard size={16} />会员管理</a>
        </>} />
      {error ? <AdminError message={error.message || '无法加载总览。'} onRetry={() => void mutate()} /> : null}
      <section className="admin-stat-grid admin-stat-grid-six" aria-label="关键数据">
        {loading ? Array.from({ length: 6 }).map((_, index) => <div className="admin-stat-card admin-skeleton-card" key={index} />)
          : cards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
      </section>
      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-panel-span-2">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">BUSINESS MANAGEMENT</p><h2>业务管理</h2></div></div>
          <div className="admin-quick-grid">
            <a href="/admin/memberships"><CreditCard size={19} /><span><strong>会员管理</strong><small>查看订阅、单次付款、续费和试用记录</small></span></a>
            <a href="/admin/users"><UsersRound size={19} /><span><strong>用户管理</strong><small>查看实际会员状态、权益来源与到期时间</small></span></a>
            <a href="/admin/models"><BrainCircuit size={19} /><span><strong>模型配置</strong><small>管理批改、生成、计划与图片识别模型</small></span></a>
            <a href="/admin/licenses"><KeyRound size={19} /><span><strong>历史权益</strong><small>查看旧激活码与历史授权记录</small></span></a>
          </div>
        </article>
        <article className="admin-panel">
          <div className="admin-panel-heading"><div><p className="admin-eyebrow">NEW USERS</p><h2>最近注册用户</h2></div><a className="admin-text-button" href="/admin/users">查看全部 <ArrowRight size={15} /></a></div>
          {loading ? <AdminTableSkeleton columns={3} rows={5} /> : data?.recentUsers.length ? <div className="admin-timeline">
            {data.recentUsers.map((user) => <div key={user.id}><span><UsersRound size={15} /></span><div><a className="admin-text-button" href={`/admin/users?userId=${user.id}`}>{user.email || maskPhone(user.phone) || shortUserId(user.id)}</a><small>{formatAdminDate(user.created_at)}</small></div><AdminBadge value={user.role} /></div>)}
          </div> : <AdminEmpty title="暂无注册用户" message="新注册账号会显示在这里。" />}
        </article>
      </section>
    </main>
  )
}
