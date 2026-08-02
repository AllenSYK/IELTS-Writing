# Supabase 密码恢复六位验证码配置

密码恢复邮件由 `Supabase Auth → Resend SMTP → 用户邮箱` 发送。Resend 只负责 SMTP 投递，邮件正文和验证码都由 Supabase Auth 管理；应用继续调用 `resetPasswordForEmail`，不会生成、读取或保存第二套 Recovery OTP。

部署仓库代码不会自动修改托管 Supabase 项目的 Auth 配置。完成代码部署后，项目管理员仍需在 Dashboard 完成下面两项设置，并重新发送一封新邮件验收。

## 第一步：把 Email OTP Length 设置为 6

1. 打开 Supabase Dashboard 并选择生产项目。
2. 进入 `Authentication → Sign In / Providers → Email`。
3. 找到 `Email OTP Length` 或 `OTP Length`。
4. 设置为 `6` 并保存。
5. 重新发起一次找回密码请求。

旧邮件中的 8 位验证码不会自动变成 6 位，也不能在六格输入中使用。不要截取旧验证码的前六位尝试验证。

## 第二步：更新 Reset password 邮件

进入：

`Supabase Dashboard → Authentication → Emails → Reset password → Source`

Subject：

```text
【空与梦的雅思写作】密码重置验证码
```

Body 粘贴以下完整 HTML Source：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <title>【空与梦的雅思写作】密码重置验证码</title>
  </head>
  <body style="margin:0;background-color:#f3f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">你的空与梦的雅思写作密码重置验证码。</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f3f7fb;">
      <tr>
        <td align="center" style="padding:36px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;border:1px solid #e4eaf2;border-radius:24px;background-color:#ffffff;box-shadow:0 24px 70px rgba(15,23,42,0.10);overflow:hidden;">
            <tr>
              <td style="padding:30px 34px 18px;background-color:#fbfdff;">
                <span style="display:inline-block;padding:9px 12px;border:1px solid #e7edf6;border-radius:16px;background-color:#ffffff;">
                  <img src="https://www.ieltswriting.online/brand/kongyumeng-logo.png" width="34" height="34" alt="空与梦的雅思写作" style="display:inline-block;width:34px;height:34px;border:0;vertical-align:middle;">
                </span>
                <span style="display:inline-block;margin-left:10px;color:#172033;font-size:16px;font-weight:700;vertical-align:middle;">空与梦的雅思写作</span>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 34px 34px;">
                <p style="margin:0 0 10px;color:#0a66ff;font-size:13px;font-weight:700;letter-spacing:0.02em;">密码安全</p>
                <h1 style="margin:0 0 14px;color:#0f172a;font-size:30px;line-height:1.22;font-weight:760;">重置登录密码</h1>
                <p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.7;">你正在重置“空与梦的雅思写作”账号密码。请在找回密码页面输入以下六位验证码：</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:28px 0;border:1px solid #d8e6ff;border-radius:18px;background-color:#f5f9ff;">
                  <tr>
                    <td align="center" style="padding:22px 18px;">
                      <p style="display:block;margin:0;color:#0b1220;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:38px;font-weight:800;letter-spacing:0.24em;line-height:1;text-indent:0.24em;">{{ .Token }}</p>
                      <p style="margin:14px 0 0;color:#64748b;font-size:13px;line-height:1.5;">验证码将在有效期后失效，请勿向任何人泄露。</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:22px 0 0;border:1px solid #edf2f7;border-radius:16px;background-color:#f8fafc;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 6px;color:#172033;font-size:14px;font-weight:700;">安全提示</p>
                      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">如果不是你本人发起的操作，请忽略本邮件。</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:1px;padding:0;background-color:#edf2f7;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:22px 34px 30px;background-color:#fbfdff;text-align:center;">
                <p style="margin:0 0 8px;color:#0a66ff;font-size:12px;line-height:1.6;">https://www.ieltswriting.online · qgyxzq@gmail.com</p>
                <p style="margin:0 0 8px;color:#7b8798;font-size:12px;line-height:1.6;">© 2026 空与梦的雅思写作. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

`{{ .Token }}` 是 Supabase Auth 生成的 Recovery OTP 模板变量。模板不得替换为 `{{ .ConfirmationURL }}`，也不得加入重置链接、按钮链接或前端脚本。

## 第三步：确认 Resend SMTP

在 Supabase Dashboard 的 Authentication SMTP 设置中确认：

1. SMTP host、port、username 和 password 已配置为 Resend 提供的值；
2. sender email 使用已经在 Resend 验证的发件域名；
3. sender name 为 `空与梦的雅思写作`；
4. 发件域名的 SPF、DKIM 和 DMARC 状态正常。

SMTP password 只能保存在 Supabase 的受保护配置中，不得提交到 Git、写入前端环境变量、日志或普通数据库表。使用 Resend SMTP 时，Supabase 的自定义邮件模板仍由 Supabase Auth 渲染，Resend 不会读取本仓库的 React Email 组件。

## 第四步：Production 人工验收

1. 保存 OTP Length 和 Reset password 模板后，从 Production `/forgot-password` 发起一条全新的请求。
2. 确认新邮件包含 6 位数字验证码，视觉与注册验证码邮件一致。
3. 确认邮件没有默认英文正文、确认链接或链接按钮。
4. 在网站六格输入中完成验证码验证并设置新密码。
5. 确认新密码可登录，恢复会话在完成后已退出。
6. 再发起一次注册验证码，确认注册邮件视觉没有变化。

测试必须使用专用测试邮箱。旧邮件不能用于验收；仓库自动化测试也不会向真实邮箱发送邮件。
