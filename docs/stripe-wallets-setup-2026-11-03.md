# 微信、支付宝与 PayPal 接入（2026-11-03）

## 用户确认的方案

| 方案 | 价格 | 续费方式 |
| --- | --- | --- |
| 微信 / 支付宝单次会员 | CNY 19.99 / 30天 | 到期手动购买 |
| PayPal 单次会员 | GBP 2.49 / 30天 | 到期手动购买 |
| 原有银行卡订阅 | CNY 19.99 / 月 | 自动续费，可取消下一期 |

PayPal 不支持 CNY 直接付款，因此使用用户确认的独立英镑方案。微信不支持 Checkout 订阅模式；支付宝的自动续费需要另外获批，本次使用单次付款。

## 实现

- Hosted Checkout `payment` 模式，动态付款方式，不传 `payment_method_types`；微信配置 `client=web`，不保存付款方式供未来扣款。
- 客户端仅选择币种和确认条款，服务端固定金额与商品。两个方案使用不同标识；切换方案仅关闭当前客户未付款的会话，已完成的会话不能被替换。
- 签名 Webhook 处理 `checkout.session.completed` 和 `checkout.session.async_payment_succeeded`，重新读取会话及行项目，核对已付款、金额、币种、客户与用户归属。成功 URL 本身不能开通权益。
- `stripe_billing_payments` 独立保存单次付款，首次确认固定30天有效期；重复或乱序通知不会延长权益。全额退款、争议与欺诈风险暂停该笔权益，后续成功通知不能解除暂停。
- 会员中心展示单次付款记录和不续费说明。原有订阅、会员授权与 AI 使用记录继续工作；有效会员不能重复开通。
- 新表启用 RLS，浏览器角色没有表权限或 RPC 执行权限。[RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) INFO 符合服务端专用表的默认拒绝设计，权限已通过事务测试。

迁移 `supabase/migrations/20261103194754_stripe_prepaid_memberships.sql` 已应用到 Supabase 项目 `qbytmwiszeucnxbnaede`，本地版本与远程历史一致。

## 账户待完成事项

正式账户：雅思 · `acct_1UUWeyIZyGc3gMiy`（英国）。配置：`pmc_1UUWfUIZyGc3gMiy3WC0BcDH`。

最新 API 读取结果：

| 方式 | display_preference | available |
| --- | --- | --- |
| 微信支付 | on | false |
| 支付宝 | on | false |
| PayPal | off | false |

微信与支付宝仍等待 Stripe 完成开通；PayPal 需完成商业账户开通并与 Stripe 绑定。开关打开不等于已能收款。在[付款方式设置](https://dashboard.stripe.com/acct_1UUWeyIZyGc3gMiy/settings/payment_methods/pmc_1UUWfUIZyGc3gMiy3WC0BcDH)完成商户步骤并确认 `available=true` 后，分别启用：

- `STRIPE_PREPAID_ENABLED=true`：人民币30天方案。
- `STRIPE_PAYPAL_ENABLED=true`：英镑30天方案。

默认均关闭。本次发布保留月付，隐藏尚未可用的钱包方案。后续启用需重新部署，并移除本次部署对应的 `--env ...=false` 与 `--build-env ...=false` 覆盖。

## 验证

- 完整 CI 240 项测试通过，最终支付回归20项通过，类型检查、Lint 与构建通过。
- 数据库事务测试覆盖浏览器角色权限、固定30天期限、幂等、退款暂停、重复购买阻止、跨用户隔离、GBP 249 / CNY 1999 校验，数据全部回滚。
- 正式 API 创建 CNY 1999 和 GBP 249 未付款会话，切换方案后旧会话过期。未付款无权益、无账单。
- 浏览器确认会员中心三种方案和 £2.49 / 30天真实收银台。该收银台未显示 PayPal，与账户未开通状态一致。
- 原有 CNY 1999 / 月订阅 Checkout 创建成功，无真实付款。
- 发布包527项源文件，不包含环境文件、密钥和 `.logs`。正式构建：`dpl_EDggyKhQYBEFaJV7BuwmgZL9tM8Z`。最终发布证据：`.logs/stripe-wallets-release.json`。
- 本次未真实扣款。真实钱包授权与到账验收需在账户开通后由商户参与。
- 三个未付款验证会话已全部过期；临时 Stripe 客户和网站账号已删除，账号先全局退出，无遗留客户映射或真实扣款。临时本地验证服务已停止。

证据位于被 Git 和 Vercel 忽略的 `.logs/stripe-wallets-smoke.json`、`.logs/stripe-prepaid-ci.log`、`.logs/stripe-prepaid-build.log`、`.logs/stripe-wallets-final-tests.log`。

## 官方参考

- [微信 Checkout](https://docs.stripe.com/payments/wechat-pay/accept-a-payment?payment-ui=checkout)
- [支付宝及订阅限制](https://docs.stripe.com/payments/alipay)
- [PayPal 币种](https://docs.stripe.com/payments/paypal)
- [PayPal 账户绑定](https://docs.stripe.com/payments/paypal/activate)

官方规划器已接受 hosted Checkout 单次付款方案：`iguide_61VhBG8NlnFgzJetx41IZyGc3gMiy`。
