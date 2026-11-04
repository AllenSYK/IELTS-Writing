# 前端视觉问题修复（2026-11-03）

已完成本轮指定的六项修复，改动位于本地代码。对应扫描清单中的第 1、2、3、5、8、9 项。

## 修改结果

| 项目 | 结果 |
| --- | --- |
| 手机导航高度 | 抽屉和遮罩通过 Portal 挂载到 body，脱离带模糊效果的侧栏；抽屉覆盖视口高度，内容可滚动 |
| 721–900px 菜单 | 按钮和抽屉共用 900px 断点；放大至 901px 时自动关闭抽屉，恢复桌面导航 |
| 颜色变量 | 补齐主要、辅助、次要文字色以及成功、警告色；辅助文字使用 `#414755`，成功色 `#166534`，警告色 `#845000` |
| 页面标题 | 应用顶栏统一为 24px 页面标题；移除正文重复页面名，保留说明和操作；普通分区标题统一使用 20px，内容标题使用 24px |
| 功能名称 | 导航、标题、模式选择、草稿、历史、学习规划和相关提示统一使用“错题本”“完整模考”；删除记录提示使用“撤销” |
| 会员小字 | 说明正文 14px，条款、续费及付款说明 13px，其余辅助文字至少 12px；加深标签和辅助文字颜色；热力图文字同步调整 |

导航同时补齐 Tab 焦点循环、Esc 关闭、关闭后的焦点恢复和背景不可操作状态。抽屉内链接继续使用 Next Link 的正常导航。

## 验证结果

- `npm run ci` 通过：类型检查、lint、旧地图结构检查及 240 项测试全部成功。lint 有 10 条现有警告，无错误。
- `npm run build` 通过。临时视觉预览路由已移除，构建产物没有该路由。
- `git diff --check` 通过。

| 浏览器检查 | 结果 |
| --- | --- |
| 390×844 | 抽屉与遮罩高度均为 844px；9 个导航入口完整显示，抽屉实际父元素为 body |
| 720、721、900px | 抽屉均正常显示，断点两侧没有隐藏抽屉的问题 |
| 901px | 抽屉自动关闭，菜单按钮隐藏，6 个桌面主要入口保留 |
| 390×420 短屏 | 抽屉可滚动并成功进入底部“隐私政策”，跳转后自动关闭 |
| 键盘 | Shift+Tab 从关闭按钮回到最后一个链接；Tab 从末尾回到关闭按钮；Esc 关闭并恢复菜单按钮焦点 |
| 页面标题 | 服务条款、隐私政策各保留一个页面 h1；实测字号 24px |
| 会员中心手机布局 | 页面宽度为 390px，无页面水平溢出；已渲染辅助文字未发现低于 12px 的文本；说明正文 14px、条款 13px |
| 会员中心分区标题 | 订阅与账单、账号设置、写作热力图均为 20px |

会员中心视觉验收使用真实组件和本地模拟会员数据；这些截图用于确认排版与颜色，不代表线上账号或付款状态。

## 实现位置

- [导航 Portal、焦点与断点处理](/Users/allen/Documents/雅思写作系统网页端_副本2/components/layout/Sidebar.tsx:75)
- [颜色和标题规格](/Users/allen/Documents/雅思写作系统网页端_副本2/app/globals.css:53)
- [响应式导航样式](/Users/allen/Documents/雅思写作系统网页端_副本2/app/globals.css:10552)
- [会员文字可读性](/Users/allen/Documents/雅思写作系统网页端_副本2/app/globals.css:11569)
- [顶栏统一名称](/Users/allen/Documents/雅思写作系统网页端_副本2/components/layout/AppShell.tsx:8)

## 截图与记录

- [手机完整导航](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/mobile-navigation.jpg)
- [900px 导航](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/tablet-navigation.jpg)
- [手机标题](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/terms-mobile.jpg)
- [会员中心手机布局](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/member-mobile.jpg)
- [会员条款与续费说明](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/member-mobile-offer.jpg)
- [导航测量结果](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/navigation-verification.json)
- [会员样式测量结果](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/member-verification.json)
- [项目检查日志](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/ci-final.log)
- [生产构建日志](/Users/allen/Documents/雅思写作系统网页端_副本2/.logs/frontend-visual-fixes-2026-11-03/build.log)
