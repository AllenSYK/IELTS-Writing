import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, CheckCircle2, Clock3, PenLine } from 'lucide-react'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { checkActiveWebLicenseForUser, getCurrentSupabaseUser, getWebProfile } from '@/lib/web-license/auth'
import { LogoutButton } from './LogoutButton'

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

  const service = createSupabaseServiceRoleClient()
  const [profile, check, recentUsageResult] = await Promise.all([
    getWebProfile(user.id),
    checkActiveWebLicenseForUser(user),
    service
      .from('usage_records')
      .select('id, action, model, success, error_message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)
  ])
  if (profile?.role === 'admin') redirect('/admin/licenses')

  if (!check.ok) redirect('/activate')

  const recentUsage = recentUsageResult.data

  return (
    <main className="stitch-page dashboard-page" data-main-content tabIndex={-1}>
      <section className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="stitch-label">Web Dashboard</p>
            <h1>账号中心</h1>
            <p className="stitch-body-md">{user.email}</p>
          </div>
          <div className="dashboard-actions">
            <Link className="stitch-primary-button" href="/practice">
              <PenLine size={16} />
              进入练习
            </Link>
            <LogoutButton />
          </div>
        </header>

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

        <section className="dashboard-panel">
          <h2>激活信息</h2>
          <dl className="dashboard-definition-list">
            <div><dt>激活邮箱</dt><dd>{check.activation.email}</dd></div>
            <div><dt>激活时间</dt><dd>{formatDate(check.activation.activated_at)}</dd></div>
            <div><dt>到期时间</dt><dd>{formatDate(check.activation.expires_at)}</dd></div>
            <div><dt>最近使用</dt><dd>{formatDate(check.activation.last_used_at)}</dd></div>
          </dl>
        </section>

        <section className="dashboard-panel">
          <h2>最近批改记录</h2>
          {recentUsage?.length ? (
            <div className="dashboard-usage-list">
              {recentUsage.map((item) => (
                <div key={item.id}>
                  <span>{item.action === 'generate_prompt' ? 'AI 生成题目' : 'AI 批改'}</span>
                  <strong>{item.success ? '成功' : '失败'}</strong>
                  <small>{formatDate(item.created_at)} · {item.model || '默认模型'}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">暂无批改记录。开始一次练习后会显示在这里。</p>
          )}
        </section>
      </section>
    </main>
  )
}
