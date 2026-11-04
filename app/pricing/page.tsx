import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, Check, CreditCard, FileCheck2, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader'
import { PricingMotion } from '@/components/billing/PricingMotion'
import { billingScope, prepaidBillingEnabled } from '@/lib/billing/config'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'
import './pricing.css'

export const metadata: Metadata = {
  title: '会员方案与支付',
  description: '雅思写作月度会员 ¥19.99/月，包含 AI 写作批改、四项评分标准反馈、写作练习和学习复盘。按月自动续费，可随时取消下一期续费。'
}

const benefits = [
  { icon: FileCheck2, title: '看懂每一次批改', text: '获取 IELTS 模拟估分，以及四项写作评分标准的反馈与改进建议。' },
  { icon: BookOpen, title: '把练习变成习惯', text: '使用写作题目、Task 1 / Task 2 练习与完整模考，安排自己的学习节奏。' },
  { icon: Sparkles, title: '让进步有迹可循', text: '回看历史作文，结合学习规划、错题本与能力分析，找到下一步练习方向。' }
]

export default async function PricingPage() {
  const user = await getCurrentSupabaseUser()
  const prepaidReady = prepaidBillingEnabled()
  const paypalReady = prepaidBillingEnabled('gbp')
  const checkoutReady = Boolean(billingScope() && process.env.STRIPE_PRICE_MONTHLY?.trim()
    && process.env.STRIPE_WEBHOOK_SECRET?.trim() && process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim())

  return (
    <PricingMotion>
      <div className="pricing-ambient" aria-hidden="true"><span className="pricing-ambient-orb" /><span className="pricing-ambient-orb pricing-ambient-orb-secondary" /><span className="pricing-ambient-grid" /></div>
      <div className="pricing-container">
        <header className="pricing-header">
          <AuthBrandHeader />
          <nav aria-label="会员页面导航">{user ? <Link href="/billing">返回会员中心</Link> : <Link href="/login?next=%2Fpricing">登录账号</Link>}<a href="/billing#subscription-billing">我的订阅与账单<ArrowRight size={15} aria-hidden="true" /></a></nav>
        </header>

        <section className="pricing-hero" aria-labelledby="pricing-title">
          <span className="pricing-eyebrow" data-pricing-reveal=""><span aria-hidden="true" />为认真练习的你</span>
          <h1 id="pricing-title" data-pricing-reveal="">每一篇作文，<br /><span>都向前一步。</span></h1>
          <p data-pricing-reveal="">从一次批改，到有方向的持续练习。<br />用清晰的反馈，把时间花在真正需要改进的地方。</p>
          <div className="pricing-journey" data-pricing-reveal="" role="img" aria-label="持续练习、获得反馈、复盘改进，形成学习循环">
            <svg className="pricing-journey-lines" viewBox="0 0 560 80" fill="none" aria-hidden="true">
              <path className="pricing-journey-track" d="M80 28H480M480 28C530 28 530 70 480 70H80C30 70 30 28 80 28" />
              <path className="pricing-journey-energy" d="M80 28H480M480 28C530 28 530 70 480 70H80C30 70 30 28 80 28" pathLength="100" />
            </svg>
            <span className="pricing-journey-step"><BookOpen size={15} aria-hidden="true" />持续练习</span>
            <span className="pricing-journey-step"><FileCheck2 size={15} aria-hidden="true" />获得反馈</span>
            <span className="pricing-journey-step"><RotateCcw size={15} aria-hidden="true" />复盘改进</span>
            <span className="pricing-journey-caption" aria-hidden="true">让每一次练习，连接下一次进步</span>
          </div>
        </section>

        <div className="pricing-layout">
          <section className="pricing-benefits" aria-label="会员包含的功能">
            <h2 data-pricing-reveal="">一份会员，陪你完成练习与复盘</h2>
            {benefits.map(({ icon: Icon, title, text }) => (
              <article className="pricing-benefit" key={title} data-pricing-reveal="" data-pricing-spotlight="">
                <span><Icon size={23} aria-hidden="true" /></span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </article>
            ))}
            <p className="pricing-estimate-note" data-pricing-reveal="">独立 AI 雅思写作练习平台。AI 评分为学习参考用的模拟估分，不代表 IELTS 官方成绩，也不保证实际考试结果。</p>
          </section>

          <section className="pricing-offer" aria-labelledby="monthly-plan" data-pricing-reveal="" data-pricing-spotlight="">
            <div className="pricing-offer-top"><span id="monthly-plan">月度写作会员</span><span className="pricing-plan-tag">按月订阅</span></div>
            <p className="pricing-offer-price"><span>¥</span><strong>19.99</strong><span>/ 月</span></p>
            <p className="pricing-offer-caption">人民币计价，每月自动续费</p>
            {prepaidReady ? <p className="pricing-renewal-note">也可选择 ¥19.99 / 30天单次付款，支持微信支付与支付宝，到期不自动扣款。可用付款方式以收银台显示为准。</p> : null}
            {paypalReady ? <p className="pricing-renewal-note">PayPal 方案为 £2.49 / 30天单次付款，以英镑计价，到期不自动扣款。</p> : null}
            <ul><li><Check size={17} aria-hidden="true" />AI 写作批改与四项评分反馈</li><li><Check size={17} aria-hidden="true" />真题练习与完整模考</li><li><Check size={17} aria-hidden="true" />学习规划、错题本与能力分析</li><li><Check size={17} aria-hidden="true" />历史作文与学习记录</li></ul>
            {!checkoutReady ? <p className="pricing-coming-soon" role="status">在线订阅即将开放，欢迎先了解会员权益。</p> : null}
            <Link className="ui-primary-button pricing-cta" href="/billing"><CreditCard size={18} aria-hidden="true" />{user ? '前往会员中心' : checkoutReady ? '登录并开通会员' : '查看开通页面'}<ArrowRight size={17} aria-hidden="true" /></Link>
            <p className="pricing-renewal-note">可随时取消下一期续费。取消后，本期已付款权益保留至到期。</p>
            <p className="pricing-secure"><ShieldCheck size={16} aria-hidden="true" />付款由 Stripe 安全处理</p>
          </section>
        </div>

        <section className="pricing-faq" aria-labelledby="pricing-faq-title">
          <h2 id="pricing-faq-title" data-pricing-reveal="">付款前，你可能想了解</h2>
          <details><summary>开通会员需要做什么？</summary><p>先登录你的账号，在订阅页面确认月付方案和自动续费条款，再前往 Stripe 收银台付款。付款确认后，会员权益会自动关联到当前账号。</p></details>
          <details><summary>如何取消自动续费？</summary><p>登录后，在“会员中心”进入“管理订阅 / 取消续费”。取消会停止下一期续费，本期已付款权益仍可使用至到期。</p></details>
          {prepaidReady ? <details><summary>微信和支付宝会自动扣款吗？</summary><p>不会。选择“30天写作会员”后，单次支付 ¥19.99，确认到账后开通30天权益，到期手动再次购买。银行卡按月自动续费是单独的方案，需要另外确认自动续费条款。</p></details> : null}
          {paypalReady ? <details><summary>PayPal 如何计费？</summary><p>PayPal 方案单次支付 £2.49，确认到账后开通30天会员，不自动续费。收银台以英镑收费；如果你的 PayPal 资金来源使用其他货币，换汇金额与费用以 PayPal 确认页面为准。</p></details> : null}
          <details><summary>网站会保存我的银行卡信息吗？</summary><p>银行卡信息直接由 Stripe 处理，本站不接收或保存完整银行卡号。你可以在 Stripe 的订阅管理页面更新付款方式和查看账单。</p></details>
          <details><summary>已有会员权益，还需要重新订阅吗？</summary><p>现有有效会员权益会继续保留，无需重复开通。你可以在<Link href="/billing">会员中心</Link>查看当前状态与到期时间。</p></details>
        </section>

        <footer className="pricing-footer"><p>按自己的节奏练习，让反馈成为下一次进步的起点。</p><div><Link href="/terms">服务条款与退款规则</Link><Link href="/privacy">隐私政策</Link><Link href="/support">帮助与反馈</Link></div></footer>
      </div>
    </PricingMotion>
  )
}
