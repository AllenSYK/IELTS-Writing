# Supabase 密码恢复六位验证码邮件配置

密码恢复邮件由 Supabase Auth 直接发送。部署本仓库代码不会自动修改托管项目的 Dashboard 邮件模板或 SMTP 设置，必须由项目管理员完成以下配置。

## Recovery 邮件模板

1. 打开 Supabase Dashboard。
2. 选择项目 `IELTS-Writing`。
3. 进入 `Authentication`。
4. 进入 `Email Templates`。
5. 找到 `Reset Password` 或 `Recovery`。
6. Subject 填写：`【空与梦的雅思写作】密码重置验证码`
7. Message 粘贴下方完整 HTML。
8. 确认验证码位置使用 `{{ .Token }}`，而不是 `{{ .ConfirmationURL }}`。
9. 保存。
10. 使用专用测试邮箱从 `/forgot-password` 发起一次恢复请求，并完成收件与验证码验证。

```html
<div style="margin:0;padding:32px 16px;background:#f4f7ff;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#202124">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e9f5;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(47,79,156,0.08)">
    <div style="padding:28px 32px;background:linear-gradient(135deg,#eef3ff 0%,#f7f3ff 100%)">
      <div style="font-size:20px;font-weight:700;color:#315fce">
        空与梦的雅思写作
      </div>
      <div style="margin-top:6px;font-size:13px;color:#64708a">
        雅思写作智能学习与批改平台
      </div>
    </div>

    <div style="padding:32px">
      <h2 style="margin:0 0 14px;font-size:22px;color:#202124">
        重置登录密码
      </h2>

      <p style="margin:0 0 12px;line-height:1.8;font-size:15px;color:#4b5568">
        你正在为“空与梦的雅思写作”账号重置密码。
      </p>

      <p style="margin:0 0 20px;line-height:1.8;font-size:15px;color:#4b5568">
        请在网站的找回密码页面输入以下六位验证码：
      </p>

      <div style="margin:24px 0;padding:20px;text-align:center;background:#f2f5ff;border:1px solid #dce4ff;border-radius:16px;font-size:34px;font-weight:700;letter-spacing:10px;color:#315fce">
        {{ .Token }}
      </div>

      <p style="margin:20px 0 0;font-size:14px;color:#6b7280;line-height:1.8">
        验证码将在有效期后失效，请尽快完成验证，并且不要向任何人泄露验证码。
      </p>

      <p style="margin:10px 0 0;font-size:14px;color:#6b7280;line-height:1.8">
        如果不是你本人发起的操作，请忽略本邮件，你的账号密码不会发生变化。
      </p>
    </div>

    <div style="padding:18px 32px;background:#f8f9fc;font-size:12px;color:#8790a3;line-height:1.7">
      本邮件由系统自动发送，请勿直接回复。
    </div>
  </div>
</div>
```

模板不包含重置链接。官方模板变量 `{{ .Token }}` 会显示 Supabase Auth 生成的六位 OTP；应用不会生成、读取或保存这串验证码。

## Custom SMTP

生产环境应在 Supabase Dashboard 的 Authentication SMTP 设置中确认并配置：

1. SMTP host
2. SMTP port
3. SMTP username
4. SMTP password
5. sender email
6. sender name：`空与梦的雅思写作`

SMTP password 只能保存在 Supabase 的受保护配置中，不得提交到 GitHub，不得写入前端、`NEXT_PUBLIC_` 环境变量、日志或普通数据库表。

完成后还应在发件域名 DNS 与邮件服务商控制台确认 SPF、DKIM 和 DMARC 状态。Supabase 默认邮件服务仅适合试用；生产环境应使用已验证域名的 Custom SMTP。

## OTP 有效期

Recovery OTP 使用 Supabase 项目的邮件 OTP 有效期配置。可在 `Authentication → Sign In / Providers → Email` 中查看并确认。仓库代码无法可靠读取托管项目的当前值，因此页面和邮件只写“验证码将在有效期后失效”，不会硬编码具体分钟数。
