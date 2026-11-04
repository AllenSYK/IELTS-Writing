'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { CenteredDialog } from '@/components/ui/CenteredDialog'
import { TrialChoices, type TrialStatus } from './TrialChoices'
import type { TrialOffer } from '@/lib/billing/config'

export function MembershipAccessPrompt({ destination, suspended, expired, trial, loading, consent, onConsent, busy, error, onTrial }: {
  destination: { href: string; label: string } | null
  suspended: boolean
  expired: boolean
  trial?: TrialStatus
  loading: boolean
  consent: boolean
  onConsent: (value: boolean) => void
  busy: string | null
  error: string
  onTrial: (offer: TrialOffer) => void
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const close = useCallback(() => {
    if (busy) return
    setDismissed(true)
    router.replace('/billing', { scroll: false })
  }, [busy, router])

  return <CenteredDialog
    open={Boolean(destination) && !dismissed}
    title={suspended ? '当前账号使用受限' : expired ? '会员权益已到期' : '这个功能需要会员权益'}
    description={suspended ? '请联系支持，帮助你核实账号和付款状态。' : `“${destination?.label || '学习功能'}”需要有效会员权益。你可以在这里领取试用或查看会员方案。`}
    className="membership-access-dialog"
    onClose={close}
    footer={<>
      <button type="button" className="ui-secondary-button" disabled={Boolean(busy)} onClick={close}>稍后再说</button>
      <Link className="ui-secondary-button" href={suspended ? '/support' : '/pricing'}>{suspended ? '联系支持' : '查看会员方案'}<ArrowRight size={15} aria-hidden="true" /></Link>
    </>}
  >
    <p className="membership-access-lead">让下一次练习，有更清晰的方向。</p>
    <ul className="membership-access-benefits"><li><Check size={16} aria-hidden="true" />AI 模拟估分与四项标准反馈</li><li><Check size={16} aria-hidden="true" />Task 1 / Task 2 写作与完整模考</li><li><Check size={16} aria-hidden="true" />学习规划、错题本与进步分析</li></ul>
    {!suspended ? <TrialChoices status={trial} loading={loading} busy={busy} consent={consent} onConsent={onConsent} onStart={onTrial} /> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
  </CenteredDialog>
}
