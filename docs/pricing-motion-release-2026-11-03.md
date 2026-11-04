# 会员方案页动效与纯色发布 — 2026-11-03

- 正式地址：https://www.ieltswriting.online/pricing
- Vercel 项目：allensyks-projects/ielts-writing（`prj_OK3wG8WNwuRj3bLgj4WkHwNWivk1`）。
- 正式部署：`dpl_4NsRTXDfv18Nt4APiFHxCwYUW4Ko`，Production / READY。
- 构建地址：https://ielts-writing-e40esbi2c-allensyks-projects.vercel.app
- 基底为原正式部署 `dpl_EDggyKhQYBEFaJV7BuwmgZL9tM8Z`，记录的 Git 基底为 `85115a71ae74352c1450b4ba559479d0316c1ea6`。本次直接发布独立源码快照，没有创建 Git 提交或执行 Git push。

## 发布范围

仅更新或新增以下 4 个文件：

- `app/pricing/page.tsx`
- `app/pricing/pricing.css`
- `components/billing/PricingMotion.tsx`
- `components/billing/PricingWaterfall.tsx`

从正式部署恢复源码并逐文件核对 SHA-1，再覆盖上述文件。上传清单共 504 个源码文件，其他文件均与原正式部署一致；本地其余未发布修改未包含在本次发布中。上传清单排除本地凭据、环境文件、日志和工具状态。

## 页面与验证

标题两行和主按钮统一使用原主题纯蓝色 `#0058bc`。保留绿色、蓝色和淡紫色背景的持续流动、滚动渐显、卡片微光及鼠标彩色下落拖尾，并适配系统和站内减少动态效果的设置。

先以 `--prod --skip-domain` 构建正式环境暂存版本，验收后通过 Vercel promotion 将同一构建切换到正式域名。暂存和正式地址均验证 `/pricing` 200、3 个样式资源 200、未登录 `/billing` 307 并返回 `/login?next=%2Fbilling`、未登录 `/api/billing/status` 401、`/terms` 200。

正式浏览器检查确认标题两行和按钮均为 `rgb(0, 88, 188)`，标题及按钮无渐变填充；背景动画持续运行，鼠标移动可激活流光。1440px 桌面和 390px 手机宽度无横向溢出，浏览器控制台无错误。本次部署最近 10 分钟的 error/fatal 运行日志查询未返回记录。

发布清单与验收证据保存在被忽略的 `.logs/pricing-release-preparation.json`、`.logs/pricing-release-dry-run.json`、`.logs/pricing-staged-release-verification.json`、`.logs/pricing-production-release-verification.json` 和 `.logs/pricing-production-browser-verification.json`。正式页面截图为 `.logs/pricing-motion-production-live.jpg`。
