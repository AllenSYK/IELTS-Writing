# IELTS Writing 全局加载性能专项报告

日期：2026-07-23

优化分支：`codex/performance-optimization`

优化提交：`7fcea08c388958e6109b9e2e98b7d997400700d8`

## 1. 结论

本次只调整加载链路、请求并发与去重、预取策略、字体传输格式和构建兼容性；没有修改页面结构、视觉样式、交互语义、路由地址、接口字段、数据库权限、登录/注册/激活流程、AI 批改逻辑或用户数据格式。

主要收益：

- 学习规划匿名首载请求数由 54 降至 26，下降 51.9%；总传输量由 1,157,664 B 降至 858,709 B，下降 25.8%。
- 真题页匿名首载请求数由 57 降至 28，下降 50.9%；总传输量由 1,325,379 B 降至 965,976 B，下降 27.1%。
- 五个字体文件的磁盘总量由 2,261,632 B 降至 763,948 B；浏览器实测字体传输量下降约 29%。
- 多数业务页面不再无条件请求 `/api/profile`。
- 历史记录轻量列表改为用户级缓存键和 single-flight，请求重叠时复用同一个 Promise，不再用空数组占位污染缓存。
- 错题本列表和统计查询由串行改为并行。
- 常驻侧栏不再在页面进入时批量预取所有路由；高价值入口保留 hover/focus 按需预取。
- 真题筛选切换或离开页面时会取消旧请求，原有 15 秒超时与错误文案不变。

## 2. 测量口径与限制

优化前使用生产站点 `https://www.ieltswriting.online`，优化后使用同一代码的本地 production build，均采用 Lighthouse 12.8.2 的移动端性能配置。

当前没有可用于测试的普通用户或管理员凭据，因此生产端只能测匿名路径、重定向与登录页；没有创建测试账号，也没有修改生产数据。受 Vercel Preview 环境变量缺失影响，优化后暂时无法完成远端 Preview 的同口径复测。下表的优化后数据明确属于本地 production build，不等同于生产实测。

## 3. 前后对比

| 页面 | 指标 | 优化前：生产 | 优化后：本地 production | 变化 |
|---|---:|---:|---:|---:|
| 登录 | FCP | 2,580 ms | 2,132 ms | -17.4% |
| 登录 | 总传输 | 684,109 B | 561,505 B | -17.9% |
| 登录 | 字体传输 | 319,277 B | 221,670 B | -30.6% |
| 学习规划 | Performance | 61 | 69 | +8 |
| 学习规划 | FCP | 5,286 ms | 3,984 ms | -24.6% |
| 学习规划 | LCP | 6,330 ms | 5,867 ms | -7.3% |
| 学习规划 | 请求数 | 54 | 26 | -51.9% |
| 学习规划 | 总传输 | 1,157,664 B | 858,709 B | -25.8% |
| 学习规划 | JS 传输 | 313,615 B | 268,984 B | -14.2% |
| 学习规划 | 字体传输 | 759,257 B | 541,515 B | -28.7% |
| 真题页 | Performance | 60 | 66 | +6 |
| 真题页 | FCP | 5,769 ms | 4,573 ms | -20.7% |
| 真题页 | LCP | 7,309 ms | 6,571 ms | -10.1% |
| 真题页 | 请求数 | 57 | 28 | -50.9% |
| 真题页 | 总传输 | 1,325,379 B | 965,976 B | -27.1% |
| 真题页 | JS 传输 | 321,949 B | 263,480 B | -18.2% |
| 真题页 | 字体传输 | 920,165 B | 653,452 B | -29.0% |

备注：

- 本地与远端的网络、CPU 和 CDN 条件不同，FCP/LCP 只用于趋势判断；请求数和传输量更适合直接对比本次改动。
- 登录页三次并行 Lighthouse 中 LCP/TBT 波动较大，因此不把这两项作为本次收益结论。
- CLS 没有因优化发生实质变化。

## 4. 具体改动

### 请求链路

- `AppRuntime` 只在 `/dashboard` 和 `/analytics` 保留 `UserProfileProvider`，其他页面不再附带无消费方的 profile 请求。
- 历史记录列表缓存键加入 `userId`，避免账号切换时共享同一 SWR 键。
- 历史记录列表请求加入 single-flight；重叠请求等待同一网络结果，不返回临时空数组。
- 错题本列表查询和状态统计使用 `Promise.all` 并发执行，返回字段与错误处理保持不变。

### 静态资源与客户端负载

- Inter 400/500/600/700 和 Material Symbols 从 TTF 传输改为 WOFF2。
- 字体转换保留了全部 glyph order、cmap 和 hmtx 指标；字族、字重、`font-display` 与 CSS 使用方式不变。
- 复核了 Recharts：Task 1 图表原本已经通过 `React.lazy` 按需加载，没有重复拆包。
- 曾评估把 IELTS 雷达图拆包，但该组件仅约 1.5 KB gzip；额外网络往返收益为负，因此未保留该改动。

### 预取、取消与加载体验

- 用户端与管理端常驻侧栏统一关闭可视即全量预取。
- 用户端六个主要入口在 hover/focus 时仍调用 `router.prefetch`。
- 历史记录详情、学习计划任务、个性化练习、真题写作入口、重写入口和管理列表详情关闭自动预取。
- 真题列表的筛选、排序、翻页发生变化时取消前一个列表请求；组件卸载时取消列表和年份请求。
- 原有 loading skeleton、错误页、重试按钮、空状态和 15 秒超时文案全部保留。

### 数据库

只做了只读分析，没有执行 DDL 或数据迁移。

- 真题列表实际查询约 0.36 ms。
- 历史列表索引路径约 0.07 ms。
- 错题模式查询约 0.11 ms。
- 现有 `writing_records(user_id, submitted_at desc)`、学习计划、真题和错误模式索引已覆盖关键路径。

由于数据库不是当前瓶颈，本次没有盲目新增或删除索引，也没有改 RLS、角色权限、触发器或用户数据。

## 5. 路径影响

| 路径 | 影响 |
|---|---|
| `/practice` | 减少侧栏批量预取和无用 profile 请求；写作模式原有 hover/focus 预取保留 |
| `/study-plan` | 减少侧栏批量预取和无用 profile 请求；动态任务链接不再自动预取 |
| `/study-plan/errors` | 列表与统计并发；筛选接口与响应结构不变 |
| `/ielts/past-papers` | 取消过期筛选请求；动态写作入口不自动预取 |
| `/history` | 用户级缓存键、请求去重；记录详情不自动预取 |
| `/analytics` | 保留 profile 请求；仅调整全局预取与字体传输 |
| `/result` | 动态重写入口不自动预取；结果读取和派生作文逻辑不变 |
| `/write/[mode]` | 页面与自动保存逻辑未改；仅受全局字体和预取策略影响 |
| `/dashboard`、`/settings` | dashboard 保留 profile；settings 原跳转行为不变 |
| `/admin/*` | 低频侧栏和动态详情关闭自动预取；管理权限与 CRUD 未改 |

## 6. 验证结果

- `npm test`：127/127 通过。
- `npm run typecheck`：通过。
- `npm run lint`：0 error；17 个仓库既有 warning，本次没有新增 warning。
- `npm run build`：通过，89 个静态页面生成完成。
- 本地 production server：
  - 登录页可见结构、字体、图标、表单与布局正常。
  - 页面无横向溢出。
  - 关键匿名路由的状态码和登录重定向保持原样。
  - WOFF2 静态文件均返回 `200 font/woff2`。

为使 `npm test` 恢复全绿，只更新了一个过时的源码断言：它现在验证现有的 annotation block 重试后缀和校验函数；没有修改批改实现。

## 7. 构建与部署

本地构建环境缺少原生 SWC，Turbopack 构建无法启动；项目构建脚本改为官方支持的 Webpack 构建方式后，`npm run build` 稳定通过。Vercel 远端也成功完成编译和 TypeScript 检查。

Preview：

- 分支：`codex/performance-optimization`
- 部署 ID：`dpl_HtcpnjxEEQFwmxnvgvxREebyETdR`
- 状态：`ERROR`
- 失败点：静态生成 `/admin/bindings`
- 原因：Vercel Preview 环境没有 Supabase 公共配置，抛出 `Supabase public configuration is missing.`

生产：

- 当前生产部署 ID：`dpl_8MaEGuNtBzev5U3vDYuJiNa6qgmy`
- 当前状态：`READY`
- 当前提交：`d46a6f911af4252a8350d9682293251aa669f755`
- 本次优化没有推送到 `main`，生产站点未被替换。

## 8. 上线前唯一阻塞项

需要在 Vercel 项目的 Preview 环境配置至少补齐：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

若要在 Preview 完整验证登录后 API，建议使用独立的 Preview Supabase 项目及相应服务端变量；不要未经评估直接把生产 service-role、AI 密钥或管理员密钥复制到 Preview。

补齐后重新部署该分支，完成登录后关键路径与 Lighthouse 复测，再决定是否合并或提升到生产。
