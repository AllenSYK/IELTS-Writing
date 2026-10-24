# 空与梦的雅思写作 Web

Next.js Web 应用，提供 IELTS 写作练习、作文批改、历史记录、学习分析、账号激活和管理后台。

## 技术栈

- Next.js App Router
- React and TypeScript
- Supabase Auth and PostgreSQL
- Resend and React Email
- Recharts
- Vercel

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

浏览器打开 `http://localhost:3000`。

环境变量说明见 [.env.example](.env.example)。不要提交 Supabase service role key、邮件服务密钥或模型服务密钥。

## 常用命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run migration:check
```

数据库 migration 位于 `supabase/migrations/`。已执行的 migration 只追加修复，不应修改或删除。

## 核心模块

- 注册、登录和密码重置
- 激活码生成、绑定、解绑和状态管理
- Task 1、Task 2 和完整模考
- 作文保存、提交和批改
- 历史记录、学习分析和写作热力图
- 用户账号中心和支持反馈
- Web 管理后台
- 管理端 API 密钥、接口地址和模型路由配置（密钥加密保存在服务端）

## 管理端配置模型

管理员登录后打开 `/admin/models`，输入服务商标识、兼容 Chat Completions 的 API Base URL、API 密钥和各用途的模型名称。
可先点“测试全部模型”，验证文本模型的流式 JSON 输出以及视觉模型的图片输入和 JSON 输出，再点“保存并应用”。测试使用当前表单，不会保存更改，也不会产生作文或学习记录。

密钥输入框留空会保留现有密钥；输入新密钥可以更换。已保存的密钥不会返回浏览器或写入审计日志。
后台配置启用时，新的 AI 请求读取后台接口、模型和密钥；停用后，整套配置回退到部署环境变量。未单独保存后台密钥时使用服务端 `AI_API_KEY`。

密钥使用 AES-256-GCM 加密，保存在已有的 `admin_settings` 表中，无需新增数据库迁移。该表只允许服务端 `service_role` 访问。
可设置稳定的服务端 `AI_SETTINGS_ENCRYPTION_KEY`；未设置时使用已有的 `SUPABASE_SERVICE_ROLE_KEY` 派生加密密钥。轮换对应的加密源后，需在管理端重新输入模型密钥。

运行 `npm run test:ai-live` 可只读检查当前已保存配置的五项模型能力（会产生少量模型调用费用，不修改数据库）。

## 部署

Vercel 可直接识别 Next.js 项目。部署前配置 `.env.example` 中列出的环境变量，并确认 Supabase schema 已完成迁移。

第三方依赖和本地字体的许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
