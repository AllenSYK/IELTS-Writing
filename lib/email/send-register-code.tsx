import { render } from '@react-email/render'
import { RegisterVerificationEmail } from '@/emails/RegisterVerificationEmail'
import { WelcomeEmail } from '@/emails/WelcomeEmail'
import { emailBrand, getEmailFrom, getSiteUrl } from './brand'
import { getResendClient } from './resend'

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to: [to],
    subject,
    html,
    text
  })

  if (error) {
    const message = error.message || '邮件发送失败，请稍后重试。'
    throw new Error(message.includes('domain') ? '发件域名尚未完成验证，请检查邮件服务配置。' : message)
  }

  return data?.id || null
}

export async function sendRegisterCodeEmail(to: string, code: string) {
  const html = await render(<RegisterVerificationEmail code={code} email={to} />)
  return sendEmail({
    to,
    subject: `验证您的 ${emailBrand.productName} 账号`,
    html,
    text: [
      `验证您的邮箱`,
      `您正在注册 ${emailBrand.productName} 账号，请使用以下验证码完成邮箱验证：`,
      code,
      '验证码将在 10 分钟后失效。',
      `${emailBrand.productName} 工作人员不会向您索要验证码。`
    ].join('\n')
  })
}

export async function sendWelcomeEmail(to: string) {
  const html = await render(<WelcomeEmail loginUrl={`${getSiteUrl()}/login`} />)
  return sendEmail({
    to,
    subject: `欢迎使用 ${emailBrand.productName}`,
    html,
    text: `您的 ${emailBrand.productName} 账号已创建。请登录并输入软件激活码开通使用权限：${getSiteUrl()}/login`
  })
}
