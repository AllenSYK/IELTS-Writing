# Stripe 支付验证记录 — 2026-10-25

## 本次验证范围

本记录以用户重新创建的 **“雅思 沙盒”** `acct_1UUWf9Ebgvz3XBhs` 为准。旧 Marketplace 沙盒 `acct_1UUSHJEEv2kkDUnV` 的早前实测不计入本次结果。

人民币 **¥19.99/月** 自动续费，未配置年付。Stripe SDK **23.0.1**（本次核对 npm 当前版本一致），API **2026-09-30.endive**。官方 MCP 已认证，且真实调用并接受了官方规划器计划；见[计划及复核](stripe-official-plan-review-2026-10-25.md)。本次只测试本地和更新 Vercel Development，没有部署到正式网站，也没有真实扣款。

## 自动化及配置检查

| 检查 | 结果 |
| --- | --- |
| `npm run ci` | **225 项测试通过**，TypeScript、静态检查及旧地图检查通过；原有 11 项未使用变量警告，没有新增错误 |
| `npm run build` | 生产构建通过，包含订阅页面及 billing API |
| 付款方案 | 新 Price `price_1UUWyZEbgvz3XBhshsbDhZwI`，CNY 1999，每 1 个月，测试模式；实测 Subscription 的 billing mode 为 flexible |
| 门户 | 新配置 `bpc_1UUWyZEbgvz3XBhsPnS4DJ3x`，启用期末取消、付款方式更新和账单；缺少配置或立即取消模式在开通前拒绝 |
| 初始化脚本 | 指定错误账号 ID 会在写配置或创建对象前拒绝；重复执行复用同一 Price 和 Portal；配置文件权限为 `600` |
| Vercel Development | 六项新 Stripe 配置已安全更新并回读比对一致；移除旧 `STRIPE_MCP_KEY`；本地 CLI 回调密钥没有上传；Production、Preview 未配置本次测试支付 |
| 未登录支付 | 本地真实 HTTP 请求 **401** |
| 客户端增加金额字段 | **400** |
| 重复订阅 | **409** |
| 跨站支付请求 | **403** |
| 缺少签名、篡改请求体、签名正确但测试/正式模式不匹配 | 均 **400** |
| 页面安全响应头 | CSP 与 `X-Frame-Options: DENY` 存在 |

数据库迁移没有在本次改写或重新应用；早前 PostgreSQL 事务测试属于既有实现证据。此次直接验证新沙盒的回调写入、用户归属和权益结果。

## 新“雅思”账户的完整流程

1. 停止旧沙盒 Stripe CLI listener 和本地服务器，安全备份旧配置，切换新账户密钥、Price、Portal，启动新账户 listener，监听全部 `BILLING_EVENTS`，仅转发 `localhost:3002/api/billing/webhook`。
2. 创建专用临时测试用户，经网页登录进入 `/billing`。页面只显示月付人民币 ¥19.99，并明确提示测试环境；未勾选自动续费时按钮禁用。
3. 从网站创建托管 Checkout；官方收银台的订单摘要返回 `livemode=false`、`currency=cny`、`totalAmount=1999`。使用官方测试卡完成沙盒付款。
4. 收到真实 `invoice.paid`、`customer.subscription.created`、`checkout.session.completed`，本地回调全部 **HTTP 200**。数据库记录为 `active`，付款周期截至 **2026-11-25 19:24:52 UTC**；授权接口返回 `active=true`，网站显示权益已开通。
5. 经网站进入新账户 Customer Portal，账单显示 CNY 19.99 已付。自助取消下一期续费，`customer.subscription.updated` 回调 **HTTP 200**。数据库与网站均显示自动续费已取消，`paid_through` 完全不变，授权仍为 `active=true`。
6. 通过官方 Stripe MCP 对该专用沙盒付款做 CNY 1999 全额测试退款，退款 `succeeded`。真实 `charge.refunded` 回调 **HTTP 200**；数据库 `risk_hold=true`，授权接口返回 `active=false`。网站显示“支付需要核实”，访问 `/practice` 重新进入激活页。
7. 新增门户校验后，再经网站打开门户成功。测试完成后退出浏览器登录，撤销临时测试用户会话并清理专用客户及数据库测试数据；保留可复用的产品、Price、Portal 和验证记录。

清理阶段删除专用 Stripe 客户会额外触发 `customer.subscription.deleted`。该事件处理与删除临时用户映射并发，出现一次可重试的 HTTP 503；在最终本地生产构建中重放同一真实事件返回 HTTP 200，已删除的归属映射被安全忽略，没有重建测试记录。证据见 `.logs/stripe-ielts-final-smoke.json`。这不影响前述付款、取消续费和退款事件均成功处理的结果。

专用沙盒测试对象：Subscription `sub_1UUX2IEbgvz3XBhsgE6DBf1G`，PaymentIntent `pi_3UUX2GEbgvz3XBhs1MKs71ms`，Refund `re_3UUX2GEbgvz3XBhs1K1WnyJd`。无真实资金交易。

本地证据（均被 Git 忽略）：

- `.logs/stripe-ielts-flow-results.json`：付款、取消续费及退款三个阶段的真实状态
- `.logs/stripe-ielts-listener.log`：真实事件及 HTTP 200 处理结果，签名密钥已遮蔽
- `.logs/stripe-ielts-paid.png`：付款开通权益
- `.logs/stripe-ielts-canceled.png`：取消续费后保留本期权益
- `.logs/stripe-ielts-refunded.png`、`.logs/stripe-ielts-refunded-access.png`：退款暂停权益及访问限制
- `.logs/stripe-ielts-ci.log`、`.logs/stripe-ielts-build.log`：最终检查与构建输出

## 正式启用的外部条件

新账户目前 `charges_enabled=false`、`details_submitted=false`。商户需本人完成正式账户激活与资料提交，再在正式模式创建价格和门户，配置最小权限 restricted key 与线上 HTTPS 回调，配置 Production、部署并验收。Vercel Development 只是本地开发配置，本次没有创建线上回调端点，也没有把本地 listener 密钥用于线上。

正式启用前确认 Billing 的 Smart Retries、失败付款邮件和重试结束策略。Link 尚未激活，正式可用付款方式须按账户资格和 Dashboard 设置确认。Stripe Tax 保持关闭；确认适用税务义务和有效注册后再决定启用，不能把“未启用计税”理解为“没有纳税义务”。参见 [Stripe 订阅税务](https://docs.stripe.com/billing/taxes/collect-taxes)。
