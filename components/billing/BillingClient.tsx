'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowRight, Check, CheckCircle2, CreditCard, Crown, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useUserProfile } from '@/stores/user-profile-store'
import type { BillingInterval, TrialOffer } from '@/lib/billing/config'
import type { MembershipSummary } from '@/lib/billing/membership'
import { BillingRecords, type BillingSubscription } from './BillingRecords'
import { TrialChoices, type TrialStatus } from './TrialChoices'
import { MembershipAccessPrompt } from './MembershipAccessPrompt'
import './membership-purchase.css'

const AccountSettings = dynamic(() => import('@/components/dashboard/AccountSettings').then((m) => m.AccountSettings))
const WritingActivityHeatmap = dynamic(() => import('@/components/dashboard/WritingActivityHeatmap').then((m) => m.WritingActivityHeatmap))

export type BillingStatus = {
  available: boolean
  testMode?: boolean
  canManage: boolean
  membership: MembershipSummary
  trial: TrialStatus
  plans: Array<{ interval: BillingInterval; amount: number; currency: string }>
  prepaid: null | { amount: number; currency: string; days: number }
  paypalPrepaid: null | { amount: number; currency: string; days: number }
  subscription: null | BillingSubscription
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || '请求失败，请稍后重试。')
  return body as T
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date(value)) : '开通后显示'
}

export function BillingClient({ userId, accountLabel, initialMembership, checkoutResult, destination }: { userId: string; accountLabel: string; initialMembership: MembershipSummary; checkoutResult?: string; destination?: { href: string; label: string } | null }) {
  const { displayName } = useUserProfile()
  const { data, error: loadError, isLoading, mutate } = useSWR<BillingStatus>(['billing-status', userId], () => fetch('/api/billing/status', { cache: 'no-store' }).then(readResponse<BillingStatus>), { refreshInterval: (latest) => latest?.membership.source === 'trial' ? 30000 : 0 })
  const [consent, setConsent] = useState(false)
  const [prepaidConsent, setPrepaidConsent] = useState(false)
  const [trialConsent, setTrialConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(checkoutResult === 'success' ? '正在核对支付结果，确认到账后自动开通。' : checkoutResult === 'canceled' ? '已返回会员中心，当前会员权益不受影响。' : '')
  const running = useRef(false)
  const membership = data?.membership || initialMembership
  const subscription = data?.subscription
  const existing = Boolean(subscription && !['canceled', 'incomplete_expired'].includes(subscription.status))
  const held = membership.suspended || Boolean(subscription?.risk_hold)
  const active = membership.active
  const trialActive = active && membership.source === 'trial'
  const title = membership.suspended ? '账号使用受限' : subscription?.risk_hold ? '支付需要核实' : trialActive ? '免费试用中' : active ? '会员权益有效' : data?.trial.used ? '试用已结束' : membership.expiresAt ? '会员权益已到期' : '尚未开通会员'
  const plans = data?.plans.length ? data.plans : [{ interval: 'month' as const, amount: 1999, currency: 'cny' }]
  const daysRemaining = membership.remainingDays
  const displayedNotice = checkoutResult === 'success' && active ? '当前会员权益已生效。' : notice
  const billingAvailable = Boolean(data?.available)
  const prepaidAvailable = Boolean(data?.prepaid || data?.paypalPrepaid)
  const prepaidOffers = [data?.prepaid, data?.paypalPrepaid].filter((offer): offer is NonNullable<BillingStatus['prepaid']> => Boolean(offer))

  const sync = useCallback(async () => {
    if (billingAvailable || prepaidAvailable) await readResponse(await fetch('/api/billing/reconcile', { method: 'POST' }))
    await mutate()
  }, [billingAvailable, prepaidAvailable, mutate])

  useEffect(() => {
    if (checkoutResult !== 'success') return
    let canceled = false
    void sync().then(() => { if (!canceled) setNotice('会员状态已同步。') }).catch((caught) => { if (!canceled) setError(caught instanceof Error ? caught.message : '暂时无法核对支付，请点击刷新状态。') })
    return () => { canceled = true }
  }, [checkoutResult, sync])

  async function run(action: string, endpoint: string, body?: unknown) {
    if (running.current) return
    running.current = true
    setBusy(action)
    setError('')
    setNotice('')
    try {
      if (action === 'refresh') { await sync(); setNotice('会员状态已刷新。'); return }
      const result = await readResponse<{ url: string }>(await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }))
      const target = new URL(result.url)
      if (target.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(target.hostname)) throw new Error('支付跳转地址无效，请稍后重试。')
      window.location.assign(target.href)
    } catch (caught) { setError(caught instanceof Error ? caught.message : '操作失败，请重试。') }
    finally { running.current = false; setBusy(null) }
  }

  async function startTrial(offer: TrialOffer) {
    if (running.current || (offer === 'card' && !trialConsent)) return
    running.current = true
    setBusy(`trial-${offer}`)
    setError('')
    setNotice('')
    try {
      const result = await readResponse<{ active?: boolean; url?: string }>(await fetch('/api/billing/trial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offer === 'card' ? { offer, autoRenewConsent: true } : { offer })
      }))
      if (result.url) {
        const target = new URL(result.url)
        if (target.protocol !== 'https:' || target.hostname !== 'checkout.stripe.com') throw new Error('试用跳转地址无效，请重试。')
        window.location.assign(target.href)
      } else if (result.active) {
        await mutate()
        // A full navigation discards any pre-trial redirects cached by Link prefetching.
        window.location.assign(destination?.href || '/practice')
      } else throw new Error('试用状态尚未确认，请刷新后重试。')
    } catch (caught) { setError(caught instanceof Error ? caught.message : '试用领取失败，请稍后重试。') }
    finally { running.current = false; setBusy(null) }
  }

  return (
    <main className="membership-page" data-main-content tabIndex={-1}>
      {!active ? <MembershipAccessPrompt key={destination?.href || 'billing'} destination={destination || null} suspended={held} expired={Boolean(membership.expiresAt) || Boolean(data?.trial.used)} trial={data?.trial} loading={isLoading} consent={trialConsent} onConsent={setTrialConsent} busy={busy} error={error} onTrial={(offer) => void startTrial(offer)} /> : null}
      <header className="membership-intro"><div><p className="membership-eyebrow">YOUR WRITING JOURNEY</p><h2>认真练习，也照顾好每一次进步。</h2><p>会员权益、订阅账单和账号设置，都在这里。</p></div><Link href="/pricing">查看会员方案<ArrowRight size={16} aria-hidden="true" /></Link></header>
      {data?.testMode ? <p className="billing-test" role="status">当前为测试环境，付款不会产生真实扣款。</p> : null}
      {displayedNotice ? <p className="membership-notice" role="status">{displayedNotice}</p> : null}
      {error || loadError ? <p className="auth-error" role="alert">{error || (loadError instanceof Error ? loadError.message : '会员状态读取失败。')}<button type="button" disabled={Boolean(busy) || isLoading} onClick={() => void run('refresh', '')}>重新核对状态</button></p> : null}

      <section className={`membership-status-card ${active ? 'is-active' : ''}`} aria-label="当前会员状态">
        <div className="membership-status-top"><div className="membership-identity"><span className="membership-avatar" aria-hidden="true">{(displayName || accountLabel).slice(0, 1).toUpperCase()}</span><div><span className="membership-welcome">你好，{displayName || '写作练习者'}</span><p>{accountLabel}</p></div></div><span className={`membership-status-badge ${held ? 'is-held' : ''}`}><span />{title}</span></div>
        <div className="membership-status-body"><div><span className="membership-small-label">我的会员</span><h2>{active ? '继续你的写作进阶之旅' : '下一篇作文，就是新的开始'}</h2><p>{held ? '请联系支持，我们会帮助你核实当前账号或付款状态。' : active ? '你的会员权益正在生效，让每次练习都有更清晰的方向。' : '选择适合你的开通方式，开启批改、练习与学习复盘。'}</p></div><span className="membership-crown" aria-hidden="true"><Crown size={46} strokeWidth={1.2} /></span></div>
        <dl className="membership-status-facts"><div><dt>当前方案</dt><dd>{trialActive ? !data ? '免费试用会员' : data.trial.selectedOffer === 'card' ? '3天绑卡试用' : '1天免绑卡试用' : active ? ({ standard: '标准会员', pro: '专业会员', premium: '高级会员' }[membership.plan || 'standard'] || '写作会员') : '未开通'}</dd></div><div><dt>{trialActive ? '试用结束' : '权益到期'}</dt><dd>{trialActive && membership.expiresAt ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(membership.expiresAt)) : formatDate(membership.expiresAt)}</dd></div><div><dt>{active ? '剩余有效期' : '开通方式'}</dt><dd>{active ? `${daysRemaining} 天` : prepaidAvailable ? '免费试用 / 单次付款 / 订阅' : '免费试用 / 按月订阅'}</dd></div></dl>
        <div className="membership-status-footer"><p>{trialActive ? !data ? '试用权益已生效，续费状态正在核对。' : data.trial.selectedOffer === 'no_card' ? '免绑卡试用到期自动结束，不会扣费。' : subscription?.cancel_at_period_end ? '已取消自动续费，试用权益保留至到期。' : '试用结束后按 ¥19.99/月自动续费，可提前在下方管理订阅中取消。' : membership.source === 'prepaid' ? '已单次开通30天会员，到期不会自动扣款。' : subscription?.cancel_at_period_end && active ? '已取消下一期续费，本期权益保留至到期。' : active ? membership.source === 'subscription' ? '自动续费已开启，可随时管理。' : '现有有效权益已保留，无需重复开通。' : '开通后，权益将自动关联到当前账号。'}</p><div>{active ? <Link href={destination?.href || '/practice'}>{destination ? `前往${destination.label}` : '开始练习'}<ArrowRight size={14} aria-hidden="true" /></Link> : null}<button type="button" disabled={Boolean(busy) || isLoading} onClick={() => void run('refresh', '')}><RefreshCw size={14} className={busy === 'refresh' ? 'admin-spin' : ''} aria-hidden="true" />刷新状态</button></div></div>
      </section>

      {!active && !held ? <section className="membership-trial-section" aria-labelledby="membership-trial-title"><header><span className="membership-offer-kicker"><Sparkles size={15} aria-hidden="true" />从一次体验开始</span><h2 id="membership-trial-title">先试试看，再决定。</h2><p>两种方式，同样体验完整写作与复盘功能。</p></header><TrialChoices status={data?.trial} loading={isLoading} busy={busy} consent={trialConsent} onConsent={setTrialConsent} onStart={(offer) => void startTrial(offer)} /></section> : null}

      <section className="membership-purchase" aria-labelledby="membership-offer-title">
        <header className="membership-purchase-header">
          <div>
            <span className="membership-purchase-eyebrow">完整写作会员</span>
            <h2 id="membership-offer-title">选择适合你的开通方式</h2>
            <p>相同的会员权益，按你的习惯付款。</p>
          </div>
          <Link href="/pricing">查看全部权益<ArrowRight size={15} aria-hidden="true" /></Link>
        </header>
        <ul className="membership-purchase-benefits" aria-label="两种方案均包含">
          <li><CheckCircle2 size={16} aria-hidden="true" />AI 估分与四项标准反馈</li>
          <li><CheckCircle2 size={16} aria-hidden="true" />Task 1 / Task 2 与完整模考</li>
          <li><CheckCircle2 size={16} aria-hidden="true" />学习规划、错题本与能力分析</li>
        </ul>
        <div className="membership-plan-grid">
          {prepaidOffers.map((offer) => (
            <article className="membership-plan membership-plan--prepaid" key={offer.currency}>
              <div className="membership-plan-heading">
                <h3>单次开通{offer.currency === 'gbp' ? ' · PayPal' : ''}</h3>
                <span className="membership-plan-badge">不自动续费</span>
              </div>
              <p className="membership-plan-price">
                <strong>{new Intl.NumberFormat('zh-CN', { style: 'currency', currency: offer.currency.toUpperCase() }).format(offer.amount / 100)}</strong>
                <span>/ 30天</span>
              </p>
              <p className="membership-plan-description">想练就开通，到期后由你决定是否续购。</p>
              <dl className="membership-plan-details">
                <div><dt>会员时长</dt><dd>付款后开通30天</dd></div>
                <div><dt>付款方式</dt><dd>{offer.currency === 'gbp' ? 'PayPal / 银行卡' : '支付宝 / 微信 / 银行卡'}</dd></div>
              </dl>
              <div className="membership-plan-action">
                {existing || active ? (
                  <p className="membership-plan-message">{active ? '当前会员权益有效，无需重复开通。' : '你已有订阅，请先在订阅管理中处理。'}</p>
                ) : (
                  <>
                    <label className="membership-plan-consent">
                      <input type="checkbox" checked={prepaidConsent} onChange={(event) => setPrepaidConsent(event.target.checked)} disabled={Boolean(busy) || held} />
                      <span>我同意<Link href="/terms" target="_blank" rel="noopener noreferrer">服务条款</Link>与<Link href="/privacy" target="_blank" rel="noopener noreferrer">隐私政策</Link>，本次付款不自动续费。</span>
                    </label>
                    <button className="membership-plan-button" type="button" disabled={!prepaidConsent || Boolean(busy) || held} onClick={() => void run(`prepaid-${offer.currency}`, '/api/billing/checkout', { purchase: 'prepaid', currency: offer.currency, termsConsent: true })}>
                      {busy === `prepaid-${offer.currency}` ? <Loader2 className="admin-spin" size={16} aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
                      {held ? '请先联系支持' : '单次开通30天'}<ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {plans.map((plan) => (
            <article className="membership-plan membership-plan--recurring" key={plan.interval}>
              <div className="membership-plan-heading">
                <h3>{plan.interval === 'month' ? '按月订阅' : '按年订阅'}</h3>
                <span className="membership-plan-badge">自动续费</span>
              </div>
              <p className="membership-plan-price">
                <strong>{new Intl.NumberFormat('zh-CN', { style: 'currency', currency: plan.currency.toUpperCase() }).format(plan.amount / 100)}</strong>
                <span>/ {plan.interval === 'month' ? '月' : '年'}</span>
              </p>
              <p className="membership-plan-description">适合持续练习，会员到期自动续上。</p>
              <dl className="membership-plan-details">
                <div><dt>扣款周期</dt><dd>每{plan.interval === 'month' ? '月' : '年'}自动续费</dd></div>
                <div><dt>续费管理</dt><dd>可随时取消下一期续费</dd></div>
              </dl>
              <div className="membership-plan-action">
                {existing || active ? (
                  <>
                    <p className="membership-plan-message">{active ? '当前会员权益有效，无需重复开通。' : '你已有订阅，可管理账单或更新付款方式。'}</p>
                    {data?.canManage ? <a className="membership-plan-button membership-plan-button--secondary" href="#subscription-billing">查看订阅与账单<ArrowRight size={16} aria-hidden="true" /></a> : <span className="membership-plan-current"><Check size={16} aria-hidden="true" />当前会员权益有效</span>}
                  </>
                ) : (
                  <>
                    <label className="membership-plan-consent">
                      <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={Boolean(busy) || held} />
                      <span>我同意自动续费，并已阅读<Link href="/terms" target="_blank" rel="noopener noreferrer">服务条款</Link>与<Link href="/privacy" target="_blank" rel="noopener noreferrer">隐私政策</Link>。</span>
                    </label>
                    <button className="membership-plan-button membership-plan-button--secondary" type="button" disabled={!consent || Boolean(busy) || !data?.available || held} onClick={() => void run(plan.interval, '/api/billing/checkout', { interval: plan.interval, autoRenewConsent: true })}>
                      {busy === plan.interval ? <Loader2 className="admin-spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
                      {held ? '请先联系支持' : data?.available ? `开通${plan.interval === 'month' ? '月度' : '年度'}订阅` : '在线订阅即将开放'}<ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className="membership-purchase-security"><ShieldCheck size={14} aria-hidden="true" />由 Stripe 安全处理付款<span aria-hidden="true">·</span>可用付款方式以收银台显示为准</p>
      </section>
      {data && !data.available && !active ? <p className="membership-opening-note" role="status">在线订阅暂未开放，开放后可在此开通。需要帮助时，欢迎<Link href="/support">联系支持</Link>。</p> : null}

      <BillingRecords userId={userId} membership={membership} subscription={subscription} canManage={Boolean(data?.canManage)} busy={busy === 'portal'} onManage={() => void run('portal', '/api/billing/portal')} />
      <div className="membership-details-grid"><AccountSettings /><WritingActivityHeatmap userId={userId} /></div>
      <footer className="membership-footer"><span>循序渐进，写下属于你的进步。</span><div><Link href="/support">帮助与反馈</Link><Link href="/terms">服务条款</Link><Link href="/privacy">隐私政策</Link></div></footer>
    </main>
  )
}
