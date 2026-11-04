# Stripe 正式配置与保存记录（2026-11-03）

## 已完成配置

| 项目 | 保存结果 |
| --- | --- |
| 正式账户 | 雅思 · `acct_1UUWeyIZyGc3gMiy` |
| 账户状态 | 可收款、可提现，必填资料已提交，当前无待补充要求 |
| 服务端密钥 | `IELTS Writing Production`，受限密钥；本文不保存密钥值 |
| 价格 | `price_1UXZnGIZyGc3gMiyajPUms6e` · 人民币 19.99 元/月 |
| 订阅管理 | `bpc_1UXZnHIZyGc3gMiyHlxwbFor` |
| 正式 Webhook | `we_1UXZnHIZyGc3gMiyZTJnRVd4` |
| 回调地址 | `https://www.ieltswriting.online/api/billing/webhook` |
| 回调版本 | `2026-09-30.endive` |
| Vercel 项目 | `allensyks-projects/ielts-writing` |
| 环境 | Production |

Customer Portal 已开启账单历史、付款方式更新和到期取消续费；关闭套餐升级变更。Webhook 已启用代码要求的 15 项订阅、账单、异步付款及退款、争议、欺诈风险事件。

## 密钥与环境变量

正式受限密钥及 Webhook 签名密钥仅保存在本地 `.env.stripe-live.local`（权限 `600`）和 Vercel Production 的 Secret 环境变量中。没有写入源代码、普通文档、聊天或部署文件包。

已保存的 Vercel 变量：`STRIPE_SECRET_KEY`、`STRIPE_ACCOUNT_ID`、`STRIPE_PRICE_MONTHLY`、`STRIPE_PORTAL_CONFIGURATION_ID`、`STRIPE_WEBHOOK_SECRET`。

首次配置结束后，密钥权限已收窄：

- 写入：Customers、Checkout Sessions、Customer Portal。
- 读取：Accounts、Charges and Refunds、Invoices、Prices、Products、Subscriptions。
- 已撤销产品和价格写入，以及 Webhook 管理权限；未授予提现和资金转账权限。

已验证密钥属于指定正式账户，月费为 CNY 1999 最小货币单位，Portal 配置可读且符合要求。运行密钥请求 Webhook 管理接口返回 403，确认临时管理权限已撤销。

开发用 `.env.local` 保留原来的沙盒配置，没有改为正式密钥。上传清单不包含 `.env`、`.logs` 或本地工具状态。

Stripe Tax 未自动启用，正式税务安排仍需按实际销售地区及有效税务注册确认。真实扣款验收应由商户本人参与，不通过伪造付款或成功 URL 开通会员。

## 页面与代码结果

- [会员中心合并与激活功能退役](member-center-redesign-2026-11-03.md)
- [会员中心精简、账单查询及复习框样式](member-center-refinement-2026-11-03.md)
- [正式服务器配置说明](stripe-live-server-setup.md)

本地配置过程和发布进度保存在忽略上传的 `.logs/stripe-onboarding-context.json`。

## 最终发布与验收

- 正式部署：`dpl_9Nj944ZYPxZstub5Deuy3Cfcnb93`（READY，production），已推广到 `https://www.ieltswriting.online`。
- 月费、Portal、Webhook 和五项 Production Secret 均配置成功。
- 临时验证账号的线上状态接口返回 `available=true`、`testMode=false`；新账号无会员权益、无账单。
- 正式 Checkout 创建成功：CNY 1999/月，`livemode=true`，正确关联当前用户与客户，成功与取消地址均返回正式网站。浏览器已确认收银台显示人民币 19.99 元/月和续费说明。
- 未付款的 Checkout 没有授予会员权益。有效签名的无业务变更探测请求返回 200，非法签名返回 400；这不替代真实付款后的生命周期验收。
- 未填写银行卡，未发起或完成真实扣款。验收会话已过期，临时 Stripe 客户已删除，临时网站账号已全局退出并删除；没有生成订阅或账单。
- 新版本运行日志查询未返回 error/fatal。

证据保存在忽略上传的 `.logs/stripe-live-server-verification.json`、`.logs/stripe-live-checkout.png`、`.logs/stripe-live-env-upload-result.json`、`.logs/stripe-live-deployment.json`。
