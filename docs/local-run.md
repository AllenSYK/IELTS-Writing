# 本地运行

## 环境要求

- Node.js 22 或更新版本
- npm
- Supabase CLI（仅在执行数据库 migration 时需要）

## 启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

## 生产构建

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 数据库

```bash
npm run supabase:migrate
```

不要修改或删除已经执行的 migration。需要调整 schema 时，应新增 migration。
