# 会员支付页面发布 — 2026-11-03

## 本次范围

按用户最新选择，先完成并发布网页支付页面。正式 Stripe 收款暂不启用，继续保留测试配置在本地和 Development；Production 不使用测试密钥。

新增公开 `/pricing` 会员方案页面，明确人民币 ¥19.99/月、自动续费、期末取消和模拟估分用途。页面提供权益说明、付款步骤、常见问题和法律页面链接。登录页、激活页、账号中心和应用侧边导航均可进入会员或支付页面。

`/billing` 是需登录的会员支付与订阅页面，展示当前账号、月付方案、自动续费同意、订阅状态及账单管理。正式配置未完成时仍可查看方案，付款按钮禁用并显示“在线订阅暂未开放”。真实支付金额继续只由服务端 Stripe Price 决定，页面展示不会绕过服务端校验。

## 正式账户状态

Stripe 官方连接已返回“雅思”正式账户 `acct_1UUWeyIZyGc3gMiy`，`livemode=true`。账户 `charges_enabled=true`、`payouts_enabled=true`、`details_submitted=true`，当前无待补资料阻塞；`company.vat_id` 出现在 eventually_due 中，不等同于已有有效税务注册。

查询时正式账户没有 Price、Portal 或 webhook endpoint。两次独立的创建操作均被连接权限拒绝（UNAUTHORIZED，缺少 `mcp` scope），没有返回创建成功的对象。本地尚无正式服务端密钥。用户随后明确选择“先完成并发布支付页面”，因此本次不继续创建正式收款配置，也没有真实扣款。

后续接通收款仍需正式服务端密钥、有效的写入权限、正式价格和门户、线上 HTTPS 回调签名及一次环境变量部署。安全输入文件为 `.env.stripe-live.local`，权限 `600`，被 Git 和 Vercel 上传规则排除；密钥不得发到聊天。Stripe Tax 保持关闭，待确认适用的有效税务注册后再决定启用。

## 检查

- `npm run ci`：225 项测试通过，TypeScript 与静态检查通过；原有 11 项未使用变量警告。
- `npm run build`：生产构建通过，包含 `/pricing`、`/billing` 及 billing API。
- 公共套餐页不要求登录，支付页面要求登录但不要求已有会员；登录的 next 参数保留 `/billing`。
- 390px 手机布局没有横向溢出；桌面与手机页面截图保存在被忽略的 `.logs/`。
- 新增 `.vercelignore`，部署上传检查排除了所有 `.env`、`.logs` 和本地工具目录。上传前对实际源文件清单检查，未发现密钥模式。
- 初始化脚本支持 `--output-env-file`；正式密钥禁止写入默认本地沙盒文件。已在独立输出文件中验证，不改动 `.env.local`，并复用原沙盒对象。

## 发布结果

- 正式地址：https://www.ieltswriting.online/pricing；登录后支付页：https://www.ieltswriting.online/billing。
- Vercel 目标：allensyks-projects/ielts-writing，Production，状态 READY。
- 部署：dpl_GXo5NW31SPfqbWNCURQgyzLkDv2s，基于 HEAD 85115a7 与当前经过检查的本地修改；没有创建提交。
- 部署 URL：https://ielts-writing-b5gjsoilm-allensyks-projects.vercel.app。
- 先以 --skip-domain 构建并验收，再将同一构建 promote 到正式域名，没有从 Preview 重新构建。
- 待上线地址与正式域名均已验证 /pricing 200、/billing 307 并携带登录后返回地址、未登录 billing status 401、法律页面 200。正式支付尚未启用，webhook 返回 503 以拒绝未配置的处理请求。
- 本地支付页面在勾选自动续费后仍保持付款按钮禁用，符合未开放状态；浏览器检查未发现错误，手机页面无横向溢出。

证据保存在 .logs/payment-pages-stage-verification.json、.logs/payment-pages-live-verification.json、.logs/payment-pages-deployment-2026-11-03.json 和对应页面截图。

正式域名的登录后流程已用专用临时账号验证：从套餐页进入登录，登录后返回 `/billing`，展示月付方案；勾选自动续费后，未配置收款的按钮仍保持禁用。浏览器错误记录为 0，当前部署近 15 分钟 error 日志查询返回 0 条记录。验证后已退出会话，并清理临时账号及其本地凭据文件。

正式页面另验证 900px 宽度无横向溢出。线上预览截图：`.logs/payment-pricing-live.png`；支付页截图：`.logs/payment-billing-live.png`。本次未修改任何真实用户的授权或付款记录，未发起真实付款。
