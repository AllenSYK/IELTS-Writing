'use client'

import Link from 'next/link'
import { ArrowRight, CreditCard, Gift, Loader2 } from 'lucide-react'
import { TRIAL_OFFERS, type TrialOffer } from '@/lib/billing/config'

export type TrialStatus = { available: boolean; used: boolean; selectedOffer: TrialOffer | null }

export function TrialChoices({ status, loading, busy, consent, onConsent, onStart }: {
  status?: TrialStatus
  loading: boolean
  busy: string | null
  consent: boolean
  onConsent: (value: boolean) => void
  onStart: (offer: TrialOffer) => void
}) {
  if (status?.used) return <p className="membership-trial-message">此账号已使用过一次试用机会。<Link href="/pricing">查看会员方案<ArrowRight size={14} aria-hidden="true" /></Link></p>
  return <>
    <div className="membership-trial-choices">
      <article className="membership-trial-choice">
        <span className="membership-trial-icon"><Gift size={21} strokeWidth={1.5} aria-hidden="true" /></span>
        <h3>轻松体验</h3><p className="membership-trial-duration"><strong>{TRIAL_OFFERS.no_card.days}</strong> 天免费试用</p>
        <p>无需绑卡，即刻开始。<br />到期自动结束，不扣费。</p>
        <button type="button" className="ui-secondary-button" disabled={loading || !status?.available || Boolean(busy) || status.selectedOffer === 'card'} onClick={() => onStart('no_card')}>{busy === 'trial-no_card' ? <Loader2 size={16} className="admin-spin" aria-hidden="true" /> : <Gift size={16} aria-hidden="true" />}免费试用 1 天</button>
      </article>
      <article className="membership-trial-choice is-extended">
        <span className="membership-trial-icon"><CreditCard size={21} strokeWidth={1.5} aria-hidden="true" /></span>
        <h3>多一点时间，感受进步</h3><p className="membership-trial-duration"><strong>{TRIAL_OFFERS.card.days}</strong> 天免费试用</p>
        <p>绑定支付方式，试用后<br />按 ¥19.99/月自动续费。</p>
        <label className="membership-trial-consent"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} disabled={Boolean(busy) || loading || !status?.available || status.selectedOffer === 'no_card'} /><span>我同意试用结束后按 ¥19.99/月自动续费，可在到期前取消。已阅读<Link href="/terms" target="_blank" rel="noopener noreferrer">服务条款</Link>和<Link href="/privacy" target="_blank" rel="noopener noreferrer">隐私政策</Link>。</span></label>
        <button type="button" className="ui-primary-button" disabled={loading || !status?.available || Boolean(busy) || !consent || status.selectedOffer === 'no_card'} onClick={() => onStart('card')}>{busy === 'trial-card' ? <Loader2 size={16} className="admin-spin" aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}{status?.selectedOffer === 'card' ? '继续绑卡试用 3 天' : '绑卡试用 3 天'}</button>
      </article>
    </div>
    <p className="membership-trial-rules">每个账号仅有一次机会，以上两种试用只能选择一种。绑卡试用由 Stripe 安全处理支付信息，网站不保存卡号。</p>
    {loading ? <p className="membership-trial-message" role="status">正在核对试用资格…</p> : !status?.available ? <p className="membership-trial-message" role="status">免费试用暂未开放，请稍后再试。</p> : null}
  </>
}
