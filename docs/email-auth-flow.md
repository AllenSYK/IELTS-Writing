# 邮箱验证码与品牌邮件配置

本项目的网站注册验证码、欢迎邮件、密码重置邮件统一使用 Resend + React Email。

## 本地预览

```bash
npm run email:dev
```

打开：

```text
http://127.0.0.1:3000/dev/email-preview
```

预览页只在开发环境开放，不会发送真实邮件，默认使用模拟验证码 `438291`。

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
- `emails/PasswordResetEmail.tsx`
- `emails/WelcomeEmail.tsx`
- `lib/email/brand.ts`

品牌名、Logo、站点 URL、支持邮箱、主色、版权信息集中在 `emailBrand` 中。
