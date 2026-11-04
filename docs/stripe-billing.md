# Stripe 订阅支付

2026-11-03 新增微信 / 支付宝人民币30天单次会员，以及 PayPal 英镑30天单次会员的接入代码，原有自动续费继续保留。钱包尚待账户开通，入口暂未启用。见[接入与验证记录](stripe-wallets-setup-2026-11-03.md)。

月度会员为人民币 **¥19.99/月**，按月自动续费。年付仅在配置年度 Price ID 后出现；目前未设置年付价格。

用户从应用侧栏进入 `/billing` 会员中心（原 `/activate`、`/dashboard`、`/settings` 均重定向到此页），明确勾选自动续费同意后跳转到 Stripe Checkout。付款方式、银行卡和发票由 Stripe 处理。用户可通过“管理订阅 / 取消续费”进入 Stripe Customer Portal，取消下一期续费、修改付款方式、查看账单。

2026-10-25 已在新会话成功调用官方 Stripe MCP `stripe_implementation_planner`，生成并接受本业务计划，随后复核现有实现。见[官方计划复核](stripe-official-plan-review-2026-10-25.md)及[新账户实测记录](stripe-payment-verification-2026-10-25.md)。

## 环境配置

仅服务端读取以下设置，密钥放在 `.env.local` 或 Vercel 的 Secret 环境变量中：

| 变量 | 用途 |
| --- | --- |
| `STRIPE_SECRET_KEY` | 推荐使用具备必要权限的 restricted key；沙盒和正式环境分别配置 |
| `STRIPE_ACCOUNT_ID` | 密钥所属的 Stripe 账号，用于隔离不同沙盒和正式账号 |
| `STRIPE_PRICE_MONTHLY` | CNY 1999 分、每 1 个月自动续费的有效 Price |
| `STRIPE_PRICE_YEARLY` | 可选，CNY、每 1 年自动续费的有效 Price |
| `STRIPE_WEBHOOK_SECRET` | 当前回调地址的签名密钥；本地 CLI 与线上端点的密钥不同 |
| `STRIPE_PORTAL_CONFIGURATION_ID` | 取消方式为 `at_period_end` 的 Customer Portal 配置 |
| `NEXT_PUBLIC_SITE_URL` | 正式站点的 HTTPS 地址；本地开发和 Vercel Preview 使用各自返回地址 |

运行以下命令会在当前密钥所属账号创建或复用标准会员产品、¥19.99 月付 Price、Customer Portal 配置，并把生成的 ID 合并进 `.env.local`。不会覆盖其他本地配置，不会打印密钥。

```bash
node --experimental-strip-types scripts/setup-stripe.mjs
```

已应用迁移：`supabase/migrations/20261025160805_stripe_subscriptions.sql`。新增三张只允许服务端访问的 billing 表及两个服务端 RPC，不修改现有激活码或授权记录。RLS 开启，`anon` 和 `authenticated` 没有表权限或 RPC 执行权限。Supabase Advisor 的 “RLS Enabled No Policy” 信息提示在这里是有意的默认拒绝策略。

## 回调

必需端点：`POST /api/billing/webhook`。必须启用 `lib/billing/config.ts` 中 `BILLING_EVENTS` 列出的全部事件，包括订阅状态、账单付款、付款失败、异步 Checkout 以及退款、争议和欺诈预警。

本地使用官方 Stripe CLI。安装 `@stripe/cli` 后，通过应用配置启动，避免 CLI 之前保存的登录指向旧账户：

```bash
npm run stripe:listen
# 指定本地开发端口时：
STRIPE_LOCAL_PORT=3002 npm run stripe:listen
```

脚本验证 `.env.local` 中密钥所属的账号，通过子进程环境传给 CLI，自动监听全部必需事件，并将签名密钥安全写入本地 `STRIPE_WEBHOOK_SECRET`，输出中不显示密钥。收到 Ready 后重新启动开发服务器。脚本仅允许测试密钥；如 CLI 不在 PATH，可用 `STRIPE_CLI_PATH` 指定可执行文件。不要把 CLI 密钥用于线上端点。创建线上回调可运行：

```bash
node --experimental-strip-types scripts/setup-stripe.mjs --webhook-url=https://YOUR_DOMAIN/api/billing/webhook
```

此命令只在端点不存在时创建，签名密钥只写本地文件；需要将其同步到对应 Vercel 环境。端点已存在时，继续使用原签名密钥，不会生成替代值。

切换账户可显式提供被 Git 忽略的配置文件及预期账号 ID：

```bash
node --experimental-strip-types scripts/setup-stripe.mjs --env-file=.env.stripe-ielts.local --account=acct_1UUWf9Ebgvz3XBhs
```

脚本先验证密钥所属账号，检查已存在的月付价格及门户设置，再更新 `.env.local`，文件权限固定为 `600`。账户或测试/正式模式改变时，移除旧年度价格、回调密钥、MCP key 和旧公开密钥；新配置文件提供的公开密钥会重新写入。回调签名必须从新账户的 CLI listener 或 HTTPS 端点重新获得。重复执行不创建第二套价格或门户；已有 HTTPS 端点会同步必需事件并启用。

正式环境使用单独的输入与输出文件，通过 `--output-env-file` 保存结果；正式密钥若使用默认 `.env.local` 输出会被拒绝，以保护本地沙盒配置。所有 `.env.*` 文件均被 Git 忽略，输出文件权限固定为 `600`。

## 权限与可靠性

- 收银台金额和币种读取服务器配置的 Stripe Price。客户端无法提交金额、用户 ID 或 Stripe 客户 ID。
- Checkout 显式使用 flexible billing mode，不限定付款方式类型。为遵守当前固定人民币报价，Adaptive Pricing 保持关闭；Stripe Tax 保持关闭，直至确认适用的有效注册。
- 创建支付和门户会话前，必须验证指定门户处于同一环境且启用期末取消、账单查询、付款方式更新，并关闭套餐变更。缺少或不符合要求的门户配置会拒绝创建，防止默认门户设置违背期末取消承诺。
- 在数据库锁中为待支付 Checkout 保存唯一的 idempotency key，同一账号的并发点击和重试复用同一支付。创建前同时检查 Stripe 现有订阅，防止回调延迟造成重复订阅。
- 每次回调都验证原始请求体签名及测试/正式模式。通过 Stripe Customer ID 映射当前应用的用户，其他产品的付款不会获得本系统权益。
- 重新读取 Stripe 当前订阅及最近已付款账单；有效期取匹配 Price 的实际已付款周期，不根据 URL 参数或尚未付款的新周期开放权限。
- 回调事件去重与权益写入在同一事务完成；过时的状态快照不能覆盖更新结果；写入失败返回非 2xx，允许 Stripe 重试。
- 取消下一期续费时，本期权益保留至已付款周期结束。续费付款失败不延长有效期；`canceled`、`unpaid`、`paused` 和未完成首次付款不授予权限。
- 激活码开通入口已停用；原有有效授权继续保留。订阅权益单独保存，订阅失效不会撤销独立有效的历史权益。
- 用户可以点击“刷新状态”重新核对本人 Stripe 订阅。成功返回页也会核对一次，以处理回调延迟；回调仍是必需路径。
- 全额退款、支付争议和早期欺诈预警会设置 `risk_hold`，暂停对应订阅权益，后续普通回调不会清除。部分退款不会自动撤销整个订阅。风险复核后由服务端管理员处理，不能通过浏览器改写 billing 表。
- Billing 查询按用户、Stripe 账号和 `livemode` 共同隔离；Vercel Production 明确拒绝沙盒密钥，测试付款不会开放正式站点权益。

现有激活码表的外键保持不变。订阅使用记录写入 `usage_records` 时 `license_id` 为空，用户维度的使用统计正常记录；不会把 Stripe Subscription ID 填入 UUID 外键。

## 检查与正式启用

```bash
npm run ci
npm run build
```

支付行为测试在 `tests/stripe-billing.test.ts`。事务测试 `supabase/tests/stripe_subscriptions.sql` 验证权限、并发支付键、事件去重、乱序处理和风险状态，并在结束时回滚测试数据。应优先在一次性数据库运行。

当前使用用户重新建立并授权的 **“雅思 沙盒”** `acct_1UUWf9Ebgvz3XBhs`；本地和 Vercel Development 已切换到该账户。旧 Marketplace 沙盒不再是当前应用支付配置，旧 MCP key 已移除。Vercel Development 的六项 Stripe 配置已回读比对一致；本地 CLI 回调密钥仅保存在本地，没有上传至 Vercel。Development 不是线上部署环境，目前没有为新沙盒创建线上 HTTPS 回调端点。

正式配置已于 2026-11-03 完成：正式受限运行密钥、月费价格、Customer Portal 和必需的 HTTPS 签名回调均已配置到 Production，正式订阅入口已发布。详见[正式配置与验收记录](stripe-live-configuration-2026-11-03.md)。商户身份、企业资料和条款由商户本人完成。本次未调整 Billing 的 Smart Retries、失败付款邮件和重试结束策略，也没有宣称这些 Dashboard 设置已开启；真实实付到账与续费生命周期尚未进行真实扣款验收。

Stripe Tax 没有自动启用。上线前应确认销售地区对应的税务安排；需要自动计税时，先确认已有适用的有效税务注册，再配置 Stripe Tax。设置 `automatic_tax` 本身不会代替税务注册，参考 [Stripe 订阅税务文档](https://docs.stripe.com/billing/taxes/collect-taxes)。
