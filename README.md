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
- 管理端模型路由配置（密钥仅保留在服务端环境变量）

## 部署

Vercel 可直接识别 Next.js 项目。部署前配置 `.env.example` 中列出的环境变量，并确认 Supabase schema 已完成迁移。

第三方依赖和本地字体的许可证信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
