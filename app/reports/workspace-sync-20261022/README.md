# GitHub 副本同步与 Vercel 修复（2026-10-22）

主项目：`E:\ZAN\backroom`。同步目标：`C:\Users\ZANRe\Documents\GitHub\backroom`。

## 已确认的失败原因

用户提供的实际云端日志为：

```text
Error: [STATIC_BUILD_NO_OUT_DIR] No Output Directory named "build" found after the Build completed.
```

Vite 构建成功后生成 `dist`，Vercel 项目仍查找 `build`，导致产物收集失败。500 kB chunk 提示是非致命警告，本次保留提示及 TypeScript 检查，没有通过隐藏警告绕过问题。

失败部署：[dpl_EPuxSRfPCFji4JDAnxqFit4PSAAo](https://vercel.com/zan-repings-projects/backroom/EPuxSRfPCFji4JDAnxqFit4PSAAo)。公开 GitHub 提交状态也记录为 failure。

另在同步前复现仓库根目录缺少 `package.json` 的 `ENOENT`，见 [根目录构建基线](before-root-build.txt)。

## 修复

- `app/vercel.json` 明确指定 Vite、安装开发依赖、生产构建与 `dist` 输出。
- 根 `vercel.json` 对应指向 `app/dist`，根 `package.json` 提供转发构建入口；两种 Root Directory 都可使用。
- 应用与根目录固定 Node.js 24.x，保留所有依赖版本和 integrity。
- `.vercelignore` 排除 CLI 不需要上传的缓存、原始素材、参考图及测试凭据；完整 `public`、源码与构建脚本保留。Git 中忽略 `.vercel/` 私有状态。
- 新增 `app/scripts/check-vercel-config.mjs`，可执行 `npm --prefix app run check:vercel -- --built` 检查实际产物及配置。
- 完整步骤见 [部署说明](../../docs/VERCEL.md)。Vercel 的 `outputDirectory` 可覆盖项目设置，依据为 [官方配置文档](https://vercel.com/docs/project-configuration/vercel-json#outputdirectory)。

## 同步结果

最终保留 6,908 个文件：6,476 个相同，更新 81 个，新增 351 个；保留的新增／更新文件共 108,219,517 字节。复制后全部 SHA-256 一致，源文件在同步过程中未漂移。最终独立复核 3,742 个源码、配置和运行资源文件，也全部一致。

目标 Git HEAD 保持 `6d95eefaabbd8d9c67f1508e09988276385ac2dc`；保留 Git 历史及 `app-lite`，未提交或推送远程仓库。覆盖前文件备份位于 `E:\ZAN\backroom\.cache\workspace-sync-20261022\backup-2026-10-22T13-39-39-670Z`；第二轮覆盖前的副本备份另存于 `E:\ZAN\backroom\.cache\workspace-sync-20261022\backup-2026-10-22T14-04-06-270Z`。

一份 254,752,495 字节的原始浏览器遥测报告超出 [GitHub 单文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)，已从目标副本与后续同步范围排除，并加入 Git 忽略。该文件是本轮新增且与主项目完全一致的诊断输出，主项目原件未改动；运行和构建不依赖它。[排除清单与源文件哈希](omitted-artifacts.json)。

首轮验证期间，主项目继续产生 Level 7 地图更新，已于 2026-10-22 22:04 生成第二轮清单并追加同步（该轮更新 13 个、增加 14 个文件）。最终 6,908 个文件在复制时 SHA-256 全部一致，源文件未漂移；随后再次核验运行文件、构建产物并完成对应回归。未反向覆盖主项目。

[逐文件清单](sync.json)、[最终文件检查](final-file-check.json)。

## 验证

按 CI 构建环境执行干净安装（显式包含开发依赖）。11 条命令全部退出码 0：

1. `npm ci --prefix app --include=dev --no-audit --no-fund --registry=https://registry.npmjs.org`
2. `npm --prefix app ls --depth=0`
3. `node app/scripts/check-vercel-config.mjs`
4. `npm run build`（仓库根目录）
5. `node app/scripts/check-vercel-config.mjs --built`
6. `npm --prefix app run check:l1-offline`
7. `npm --prefix app run check:model-warmup`
8. `npm --prefix app run check:l8-resources`
9. `npm --prefix app run check:tiny-resources`
10. `npm --prefix app run check:thing-integration`
11. `npm --prefix app run check:bntg-bank`

干净安装约 60.9 秒，首轮包含 TypeScript 的完整构建约 85.9 秒。追加同步后又完成完整构建（约 56.8 秒）、配置产物检查、`check:l7-seams` 和 `check:l7-chart`，4 项全部通过，见 [追加回归](followup-verification.json)。两种配置均解析到实际存在的 `app/dist/index.html`，入口资源检查通过；758 个源文件、3,233 条本地 import 的大小写检查通过。两份配置使用的全部字段按当前官方 Schema 的对应属性规则校验通过；Schema 上游未使用的实验字段混用 Draft 版本，未将这些定义纳入本次字段校验。

当前保留可检查的 `app/dist`：最终主包 `assets/App-Bfi7Nrbt.js`，入口和主资源哈希见 [产物记录](build-artifacts.json)。`dist` 仍由 Git 忽略，不需要提交。

[全部命令结果](verification.json)、[实际构建日志](build-check.txt)、[配置与产物检查](config-built-check.txt)、[Schema 字段校验](schema-check.json)。

两轮验证后均清理新生成的编译与脚本缓存，保留依赖及本轮产物。没有启动游戏、开发服务或浏览器，也没有目标目录 Node 服务进程。[清理记录](final-cleanup.json)。

## 云端复验状态

本机 Vercel CLI 返回 token 无效，连接器相应操作也不可用，未读取或改动凭据、未执行云端重新部署。本轮结论是已修复配置、同步文件并通过实际本地生产构建，不代表失败的旧部署自动变为成功。

把包含本次修复的改动提交并推送到现有 Vercel 关联仓库后，新 Git 部署会读取对应目录的 `vercel.json`。重新部署旧 commit 仍会使用旧设置。无需改变付费计划、删除运行素材或提交本地 dist。

[部署诊断与边界](deployment-diagnosis.json)。
