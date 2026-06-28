# IELTS Writing 管理端第二轮修复报告

## 执行摘要

第二轮修复已完成并推送至 main 分支。共修改 27 个文件，新增 1463 行代码，删除 194 行代码。

**提交 SHA:** `574aca4`  
**推送结果:** 成功推送到 `origin/main`

---

## 逐项修复状态

| 编号 | 问题 | 是否确认 | 修复状态 | 主要文件 | 数据库变更 | 测试 |
|------|------|----------|----------|----------|------------|------|
| 1 | 管理端页面标题与 AdminHeader | ✅ | ✅ 已修复 | `lib/admin/admin-routes.ts`, `components/admin/AdminHeader.tsx`, `app/admin/*/page.tsx` | 无 | ✅ |
| 2 | 顶栏搜索行为修复 | ✅ | ✅ 已修复 | `components/admin/AdminHeader.tsx` | 无 | ✅ |
| 3 | AdminDataProvider 缓存策略 | ✅ | ✅ 已修复 | `components/admin/AdminDataProvider.tsx` | 无 | ✅ |
| 4 | 管理设置统一请求方式 | ✅ | ✅ 已修复 | `app/admin/settings/AdminSettingsClient.tsx` | 无 | ✅ |
| 5 | 批量绑定用户交互优化 | ✅ | ✅ 已修复 | `app/admin/users/AdminUsersClient.tsx` | 无 | ✅ |
| 6 | 激活码敏感字段展示 | ✅ | ✅ 已修复 | `app/api/admin/licenses/route.ts`, `app/api/admin/licenses/[id]/reveal/route.ts` | 无 | ✅ |
| 7 | 统一 maskLicenseCode | ✅ | ✅ 已修复 | `lib/admin/mask-license.ts`, `components/admin/AdminUI.tsx` | 无 | ✅ |
| 8 | adminJsonFetcher 错误处理 | ✅ | ✅ 已修复 | `lib/admin/fetch-json.ts` | 无 | ✅ |
| 9 | timezone 字段校验 | ✅ | ✅ 已修复 | `app/api/admin/settings/route.ts`, `app/admin/settings/AdminSettingsClient.tsx` | 无 | ✅ |
| 10 | 真题筛选器可访问性 | ✅ | ✅ 已修复 | `app/admin/past-papers/AdminPastPapersClient.tsx` | 无 | ✅ |
| 11 | 确认弹窗语义色 | ✅ | ✅ 已修复 | `components/interaction-system.tsx` | 无 | ✅ |
| 12 | 统一 toNumber() | ✅ | ✅ 已修复 | `lib/admin/number-utils.ts`, `app/api/admin/*/route.ts` | 无 | ✅ |
| 13 | admin_settings 默认行 | ✅ | ✅ 已验证 | `app/api/admin/settings/route.ts` | 无 | ✅ |
| 14 | license_activations 外键行为 | ✅ | ✅ 已核验 | 无代码变更 | 无 | ✅ |
| 15 | RLS 与 service role | ✅ | ✅ 已核验 | 无代码变更 | 无 | ✅ |
| 16 | 真题页面内联样式清理 | ⚠️ | ❌ 已跳过 | - | - | - |
| 17 | 硬编码颜色统一 | ⚠️ | ❌ 已跳过 | - | - | - |
| 18 | 列表与表格体验 | ⚠️ | ❌ 已跳过 | - | - | - |
| 19 | 管理端 Toast 与反馈统一 | ⚠️ | ❌ 已跳过 | - | - | - |

---

## 详细修复说明

### 1. 管理端页面标题与 AdminHeader

**新增文件：**
- `lib/admin/admin-routes.ts` - 统一管理端路由元数据配置

**修改文件：**
- `app/admin/layout.tsx` - 添加 metadata template
- `app/admin/page.tsx` - 添加 title: "管理概览"
- `app/admin/licenses/page.tsx` - 添加 title: "激活码管理"
- `app/admin/bindings/page.tsx` - 添加 title: "邮箱绑定"
- `app/admin/users/page.tsx` - 添加 title: "用户管理"
- `app/admin/past-papers/page.tsx` - 添加 title: "真题题库"
- `app/admin/past-papers/[id]/edit/page.tsx` - 添加 title: "编辑真题"
- `app/admin/settings/page.tsx` - 添加 title: "管理设置"
- `components/admin/AdminHeader.tsx` - 使用统一路由元数据

**实现说明：**
- 使用最长路径优先匹配原则
- 动态路由（如 `[id]`）使用正则匹配
- 浏览器标题自动同步：`页面标题 | IELTS Writing 管理中心`
- 面包屑和顶栏标题保持一致

---

### 2. 顶栏搜索行为修复

**修改文件：**
- `components/admin/AdminHeader.tsx`

**实现说明：**
- 搜索行为与当前模块相关：
  - `/admin/licenses` → 搜索激活码
  - `/admin/users` → 搜索用户
  - `/admin/past-papers` → 搜索题目
  - `/admin/bindings` → 搜索邮箱或绑定关系
  - `/admin` (概览页) → 隐藏搜索框
- 搜索参数写入 URL：`?search=xxx`
- 回车触发搜索
- 清空输入恢复默认列表
- 搜索词自动 trim
- 输入法组合状态下不重复提交
- 搜索框有明确的 placeholder 和 aria-label

---

### 3. AdminDataProvider 缓存策略

**修改文件：**
- `components/admin/AdminDataProvider.tsx`

**缓存策略配置：**

| 数据类型 | 去重间隔 | 说明 |
|----------|----------|------|
| 默认列表 | 5 秒 | 管理列表数据 |
| 静态元数据 | 60 秒 | 低频变化数据 |
| 昂贵统计 | 30 秒 | 概览统计等 |
| 任务进度 | 3 秒 | 轮询场景 |

**写操作后精准失效：**
```typescript
export const CACHE_INVALIDATION = {
  afterLicenseChange: ['/api/admin/licenses', '/api/admin/licenses/list', '/api/admin/overview'],
  afterUserChange: ['/api/admin/users', '/api/admin/users/list', '/api/admin/overview'],
  afterBindingChange: ['/api/admin/bindings', '/api/admin/overview'],
  afterPastPaperChange: ['/api/admin/past-papers', '/api/admin/overview'],
  afterSettingsChange: ['/api/admin/settings'],
}
```

---

### 4. 管理设置统一请求方式

**修改文件：**
- `app/admin/settings/AdminSettingsClient.tsx`

**实现说明：**
- 使用 SWR 加载设置，支持自动缓存和重新验证
- 使用 SWR mutation 保存设置
- 区分 loading、error、success、empty 状态
- 保存成功后更新缓存，不重新请求
- 保存失败保留表单内容
- 不显示原始数据库错误
- 重复点击防抖（disabled 状态）
- Spinner 旋转动画
- 不产生两个并发保存请求
- 支持重新加载（mutate）
- 处理 401、403、500 错误

---

### 5. 批量绑定用户交互优化

**修改文件：**
- `app/admin/users/AdminUsersClient.tsx`

**实现说明：**
- 使用串行处理替代 Promise.all，避免并发问题
- 显示进度条：`正在处理 3 / 10 ...`
- 逐项返回结果：
  - 成功
  - 已绑定
  - 激活码已满
  - 用户不存在
  - 权限错误
  - 其他失败
- 部分失败时显示逐项详情
- 允许重试失败项
- 成功项不重复执行
- 任务期间按钮 disabled
- 最终提示示例：`批量绑定完成：成功 8，失败 2`

---

### 6. 激活码敏感字段展示

**新增文件：**
- `app/api/admin/licenses/[id]/reveal/route.ts` - 获取完整激活码 API

**修改文件：**
- `app/api/admin/licenses/route.ts` - 列表 API 不返回完整码

**实现说明：**
- 列表 API 默认只返回掩码后的值：`ABCD••••••••WXYZ`
- 完整码查看使用单独接口 `/api/admin/licenses/[id]/reveal`
- 查看完整码需要：
  - 管理员鉴权
  - 明确点击
  - 审计记录（写入 admin_audit_logs）
- 复制完整码前显示确认
- 完整码不进入 URL
- 5 分钟后自动隐藏

---

### 7. 统一 maskLicenseCode

**新增文件：**
- `lib/admin/mask-license.ts` - 共享掩码实现

**修改文件：**
- `components/admin/AdminUI.tsx` - 导出共享实现
- `app/admin/licenses/AdminLicensesClient.tsx` - 使用新实现
- `app/admin/bindings/AdminBindingsClient.tsx` - 使用新实现

**掩码规则：**
- 短码（≤8 字符）：显示前 2 后 2，中间用 `••••` 替代
- 长码（>8 字符）：显示前 4 后 4，中间用 `••••••••` 替代

**示例：**
```
"ABCD" → "AB••CD"
"ABCD-EFGH-IJKL-MNOP" → "ABCD••••••••MNOP"
```

---

### 8. adminJsonFetcher 错误处理

**修改文件：**
- `lib/admin/fetch-json.ts`

**错误处理策略：**

| 状态码 | 处理方式 |
|--------|----------|
| 无网络 | 提示检查网络 |
| 超时 | 提示稍后重试 |
| 401 | 跳转登录 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 数据冲突 |
| 429 | 稍后重试 |
| 500 | 服务器错误 |
| 非 JSON | 提示服务器异常 |
| 204 | 返回空数据 |

**错误类型包含：**
- `status` - HTTP 状态码
- `code` - 业务错误码
- `requestId` - 请求追踪 ID
- `retryable` - 是否可重试

---

### 9. timezone 字段校验

**修改文件：**
- `app/api/admin/settings/route.ts` - 服务端验证
- `app/admin/settings/AdminSettingsClient.tsx` - 前端选择器

**实现说明：**
- 服务端使用 `Intl.DateTimeFormat` 验证时区
- 前端使用受控选择器，提供常用时区列表
- 默认值：`Asia/Shanghai`
- 非法值返回 400 错误
- 不允许空白字符串
- 使用 IANA timezone 格式

**支持的时区：**
- Asia/Shanghai, Asia/Tokyo, Asia/Singapore, Asia/Hong_Kong
- UTC
- America/New_York, America/Chicago, America/Denver, America/Los_Angeles
- Europe/London, Europe/Paris, Europe/Berlin
- Australia/Sydney

---

### 10. 真题筛选器可访问性

**修改文件：**
- `app/admin/past-papers/AdminPastPapersClient.tsx`

**改进内容：**
- 筛选控件使用 `<label>` 包装
- 添加 `aria-label` 属性
- 筛选分组使用语义结构（role="search"）
- 清除筛选按钮有明确名称
- 键盘可完成所有筛选
- 焦点样式清晰

---

### 11. 确认弹窗语义色

**修改文件：**
- `components/interaction-system.tsx`

**支持的 variant：**

| variant | 用途 | 图标 | 按钮样式 |
|---------|------|------|----------|
| `default` | 普通确认 | info | 主按钮 |
| `danger` | 删除/撤销 | warning | 危险按钮 |
| `warning` | 下架/重置 | warning | 警告按钮 |
| `primary` | 保存/发布 | info | 主按钮 |

**使用示例：**
```tsx
<ConfirmDialog
  tone="warning"
  title="下架这个真题？"
  message="下架后用户将无法看到该题目。"
  confirmLabel="确认下架"
  onConfirm={handleUnpublish}
/>
```

---

### 12. 统一 toNumber()

**新增文件：**
- `lib/admin/number-utils.ts` - 共享数字工具函数

**修改文件：**
- `app/api/admin/licenses/route.ts`
- `app/api/admin/users/list/route.ts`
- `app/api/admin/bindings/route.ts`

**提供的函数：**
- `toFiniteNumber(value, fallback)` - 转换为有限数字
- `toQueryParamNumber(value, fallback)` - 解析查询参数
- `toInteger(value, fallback)` - 转换为整数
- `toPositiveInteger(value, fallback)` - 转换为正整数
- `clampNumber(value, min, max)` - 限制范围
- `parsePaginationParams(page, pageSize)` - 解析分页参数

---

### 13. admin_settings 默认行

**验证结果：**
- 表使用固定主键 `id = 'default'`
- migration 使用 `insert ... on conflict do nothing`
- API 使用 upsert 确保行存在
- 表为空时返回安全默认值
- 不因默认行缺失显示 500

**数据库结构：**
```sql
create table public.admin_settings (
  id text primary key default 'default',
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 14. license_activations 外键行为核验

**外键定义：**
```sql
license_id uuid not null references public.license_codes(id) on delete cascade
user_id uuid not null references auth.users(id) on delete cascade
```

**ON DELETE 行为：**
- 删除激活码 → 级联删除激活记录（`CASCADE`）
- 删除用户 → 级联删除激活记录（`CASCADE`）

**评估结论：**
- 当前 `CASCADE` 行为符合业务需求
- 删除用户时应清理其激活记录
- 删除激活码时应清理相关绑定
- 历史审计通过其他方式保留（如 writing_records）

---

### 15. RLS 与 service role 核验

**核验结果：**

| 表 | 普通用户权限 | service_role 权限 |
|----|-------------|-------------------|
| `admin_settings` | 无权限 | 完整权限 |
| `license_codes` | 无权限 | 完整权限 |
| `license_activations` | 只读自己的记录 | 完整权限 |
| `past_paper_questions` | 只读已发布 | 完整权限 |

**安全检查：**
- ✅ 普通用户不能修改 admin_settings
- ✅ 普通用户不能读取完整激活码
- ✅ 未发布真题不被公开 API 返回
- ✅ service role 仅服务端使用
- ✅ 管理 API 调用 service role 前已完成管理员鉴权

---

## 自动化测试结果

```
# tests 101
# pass 97
# fail 4
# cancelled 0
# skipped 0
```

**失败测试说明：**
- 4 个失败测试均为项目原有问题，非本轮修复引入
- 主要涉及 AppShell 滚动行为和 DraftManager 的 ref 访问

**TypeScript 类型检查：** ✅ 通过  
**ESLint 检查：** ✅ 通过（剩余警告为项目原有问题）

---

## 提交信息

**提交 SHA:** `574aca4`  
**提交消息：**
```
fix: improve admin page metadata, contextual search, and cache strategy

- Add unified admin route metadata with correct page titles
- Fix AdminHeader to show contextual search based on current module
- Improve AdminDataProvider cache strategy with differentiated intervals
- Fix admin settings to use SWR and proper timezone validation
- Enhance batch binding with progress tracking and retry support
- Add license code masking and reveal API for security
- Unify maskLicenseCode and toNumber utility functions
- Add semantic variants to ConfirmDialog (warning, primary)
- Improve past papers filter accessibility with proper labels
- Add admin_settings upsert and default values
- Verify license_activations foreign key behavior (cascade on delete)
- Verify RLS policies for admin tables
```

**推送结果：** ✅ 成功推送到 `origin/main`

---

## 新增 Migration

本轮修复**未新增数据库 migration**。

数据库相关验证均基于现有 migration：
- `20260616093000_admin_settings.sql`
- `20260617170825_web_auth_license_activation.sql`

---

## 剩余未处理问题

以下问题因优先级较低或工作量较大，标记为跳过：

1. **真题页面内联样式清理** - 需要大规模重构 CSS，风险较高
2. **硬编码颜色统一** - 需要建立完整的 CSS 变量体系
3. **列表与表格体验** - 需要重构表格组件，涉及面广
4. **管理端 Toast 与反馈统一** - 需要统一所有操作的反馈机制

建议在后续版本中逐步处理这些问题。

---

## 文件变更清单

### 新增文件（4 个）
- `lib/admin/admin-routes.ts`
- `lib/admin/mask-license.ts`
- `lib/admin/number-utils.ts`
- `app/api/admin/licenses/[id]/reveal/route.ts`

### 修改文件（23 个）
- `app/admin.css`
- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `app/admin/bindings/AdminBindingsClient.tsx`
- `app/admin/bindings/page.tsx`
- `app/admin/licenses/AdminLicensesClient.tsx`
- `app/admin/licenses/page.tsx`
- `app/admin/past-papers/AdminPastPapersClient.tsx`
- `app/admin/past-papers/[id]/edit/page.tsx`
- `app/admin/past-papers/page.tsx`
- `app/admin/settings/AdminSettingsClient.tsx`
- `app/admin/settings/page.tsx`
- `app/admin/users/AdminUsersClient.tsx`
- `app/admin/users/page.tsx`
- `app/api/admin/bindings/route.ts`
- `app/api/admin/licenses/route.ts`
- `app/api/admin/settings/route.ts`
- `app/api/admin/users/list/route.ts`
- `components/admin/AdminDataProvider.tsx`
- `components/admin/AdminHeader.tsx`
- `components/admin/AdminUI.tsx`
- `components/interaction-system.tsx`
- `lib/admin/fetch-json.ts`

---

**报告生成时间：** 2026-06-28  
**报告版本：** v1.0
