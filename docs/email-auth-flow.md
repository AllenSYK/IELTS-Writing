# 邮箱验证码与品牌邮件配置

本项目的网站注册验证码和欢迎邮件使用 Resend + React Email。密码恢复验证码由 Supabase Auth Recovery OTP 通过 Supabase 邮件模板与 SMTP 直接发送，应用服务器不读取验证码，也不生成重置链接。

## 本地预览

```bash
npm run email:dev
```

打开：

```text
http://127.0.0.1:3000/dev/email-preview
```

预览页只在开发环境开放，不会发送真实邮件，注册和密码恢复预览都使用模拟验证码 `123456`。

## 环境变量

```env
RESEND_API_KEY=
EMAIL_FROM_NAME=空与梦的雅思写作
EMAIL_FROM_ADDRESS=noreply@ieltswriting.online
EMAIL_VERIFICATION_SECRET=replace-with-32-plus-random-bytes
NEXT_PUBLIC_SITE_URL=https://www.ieltswriting.online
```

`RESEND_API_KEY` 和 `EMAIL_VERIFICATION_SECRET` 只能放在服务端环境变量中，不能使用 `NEXT_PUBLIC_` 前缀。

## Resend 域名验证

1. 在 Resend 控制台添加域名 `ieltswriting.online`。
2. 按 Resend 提示到 DNS 服务商添加 SPF、DKIM、Return-Path 等记录。
3. 等 Resend 显示域名 verified 后，将 `EMAIL_FROM_ADDRESS` 设置为 `noreply@ieltswriting.online`。
4. 在 Vercel Production、Preview、Development 环境都添加同名环境变量。

如果域名暂时未验证，开发阶段可以临时使用 Resend 提供的测试发件地址。切回正式域名时只需要修改 `EMAIL_FROM_ADDRESS`，无需修改邮件模板或 API。

## 模板位置

- `emails/RegisterVerificationEmail.tsx`
- `emails/PasswordRecoveryCodeEmail.tsx`
- `emails/AuthCodeEmailLayout.tsx`
- `emails/WelcomeEmail.tsx`
- `lib/email/brand.ts`

品牌名、Logo、站点 URL、支持邮箱、主色、版权信息集中在 `emailBrand` 中。

注册和密码恢复验证码邮件共用 `AuthCodeEmailLayout`。React Email 的密码恢复组件用于开发预览和视觉回归；Production 正文仍由 Supabase Auth 模板渲染。请按 [`docs/supabase-password-recovery-otp-template.md`](./supabase-password-recovery-otp-template.md) 将等价的静态 HTML 配置到 Dashboard。
