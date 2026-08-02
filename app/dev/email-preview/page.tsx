import { render } from '@react-email/render'
import { notFound } from 'next/navigation'
import { PasswordRecoveryCodeEmail } from '@/emails/PasswordRecoveryCodeEmail'
import { RegisterVerificationEmail } from '@/emails/RegisterVerificationEmail'
import { WelcomeEmail } from '@/emails/WelcomeEmail'
import { getSiteUrl } from '@/lib/email/brand'

export default async function EmailPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  const registerHtml = await render(<RegisterVerificationEmail code="123456" email="a***@163.com" />)
  const recoveryHtml = await render(<PasswordRecoveryCodeEmail code="123456" />)
  const welcomeHtml = await render(<WelcomeEmail loginUrl={`${getSiteUrl()}/login`} />)

  return (
    <main className="ui-page email-preview-page" data-main-content tabIndex={-1}>
      <section className="email-preview-shell">
        <header className="email-preview-header">
          <div>
            <p className="ui-label">Email Preview</p>
            <h1>邮件模板预览</h1>
          </div>
          <span>模拟验证码 123456</span>
        </header>

        <div className="email-preview-grid">
          <article>
            <h2>注册验证码邮件</h2>
            <iframe title="注册验证码邮件预览" srcDoc={registerHtml} />
          </article>
          <article>
            <h2>密码重置验证码邮件</h2>
            <iframe title="密码重置验证码邮件预览" srcDoc={recoveryHtml} />
          </article>
          <article>
            <h2>欢迎邮件</h2>
            <iframe title="欢迎邮件预览" srcDoc={welcomeHtml} />
          </article>
        </div>
      </section>
    </main>
  )
}
