import { AuthCodeEmailLayout } from '@/emails/AuthCodeEmailLayout'
import { emailBrand } from '@/lib/email/brand'

type RegisterVerificationEmailProps = {
  code: string
  email?: string
  expiresInMinutes?: number
}

export function RegisterVerificationEmail({
  code,
  email,
  expiresInMinutes = 10
}: RegisterVerificationEmailProps) {
  return (
    <AuthCodeEmailLayout
      preview={`您的 ${emailBrand.productName} 注册验证码是 ${code}，${expiresInMinutes} 分钟内有效。`}
      eyebrow="邮箱验证"
      heading="验证您的邮箱"
      description={<>您正在注册 {emailBrand.productName} 账号{email ? `（${email}）` : ''}。请使用以下 6 位邮箱验证码完成验证。</>}
      code={code}
      codeHint={<>验证码将在 {expiresInMinutes} 分钟后失效，可直接复制使用。</>}
      safetyText={<>请勿将验证码透露给任何人。{emailBrand.productName} 工作人员不会向您索要验证码。如果这不是您的操作，可以直接忽略本邮件。</>}
    />
  )
}

export default RegisterVerificationEmail
