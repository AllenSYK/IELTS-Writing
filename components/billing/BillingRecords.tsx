'use client'

import useSWR from 'swr'
import { useEffect } from 'react'
import { ExternalLink, ReceiptText, RefreshCw } from 'lucide-react'
import type { MembershipSummary } from '@/lib/billing/membership'
import type { BillingInvoice } from '@/lib/billing/invoices'

export type BillingSubscription = {
  status: string
  billing_interval: 'month' | 'year'
  paid_through: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  risk_hold: boolean
  hasAccess: boolean
  trial_offer?: 'no_card' | 'card' | null
  trial_end?: string | null
}

const subscriptionLabels: Record<string, string> = {
  active: '订阅生效中', past_due: '续费付款待处理', canceled: '订阅已结束', incomplete: '等待首次付款',
  incomplete_expired: '首次付款已过期', trialing: '试用中', unpaid: '付款未完成', paused: '订阅已暂停'
}
const invoiceLabels: Record<string, string> = { paid: '已结清', open: '待付款', void: '已作废', uncollectible: '未收款', review: '已退款 / 待核实' }
const date = (value: string | number | null) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(typeof value === 'number' ? new Date(value * 1000) : new Date(value)) : '—'

async function readInvoices() {
  const response = await fetch('/api/billing/invoices', { cache: 'no-store' })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || '账单读取失败，请稍后重试。')
  return body as { configured: boolean; invoices: BillingInvoice[]; hasMore: boolean }
}

export function BillingRecords({ userId, membership, subscription, canManage, busy, onManage }: {
  userId: string
  membership: MembershipSummary
  subscription: BillingSubscription | null | undefined
  canManage: boolean
  busy: boolean
  onManage: () => void
}) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(['billing-invoices', userId], readInvoices)
  useEffect(() => {
    if (window.location.hash === '#subscription-billing') {
      document.getElementById('subscription-billing')?.scrollIntoView({ block: 'start' })
    }
  }, [userId])
  const trial = membership.source === 'trial'
  const noCard = subscription?.trial_offer === 'no_card'
  const subscriptionLabel = trial && !subscription ? '试用权益生效中' : subscription?.risk_hold ? '付款需要核实'
    : trial && noCard ? '免绑卡试用中'
    : subscription?.cancel_at_period_end ? '已取消续费'
    : subscription ? subscriptionLabels[subscription.status] || '状态待确认' : membership.source === 'prepaid' ? '30天会员 · 不自动续费' : membership.source === 'existing' ? '已有会员权益' : '尚未订阅'

  return (
    <section className="membership-billing-records" id="subscription-billing" aria-labelledby="billing-records-title">
      <header className="membership-records-header">
        <div><h2 id="billing-records-title">订阅与账单</h2><p>查看单次付款记录、订阅周期和续费状态。</p></div>
        {canManage ? <button className="ui-secondary-button" type="button" disabled={busy} onClick={onManage}><ExternalLink size={14} aria-hidden="true" />{busy ? '正在打开…' : '管理订阅 / 取消续费'}</button> : null}
      </header>
      <dl className="membership-subscription-summary">
        <div><dt>订阅状态</dt><dd>{subscriptionLabel}</dd></div>
        <div><dt>计费周期</dt><dd>{trial && !subscription ? '正在核对续费状态…' : noCard ? '试用到期结束，不扣费' : subscription?.cancel_at_period_end ? '已取消自动续费' : trial ? '试用后 ¥19.99/月' : subscription ? subscription.billing_interval === 'year' ? '按年自动续费' : '按月自动续费' : '无自动续费订阅'}</dd></div>
        <div><dt>{trial ? '试用结束' : subscription?.status === 'active' && !subscription.cancel_at_period_end ? '下次续费日期' : '会员权益到期'}</dt><dd>{date(trial ? subscription?.trial_end || membership.expiresAt : subscription?.status === 'active' && !subscription.cancel_at_period_end ? subscription.current_period_end : membership.expiresAt)}</dd></div>
      </dl>
      <div className="membership-invoices-heading"><h3>账单记录</h3><button type="button" onClick={() => void mutate()} disabled={isValidating}><RefreshCw size={13} className={isValidating ? 'admin-spin' : ''} aria-hidden="true" />刷新账单</button></div>
      {error ? <p className="membership-invoice-message" role="alert">{error instanceof Error ? error.message : '账单读取失败，请刷新重试。'}</p>
        : isLoading ? <p className="membership-invoice-message" role="status">正在读取账单…</p>
        : data?.invoices.length ? <div className="membership-invoice-scroll"><table className="membership-invoice-table"><thead><tr><th>日期 / 账单编号</th><th>账单金额</th><th>状态</th><th><span className="sr-only">查看账单</span></th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice.id}><td>{date(invoice.created)}<small>{invoice.number || '会员订阅账单'}</small></td><td>{new Intl.NumberFormat('zh-CN', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.total / 100)}</td><td><span className={`membership-invoice-status is-${invoice.status}`}>{invoiceLabels[invoice.status] || '处理中'}</span></td><td>{invoice.url ? <a href={invoice.url} target="_blank" rel="noopener noreferrer">查看<ExternalLink size={12} aria-hidden="true" /></a> : '—'}</td></tr>)}</tbody></table></div>
          : <div className="membership-invoice-empty"><ReceiptText size={23} strokeWidth={1.4} aria-hidden="true" /><div><strong>暂无账单记录</strong><p>{membership.source === 'existing' ? '当前使用的是已有会员权益，尚无 Stripe 订阅账单。' : data?.configured ? '首次订阅付款后，账单日期、金额和状态会显示在这里。' : '在线订阅尚未开放，开通后的每期账单会自动保存在这里。'}</p></div></div>}
      {data?.hasMore ? <p className="membership-invoice-message">此处展示最近 12 笔付款与账单记录，需要更早的记录请联系支持。</p> : null}
    </section>
  )
}
