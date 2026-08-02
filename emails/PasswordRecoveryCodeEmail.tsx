import { AuthCodeEmailLayout } from '@/emails/AuthCodeEmailLayout'
import { emailBrand } from '@/lib/email/brand'

type PasswordRecoveryCodeEmailProps = {
  code: string
}

export function PasswordRecoveryCodeEmail({ code }: PasswordRecoveryCodeEmailProps) {
  return (
    <AuthCodeEmailLayout
      preview={`您的 ${emailBrand.productName} 密码重置验证码是 ${code}。`}
      eyebrow="密码安全"
      heading="重置登录密码"
      description={<>你正在重置“{emailBrand.productName}”账号密码。请在找回密码页面输入以下六位验证码：</>}
      code={code}
      codeHint="验证码将在有效期后失效，请勿向任何人泄露。"
      safetyText="如果不是你本人发起的操作，请忽略本邮件。"
    />
  )
}

export default PasswordRecoveryCodeEmail
