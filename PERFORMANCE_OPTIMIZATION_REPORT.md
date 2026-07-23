# IELTS Writing 全局加载性能专项报告

日期：2026-07-23

优化分支：`codex/performance-optimization`

优化提交：`7fcea08c388958e6109b9e2e98b7d997400700d8`

## 1. 结论

本次只调整加载链路、请求并发与去重、预取策略、字体传输格式和构建兼容性；没有修改页面结构、视觉样式、交互语义、路由地址、接口字段、数据库权限、登录/注册/激活流程、AI 批改逻辑或用户数据格式。

主要收益：

- 学习规划匿名首载请求数由 54 降至 28，下降 48.1%；总传输量由 1,157,664 B 降至 862,333 B，下降 25.5%。
- 真题页匿名首载请求数由 57 降至 30，下降 47.4%；总传输量由 1,325,379 B 降至 968,699 B，下降 26.9%。
- 五个字体文件的磁盘总量由 2,261,632 B 降至 763,948 B；浏览器实测字体传输量下降约 29%。
- 多数业务页面不再无条件请求 `/api/profile`。
- 历史记录轻量列表改为用户级缓存键和 single-flight，请求重叠时复用同一个 Promise，不再用空数组占位污染缓存。
- 错题本列表和统计查询由串行改为并行。
- 常驻侧栏不再在页面进入时批量预取所有路由；高价值入口保留 hover/focus 按需预取。
- 真题筛选切换或离开页面时会取消旧请求，原有 15 秒超时与错误文案不变。

## 2. 测量口径与限制

优化前使用生产站点 `https://www.ieltswriting.online`，优化后使用 Vercel Preview，均采用 Lighthouse 12.8.2 的移动端性能配置。

当前没有可用于测试的普通用户或管理员凭据，因此只能测匿名路径、重定向、登录页和无需服务端登录即可返回页面框架的路径；没有创建测试账号，也没有修改生产数据。Preview 使用 Vercel Authentication 保护，Lighthouse 通过限时访问链接进入，因此登录页请求数包含额外的保护层请求。

## 3. 前后对比

| 页面 | 指标 | 优化前：生产 | 优化后：Preview | 变化 |
|---|---:|---:|---:|---:|
| 登录 | Performance | 66 | 70 | +4 |
| 登录 | FCP | 2,580 ms | 2,596 ms | +0.6% |
| 登录 | LCP | 4,133 ms | 3,956 ms | -4.3% |
| 登录 | TBT | 157 ms | 59 ms | -62.4% |
| 登录 | 总传输 | 684,109 B | 563,065 B | -17.7% |
| 登录 | 字体传输 | 319,277 B | 221,360 B | -30.7% |
| 学习规划 | Performance | 61 | 98 | +37 |
| 学习规划 | FCP | 5,286 ms | 1,389 ms | -73.7% |
| 学习规划 | LCP | 6,330 ms | 2,289 ms | -63.8% |
| 学习规划 | TBT | 170 ms | 39 ms | -77.1% |
| 学习规划 | 请求数 | 54 | 28 | -48.1% |
| 学习规划 | 总传输 | 1,157,664 B | 862,333 B | -25.5% |
| 学习规划 | JS 传输 | 313,615 B | 270,093 B | -13.9% |
| 学习规划 | 字体传输 | 759,257 B | 541,221 B | -28.7% |
| 真题页 | Performance | 60 | 64 | +4 |
| 真题页 | FCP | 5,769 ms | 5,295 ms | -8.2% |
| 真题页 | LCP | 7,309 ms | 6,649 ms | -9.0% |
| 真题页 | TBT | 145 ms | 10 ms | -93.1% |
| 真题页 | 请求数 | 57 | 30 | -47.4% |
| 真题页 | 总传输 | 1,325,379 B | 968,699 B | -26.9% |
| 真题页 | JS 传输 | 321,949 B | 263,951 B | -18.0% |
| 真题页 | 字体传输 | 920,165 B | 653,055 B | -29.0% |

备注：

- 两次测试使用不同 Vercel 部署 URL，CDN 热度和瞬时网络仍会影响 FCP/LCP；请求数和传输量更适合直接判断本次改动。
- 学习规划的 FCP/LCP 提升同时受 Preview 静态资源缓存命中影响，不把 98 分解读为稳定生产满分。
- 登录页请求数受 Preview Authentication 保护层影响，不用于评价应用自身预取策略。
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
- Vercel Preview：
  - 构建、TypeScript、89 个静态页面生成和部署均成功。
  - `/`、`/login`、主要登录重定向、学习规划、错题本、真题页和设置页响应符合现状。
  - 五条 `@font-face` 全部引用 WOFF2，旧 TTF 引用为 0。
  - 登录页最终可见结构和表单完整，页面无横向溢出。
  - 最近 30 分钟的 Preview runtime error/fatal 日志为 0。

为使 `npm test` 恢复全绿，只更新了一个过时的源码断言：它现在验证现有的 annotation block 重试后缀和校验函数；没有修改批改实现。

## 7. 构建与部署

本地构建环境缺少原生 SWC，Turbopack 构建无法启动；项目构建脚本改为官方支持的 Webpack 构建方式后，`npm run build` 稳定通过。Vercel 远端也成功完成编译和 TypeScript 检查。

Preview：

- 分支：`codex/performance-optimization`
- 验收提交：`cfe1c44fe3ee93896b0b7b61e3121121a3f56c97`
- 部署 ID：`dpl_NJeCAsxCbSCE6YezHGpkBEdC5DRF`
- 状态：`READY`
- 框架：Next.js 16.2.9
- 构建结果：成功

生产：

- 当前生产部署 ID：`dpl_7aMhua9nhoEEsz1mXSZdnwLKcCt1`
- 当前状态：`READY`
- 当前提交：`d46a6f911af4252a8350d9682293251aa669f755`
- 本次优化没有推送到 `main`，生产站点未被替换。

## 8. 前后截图与已知限制

Lighthouse 最终帧：

- 登录页：[优化前](performance-artifacts/login-before.png) / [Preview](performance-artifacts/login-after-preview.png)
- 学习规划：[优化前](performance-artifacts/study-plan-before.png) / [Preview](performance-artifacts/study-plan-after-preview.png)
- 真题页：[优化前](performance-artifacts/past-papers-before.png) / [Preview](performance-artifacts/past-papers-after-preview.png)

前后最终帧的结构、文案、字体和布局一致。学习规划和真题页在匿名状态下展示原有 loading skeleton。

仍未完成的部分：

- 没有测试账号，无法对登录后的历史记录、分析、写作、批改结果、Full Test、账号中心和管理后台进行真实数据计时。
- Lighthouse 合成测试不提供真实用户 INP；需要后续使用 Vercel Web Analytics/Speed Insights 的现场数据观察。
- Material Symbols 完整 WOFF2 仍为约 319 KB；进一步子集化可能遗漏动态 icon ligature，本次为保持视觉一致没有冒险裁剪。
- 生产仍运行原提交；在合并或提升 Preview 前应由负责人确认是否上线。
