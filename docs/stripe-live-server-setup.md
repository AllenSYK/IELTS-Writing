# 将正式 Stripe 接入当前网站

网站前端和支付接口都运行在 Vercel 的 `allensyks-projects/ielts-writing` 项目中，不需要再单独租一台服务器。Stripe 账户授权让开发工具访问账户；网站运行时仍需要独立的服务端密钥和正式付款配置。

## 当前进度

- 正式账户已注册并授权。
- Checkout、订阅管理、签名回调、权益同步和账单查询代码已具备。
- 2026-11-03 已保存正式受限密钥，创建正式 Price、Portal 和签名回调，并写入 Vercel Production；正式开通入口已发布。详见[正式配置与验收记录](stripe-live-configuration-2026-11-03.md)。
- 运行密钥在首次配置后已收窄，产品、价格修改与 Webhook 管理权限已撤销。下列首次配置步骤保留作维护参考，日常运行不需要重新执行配置脚本。

## 配置顺序

1. 在 Stripe 正式模式准备服务端受限密钥，安全填写到已准备的 `.env.stripe-live.local`，不要发到聊天，也不要放入任何 `NEXT_PUBLIC_` 变量。运行密钥只授予当前集成需要的权限：Customers、Checkout Sessions 和 Customer Portal 所需写权限，以及 Prices、Subscriptions、Invoices、Invoice Payments、Charges、Portal Configuration 所需读权限。创建产品、价格、Portal 和 Webhook 的首次配置需要相应管理权限；可与日常运行密钥分开。
2. 创建正式的人民币 19.99 元/月循环价格、开启 Customer Portal 的账单历史和付款方式更新，并设置为到期取消续费。现有 `scripts/setup-stripe.mjs` 会核对账户、验证或复用价格及 Portal，避免重复配置。
3. 配置正式 HTTPS Webhook：`https://www.ieltswriting.online/api/billing/webhook`。使用代码中 `BILLING_EVENTS` 的完整事件列表，覆盖首次付款、续费、失败付款、订阅变化、退款、争议和欺诈预警。把该端点的签名密钥填入 `STRIPE_WEBHOOK_SECRET`；本地 Stripe CLI 的签名密钥不能用于正式端点。
4. 将下表变量保存到该 Vercel 项目的 **Production** 环境，再部署。密钥变量使用 Sensitive 类型；`.env.stripe-live.local` 本身不上传，开发用 `.env.local` 保留沙盒配置。
5. 验收收银台、签名回调、会员到期时间、每期账单、取消下一期续费，以及失败付款不延长权益。成功跳转地址不直接授予会员。真实付款需要商户本人参与确认。

| Vercel Production 变量 | 内容 |
| --- | --- |
| `STRIPE_SECRET_KEY` | 正式服务端受限密钥，通常以 `rk_live_` 开头 |
| `STRIPE_ACCOUNT_ID` | 已授权正式账户 ID |
| `STRIPE_PRICE_MONTHLY` | 正式循环月费 Price ID |
| `STRIPE_PORTAL_CONFIGURATION_ID` | 正式 Customer Portal 配置 ID |
| `STRIPE_WEBHOOK_SECRET` | 正式网站回调端点的签名密钥 |
| `NEXT_PUBLIC_SITE_URL` | `https://www.ieltswriting.online` |

首次配置命令（不在命令行中放入密钥；当前运行密钥已不含 Webhook 管理权限）：

```sh
node scripts/setup-stripe.mjs --env-file=.env.stripe-live.local --output-env-file=.env.stripe-live.local --webhook-url=https://www.ieltswriting.online/api/billing/webhook
```

税务方面，当前没有自动启用 Stripe Tax；如需自动计税，应先确认适用的有效税务注册，再配置收税。

官方参考：[API 密钥](https://docs.stripe.com/keys)、[Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal)、[订阅 Webhook](https://docs.stripe.com/billing/subscriptions/webhooks)、[Invoice API](https://docs.stripe.com/api/invoices/list)。
