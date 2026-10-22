# Vercel 部署（原版 Three.js 游戏）

游戏源码在 `app`。Vite 实际生成 `dist`，不会生成 `build`。2026-10-22 的失败日志为 `[STATIC_BUILD_NO_OUT_DIR] No Output Directory named "build" found`；构建已经成功，500 kB chunk 提示不是失败原因。

仓库和应用各提供一份 `vercel.json`，使两种 Root Directory 配置都读取正确的安装、构建和输出目录：

| Vercel Root Directory | 安装命令 | 构建命令 | 输出目录 |
| --- | --- | --- | --- |
| `app`（推荐） | `npm ci --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org` | `npm run build` | `dist` |
| 仓库根目录 | `npm ci --prefix app --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org` | `npm --prefix app run build` | `app/dist` |

`vercel.json` 明确指定 `framework: vite` 和 `outputDirectory`，覆盖项目中残留的 `build` 输出设置。无需关闭 TypeScript 检查、删除模型资源或调高警告阈值。Node.js 固定为 24.x，与当前本地验证环境一致；锁定的依赖版本和 integrity 不变。

## 本地验证

在仓库根目录执行：

```sh
npm ci --prefix app --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org
npm run build
node app/scripts/check-vercel-config.mjs --built
```

检查器核对两种构建上下文指向同一个真实 `app/dist/index.html`、入口脚本和样式等文件完整、应用配置与锁文件相符，并检测源文件 import 的大小写，提前发现 Linux 构建路径问题。普通 `node app/scripts/check-vercel-config.mjs` 不要求产物已生成。

在 `app` 内执行 `npm run build` 仍然有效。`dist` 可在验证后清理；Vercel 每次部署会重新构建，不应将本地缓存、`node_modules` 或 `dist` 提交到仓库。

## 同步与部署

主开发目录仍为 `E:\ZAN\backroom`，GitHub 本地副本为 `C:\Users\ZANRe\Documents\GitHub\backroom`。两处都保留配置修复；Git 元数据、Vercel 登录态及 `.env` 不随项目同步。

提交修复后的文件并推送至已关联仓库后，Vercel Git 集成会使用对应 Root Directory 下的配置重新部署。仅复制到本地 GitHub 文件夹不会改变远程仓库或既有部署。若手动重新部署旧 commit，它仍使用旧配置；应选择包含本次修复的新 commit。

`.vercelignore` 只控制 CLI 源码上传，排除原始素材、参考图、测试报告、旧版本和临时文件；源码、构建脚本与 `public` 运行资源保留。大型游戏优先使用现有 Git 集成；CLI 的源码上传上限与 Git 构建不同，不应为绕过限制删掉运行资源或升级付费计划。

云端排查需有效 Vercel 登录。本次本机 CLI 报告 token 无效、连接器不可用，因此不将本地构建通过表述为云端重新部署通过。

## 官方依据

- [vercel.json 配置（含 outputDirectory 覆盖规则）](https://vercel.com/docs/project-configuration/vercel-json)
- [Vite 部署](https://vercel.com/docs/frameworks/frontend/vite)
- [Node.js 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [CLI 上传限制](https://vercel.com/docs/limits#static-file-uploads)
