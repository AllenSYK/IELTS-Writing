import { redirect } from 'next/navigation'
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react'
import { WritingActivityHeatmap } from '@/components/dashboard/WritingActivityHeatmap'
import { checkActiveWebLicenseForUser, getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { accountDisplayName } from '@/lib/phone-auth'

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  return new Date(value).toLocaleString('zh-CN')
}

function daysLeft(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

export default async function DashboardPage() {
  const user = await getCurrentSupabaseUser()
  if (!user) redirect('/login')

  const [profile, check] = await Promise.all([
    getWebProfile(user.id),
    checkActiveWebLicenseForUser(user)
  ])
  if (profile?.role === 'admin') redirect('/admin/licenses')

  if (!check.ok) redirect('/activate')

  return (
    <main className="ui-page dashboard-page" data-main-content tabIndex={-1}>
      <section className="dashboard-main">
        <section className="dashboard-grid">
          <article className="dashboard-card">
            <CheckCircle2 size={20} />
            <span>激活状态</span>
            <strong>{check.profile.license_status === 'active' ? '已激活' : check.profile.license_status}</strong>
          </article>
          <article className="dashboard-card">
            <CalendarDays size={20} />
            <span>套餐</span>
            <strong>{check.license.plan}</strong>
          </article>
          <article className="dashboard-card">
            <Clock3 size={20} />
            <span>剩余有效天数</span>
            <strong>{daysLeft(check.activation.expires_at)} 天</strong>
          </article>
        </section>

        <section className="dashboard-panel dashboard-license-panel">
          <h2>激活信息</h2>
          <dl className="dashboard-definition-list">
            <div><dt>激活账号</dt><dd>{check.activation.email || accountDisplayName(user)}</dd></div>
            <div><dt>激活时间</dt><dd>{formatDate(check.activation.activated_at)}</dd></div>
            <div><dt>到期时间</dt><dd>{formatDate(check.activation.expires_at)}</dd></div>
            <div><dt>最近使用</dt><dd>{formatDate(check.activation.last_used_at)}</dd></div>
          </dl>
        </section>

        <WritingActivityHeatmap userId={user.id} />
      </section>
    </main>
  )
}
