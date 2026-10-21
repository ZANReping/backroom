# GitHub 开发副本同步（2026-10-21）

来源：`E:\ZAN\backroom`。目标：`C:\Users\ZANRe\Documents\GitHub\backroom`。

按用户本次请求仅同步、清理和静态验证，未启动游戏、开发服务器、预览服务器或浏览器。

## 同步范围与完整性

- 同步当前 Three.js `app` 的源码、配置、锁文件、完整运行资源、素材来源与许可、脚本、参考图及开发文档；报告保留结构化数据和文档直接引用的文件，未复制大量未引用历史截图、调试日志或历史烘焙副本。
- 6,557 个文件：5,168 个相同，更新 195 个，新增 1,194 个；传输内容 1,257,328,428 字节。
- 复制后全部 6,557 个文件 SHA-256 一致，源文件在本轮同步中没有漂移。随后独立核验 3,595 个源码、配置及运行资源文件，也全部一致；检查产生的报告文件单独保留。
- 保留目标 Git 历史，HEAD 仍为 `d41dafcf46c08bbc648886d59f9b61f681db003d`，未提交、重置或推送。
- 保留 `app-lite` 的源码及资源，不传播主项目对旧版本的改动；仅清理其中的可重建缓存、旧 dist 和分发 zip。
- 覆盖前的旧文件已逐一校验并备份到 `E:\ZAN\backroom\.cache\workspace-sync-20261021\backup-2026-10-21T14-48-23-636Z`。

详见 [逐文件同步清单](sync.json) 与 [最终文件检查](final-file-check.json)。

## 清理

删除 69 项旧缓存、构建目录、分发文件和诊断日志，共 2,037,808,962 字节，约 1.90 GiB。包括根目录与 app 缓存、脚本缓存、TypeScript/Vite 缓存、app/app-lite 的 dist，以及旧 app-lite 分发包。

根缓存内的旧备份和旧分发包先归档并校验，共 226 个文件，存于 `E:\ZAN\backroom\.cache\workspace-sync-20261021\archived-target-files`。保留已有 `node_modules`，其依赖与当前锁文件匹配。离线光照图集等运行资源不按缓存删除。

验证完成后再次删除本轮生成的 dist、脚本及编译缓存；最终没有残留这些临时目录，目标目录也没有 Node 服务进程。详见 [初次清理](cleanup.json) 和 [最终清理](final-cleanup.json)。

## 验证

目标 `app` 下执行下列命令，11 条全部退出码 0：

1. `npm ls --depth=0`
2. `npm run build`
3. `npm run check:l1-offline`
4. `npm run check:model-warmup`
5. `npm run check:shrimp-item-cache`
6. `npm run check:traders-visibility`
7. `npm run check:traders-gates`
8. `npm run check:moth-watch-resources`
9. `npm run check:l4-melee-wrangler-integration`
10. `npm run check:ouro-import`
11. `npm run check:arms-integration`

L1 离线图集修订 19，108 个区块及 11 个取景锚点通过；111 项模型预热检查通过；衔尾段检查包含 96 组布局基线、12 组布局样本，共 137,261 项断言。

[命令结果与耗时](verification.json)、[构建输出](build-check.txt)、[依赖检查](dependency-check.txt)。构建保留既有字体路径、PostCSS、动态/静态混合导入及大包体提示，未引入新的源码修改。按用户要求本轮不进行游戏运行或浏览器验收；验证结论为依赖、生产构建与所列静态回归通过。

## 之后使用

开发：在目标 `app` 中执行 `npm run dev`。生产预览前需先 `npm run build`，再执行 `npm run preview`；本轮已验证构建，但为保持目录干净删除了产物。若需重装依赖，可使用 `npm ci --no-audit --no-fund --registry=https://registry.npmjs.org`；本轮未重装依赖，也未改动用户全局 npm 设置。
