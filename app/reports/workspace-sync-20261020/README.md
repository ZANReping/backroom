# 当前开发目录同步记录

2026-10-20，将 E:\ZAN\backroom 中 Three.js 游戏的当前开发内容同步到 C:\Users\ZANRe\Documents\GitHub\backroom。

同步 5,631 个文件，约 1.58 GiB；其中 2,043 个内容相同、224 个更新、3,364 个新增。每个文件已进行 SHA-256 校验。覆盖前的 224 个文件备份在项目根目录的 `.cache/workspace-sync/2026-10-20T05-11-00-080Z/backup` 中，备份路径和源／目标哈希见 [sync.json](sync.json)。目标原有 Git 历史保留，未提交或推送。

包括当前 `app/src`、完整运行资源 `app/public`、资源源文件和许可记录、开发及验证脚本、测试输入、参考图、构建配置、锁文件、项目要求与文档。报告保留了文本／数据，以及当前 L1、快捷栏、碰撞和阴影工作的视觉对照。

源目录的依赖、构建产物、缓存、旧截图运行目录、CPU 性能剖析大文件和日志没有复制。它们不是安装和启动所必需；新目录依赖已按锁文件重新安装，构建输出重新生成。`app-lite` 及目标目录其它内容保持原状。只有历史基线回放依赖的 `.cache/.../before` 快照未迁移，普通开发、构建和当前正向验证不依赖这些快照。

运行方式：

```powershell
cd C:\Users\ZANRe\Documents\GitHub\backroom\app
npm ci --no-audit --no-fund --registry=https://registry.npmjs.org
npm run dev -- --host localhost --port 3000 --strictPort
```

后续启动若依赖已经安装，可直接执行最后一条。生产构建使用 `npm run build`。依赖安装、构建与静态回归结果见本目录 `installation.json`、`install.log`、`build.log`、`checks.log`。实际 App 验证和用户开发服务的端口／进程记录由本次同步完成时补充。

安装中确认锁文件有 11 个 tarball 地址仍指向无法解析的 npm.mirrors.msh.team。已备份原锁文件，仅将这 11 个地址的域名切到 registry.npmjs.org，所有依赖版本及 integrity 校验值逐项检查保持不变；源目录与目标目录同步修正，未改动全局 npm 配置。初次失败和修复后安装日志分别为 install.log、install-official.log。

## 安装与启动完成

- Node v24.11.1 / npm 11.6.2，官方源安装 500 个包成功，锁文件未升级版本。
- 生产构建通过；旱虾物品缓存、模型预热和 108 个 L1 第 17 版离线图集检查通过。
- 新目录完整 App 已在原生 RTX 4060 Laptop 的独立无头 Chrome 中进入 L1；测试浏览器、QA 服务和配置目录均已清理。
- 用户开发服务保留运行在 http://localhost:3000/，PID 44704；入口为新目录 app/node_modules/vite/bin/vite.js。进程及 URL 见 startup.json，HTTP 和代码版本检查见 server-check.json。
- 安装、构建和运行汇总见 installation.json。旧源目录保留；未创建 Git 提交或推送。原锁文件修复前的备份也保存在本次 backup 下，现有备份总数为 225 个。
