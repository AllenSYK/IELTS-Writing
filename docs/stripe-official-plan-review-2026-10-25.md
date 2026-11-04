# Stripe 官方计划与现有实现复核 — 2026-10-25

## 来源与业务选择

本次新会话重新发现 Stripe 插件工具，并调用 `list_available_accounts_or_orgs`，返回唯一已授权账户“雅思 沙盒” `acct_1UUWf9Ebgvz3XBhs`、`livemode=false`。随后真实调用 `stripe_implementation_planner`，完成决策树并接受计划：`iguide_61VduuMWXOjRAq7bg41Ebgvz3XBhs`，状态 `accepted`。未使用安装 skills 的回退。原始响应保存在被 Git 忽略的 `.logs/stripe-official-plan-2026-10-25.json`。

业务是独立 AI 雅思写作练习平台，提供作文预估分数、四项标准反馈和改进建议，属于线上数字教育服务，不隶属官方 IELTS 考试机构。选定网页自助购买、Stripe 托管 Checkout、固定人民币 1999 分/月、自动续费、无试用、无按量计费、无席位计费、无年付价格、自助 Customer Portal、期末取消。

官方输出包含 hosted subscription Checkout 与 Customer Portal 蓝图，建议 flexible billing mode、动态付款方式、失败付款恢复与税务审查。蓝图中的默认美元金额是示例占位值，实际业务参数已按 CNY 1999/月配置。

## 证据化复核

| 官方建议 | 代码及处理结果 |
| --- | --- |
| Product + recurring Price + hosted Checkout | `scripts/setup-stripe.mjs`、`lib/billing/service.ts`；服务端校验 CNY 1999/月，客户端不能改价；新账户对象已通过官方 MCP 建立 |
| flexible billing mode | 创建 Session 时显式传 `subscription_data.billing_mode.type=flexible`；官方当前 API 已默认 flexible，此处明确固定行为，实测订阅确认为 flexible |
| 动态付款方式与转化 | 不传 `payment_method_types`；测试收银台显示 card、Apple Pay。Link 在该账户尚未激活，未声称已启用；正式启用由商户确认 Dashboard 设置 |
| Adaptive Pricing | 规划器一般建议启用。当前用户明确以人民币 ¥19.99/月报价，因此保持关闭，避免未经确认改变显示币种；将来可独立评估 |
| Customer Portal | 已按认证用户的数据库映射创建短期会话；新增强制校验：同环境、有效、期末取消、账单及付款方式更新开启、套餐变更关闭；不再退回未校验的默认配置 |
| 生命周期回调 | `app/api/billing/webhook/route.ts` 验证原始请求体签名；`BILLING_EVENTS` 覆盖 Checkout 异步支付、订阅、付款失败和风险事件；新账户真实付款回调均 HTTP 200 |
| 付款后提供服务 | 重新读取订阅及匹配 Price 的已付款账单周期；成功页仅做补充核对，回调是必需路径；取消续费后保留已付款周期，失败不延长周期 |
| 退款、争议、欺诈处理 | 沿 PaymentIntent → invoicePayments → Invoice → Subscription 关联，映射本地 Customer；全额退款、争议、早期预警设置持久风险暂停，部分退款不自动全撤权益 |
| 幂等性与事件顺序 | 数据库锁保存 Checkout 幂等键，回调收据和权益在同一事务提交；旧快照不能覆盖新快照，风险暂停不能被普通回调清除；225 项测试通过 |
| 客户数据同步 | 本地 billing Customer 表只存归属映射和支付控制字段，不镜像姓名、账单地址或付款方式，因此无需为了不存在的本地副本订阅 Customer 更新事件 |
| Accounts v2 | 规划器的门户蓝图使用 Accounts v2；官方门户文档仍提供 Customers v1 路径，本项目已有 Customers v1 集成，保留现有模型。本次没有引入非必要的客户数据迁移或 preview API |
| 隔离与密钥 | 新账户重新建立 Price、Portal 和 listener；本地及 Vercel Development 切换新凭据，删除旧 MCP key；初始化脚本增加账号验证、价格/门户校验、跨账户及跨模式清理与 `600` 文件权限；新增 `npm run stripe:listen` 显式绑定应用账户、保存并遮蔽签名密钥 |
| 税务与收入恢复 | 尚未确认税务义务或有效注册，因此保持 `automatic_tax` 关闭；不能据此认定没有税务义务。Smart Retries、付款失败邮件及结束策略需在正式启用前确认，未在本次擅自变更 |

## 新沙盒对象及验证范围

- Product：`ielts-writing-standard-v1`
- Monthly Price：`price_1UUWyZEbgvz3XBhshsbDhZwI`，CNY 1999，每 1 月，`livemode=false`
- Portal：`bpc_1UUWyZEbgvz3XBhsPnS4DJ3x`，`at_period_end`
- 本地 listener：API `2026-09-30.endive`，转发 `localhost:3002/api/billing/webhook`，全部必需事件，密钥仅写本地文件
- Vercel：只更新 `allensyks-projects/ielts-writing` Development；连接器的环境变量读取返回权限不足，按其指引使用已认证官方 CLI 完成更新与回读比对。Production 和 Preview 的支付配置未变更，没有部署

详见[实测记录](stripe-payment-verification-2026-10-25.md)。测试付款不产生真实扣款，不能替代正式商户激活、正式密钥和线上 HTTPS 回调验收。

## 官方资料

- [订阅接入](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Flexible billing mode](https://docs.stripe.com/billing/subscriptions/billing-mode)
- [Customer Portal（包含 Customers v1 和 Accounts v2）](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [订阅回调与风险事件](https://docs.stripe.com/billing/subscriptions/webhooks)
- [失败付款恢复](https://docs.stripe.com/billing/revenue-recovery)
- [订阅税务](https://docs.stripe.com/billing/taxes/collect-taxes)
- [Restricted keys](https://docs.stripe.com/keys#manage-your-api-keys)
