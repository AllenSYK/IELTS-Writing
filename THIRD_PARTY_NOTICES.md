# Third-Party Notices

项目通过 npm 使用第三方依赖。具体版本和完整依赖树以 `package-lock.json` 为准，依赖自身的许可证文件随 npm 包保留在 `node_modules` 中。

主要直接依赖包括：

| Package | License |
| --- | --- |
| Next.js, React, React DOM | MIT |
| Supabase JavaScript and SSR clients | MIT |
| React Email | MIT |
| Recharts | MIT |
| Resend | MIT |
| SWR | MIT |
| Zod | MIT |
| Lucide React | ISC |
| dotenv | BSD-2-Clause |
| TypeScript | Apache-2.0 |

重要传递依赖还包括 Next.js 图像处理链中的 Sharp/libvips 平台包（Apache-2.0、MIT 和 LGPL-3.0-or-later 组合许可），以及使用 MPL-2.0、CC-BY-4.0、Python-2.0、BlueOak-1.0.0 等许可证的开发工具数据包。这些依赖均由 npm 安装，未复制到项目自有源码目录；许可证文件随对应包发布并保留。

## Local font files

### Inter

Files: `public/fonts/inter-400.ttf`, `inter-500.ttf`, `inter-600.ttf`, `inter-700.ttf`

Copyright 2016 The Inter Project Authors.

License: SIL Open Font License 1.1. See `licenses/Inter-OFL-1.1.txt`.

Source: https://github.com/rsms/inter

### Material Symbols Outlined

File: `public/fonts/material-symbols-outlined-400.ttf`

Copyright 2026 Google LLC.

License: Apache License 2.0. See `licenses/Material-Symbols-Apache-2.0.txt`.

Source: https://github.com/google/material-design-icons
