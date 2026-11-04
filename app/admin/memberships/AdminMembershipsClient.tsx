'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { CreditCard, Gift, Receipt, RefreshCw, TriangleAlert } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminBadge, AdminEmpty, AdminError, AdminMetricCard, AdminTableSkeleton, formatAdminDate } from '@/components/admin/AdminUI'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'

type RecordsResponse = {
  stats: { subscriptions: number; payments: number; trials: number; attention: number; configured: boolean; livemode: boolean | null }
  total: number
  pageSize: number
  records: Array<{
    id: string; userId: string; account: string; status: string; accessActive: boolean; accountSuspended: boolean
    offer: string | null; expiresAt: string | null; createdAt: string; autoRenew: boolean
    amount: number | null; currency: string | null; observedAt: string | null; subscriptionId: string | null
  }>
}

export function AdminMembershipsClient() {
  const userId = useSearchParams().get('userId') || ''
  const [type, setType] = useState('subscriptions')
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ type, page: String(page) })
  if (userId) params.set('userId', userId)
  const { data, error, isLoading, isValidating, mutate } = useSWR<RecordsResponse>(`/api/admin/memberships?${params}`, adminJsonFetcher,
    { revalidateOnFocus: true, refreshInterval: 30_000 })
  const stats = data?.stats
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / 20))

  return (
    <main className="admin-section" data-main-content tabIndex={-1}>
      <AdminPageHeader eyebrow="MEMBERSHIPS & BILLING" title="会员管理"
        description="查看自动续费订阅、30天单次付款和1天／3天试用记录。状态随已核实的支付记录更新。"
        actions={<a className="admin-secondary-button" href="/admin/users">搜索用户账号</a>} />
      <section className="admin-stat-grid" aria-label="会员记录统计">
        <AdminMetricCard label="订阅记录" value={stats?.subscriptions ?? '—'} helper="含试用、取消及历史订阅" icon={<CreditCard size={20} />} />
        <AdminMetricCard label="单次付款订单" value={stats?.payments ?? '—'} helper="已确认付款的30天会员订单" icon={<Receipt size={20} />} tone="green" />
        <AdminMetricCard label="试用领取记录" value={stats?.trials ?? '—'} helper="含预留，每账号共用一次机会" icon={<Gift size={20} />} tone="violet" />
        <AdminMetricCard label="待关注订阅" value={stats?.attention ?? '—'} helper="付款未完成、欠费或风险暂停" icon={<TriangleAlert size={20} />} tone="amber" />
      </section>
      {stats && !stats.configured ? <div className="admin-selection-bar">当前环境尚未配置在线支付，暂无会员支付记录。</div> : null}
      {stats?.configured ? <div className="admin-selection-bar"><span>{stats.livemode ? '正式环境' : '测试环境'} · 每30秒刷新 · 统计为全站记录数</span><span>未完成的试用预留不会授予会员权益。</span></div> : null}
      <section className="admin-panel admin-table-panel">
        <div className="admin-filter-bar">
          <div className="admin-filter-tabs" role="tablist" aria-label="会员记录类型">
            {[['subscriptions', '订阅记录'], ['payments', '单次付款'], ['trials', '试用记录']].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={type === value} className={type === value ? 'is-active' : ''}
                onClick={() => { setType(value); setPage(1) }}>{label}</button>
            ))}
          </div>
          <button className="admin-icon-button" type="button" disabled={isValidating} onClick={() => void mutate()} aria-label="刷新会员记录"><RefreshCw size={17} className={isValidating ? 'admin-spin' : ''} /></button>
        </div>
        {userId ? <div className="admin-selection-bar"><span>当前用户：{userId}</span><a href="/admin/memberships" className="admin-text-button">查看全部用户</a></div> : null}
        {error ? <AdminError message={error.message || '无法加载会员记录。'} onRetry={() => void mutate()} /> : null}
        {isLoading ? <AdminTableSkeleton columns={7} rows={6} /> : data?.records.length ? (
          <div className="admin-table-wrap admin-responsive-table">
            <table className="admin-table admin-membership-table">
              <thead><tr><th>账号 / 记录</th><th>方案</th><th>记录状态</th><th>本记录权益</th><th>续费 / 金额</th><th>创建 / 权益到期</th></tr></thead>
              <tbody>{data.records.map((record) => (
                <tr key={record.id}>
                  <td data-label="账号 / 记录"><div><a className="admin-text-button" href={`/admin/users?userId=${record.userId}`}>{record.account}</a><small className="admin-id-cell" title={record.id}>{record.id}</small></div></td>
                  <td data-label="方案">{type === 'payments' ? '30天单次付款' : record.offer && (type === 'trials' || record.status === 'trialing') ? record.offer === 'card' ? '绑卡3天试用' : '免绑卡1天试用' : '会员订阅'}</td>
                  <td data-label="记录状态"><div><AdminBadge value={record.status} />{record.observedAt ? <small className="admin-id-cell">最近核实 {formatAdminDate(record.observedAt)}</small> : null}</div></td>
                  <td data-label="本记录权益"><span className={`admin-status ${record.accessActive ? 'good' : 'neutral'}`}>{record.accountSuspended ? '账号已暂停' : record.accessActive ? '有效' : type === 'trials' ? record.subscriptionId ? '以订阅记录为准' : '尚未开通' : '无有效权益'}</span></td>
                  <td data-label="续费 / 金额">{record.amount !== null && record.currency ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: record.currency }).format(record.amount / 100) : record.autoRenew ? '自动续费' : '不自动续费'}</td>
                  <td data-label="创建 / 权益到期"><div><span>创建 {formatAdminDate(record.createdAt)}</span><small className="admin-id-cell">到期 {formatAdminDate(record.expiresAt, '—')}</small></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : !error ? <AdminEmpty title="暂无相关记录" message="已核实的订阅、付款和试用记录会显示在这里。可切换类型或查看全部用户。" /> : null}
        {data && data.total > 20 ? <div className="admin-pagination">
          <button className="admin-secondary-button" type="button" disabled={page <= 1 || isValidating} onClick={() => setPage((current) => current - 1)}>上一页</button>
          <div>第 {page} / {totalPages} 页，共 {data.total} 条记录</div>
          <button className="admin-secondary-button" type="button" disabled={page >= totalPages || isValidating} onClick={() => setPage((current) => current + 1)}>下一页</button>
        </div> : null}
      </section>
    </main>
  )
}
