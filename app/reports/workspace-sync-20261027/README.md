# 项目再次同步（2026-10-27）

来源：`E:\ZAN\backroom`。目标：`C:\Users\ZANRe\Documents\GitHub\backroom`。

同步移动手感、NPC 对话与商店界面、阵营仓库、移动端任务追踪和成长入口等最新更新。保留部署配置、依赖、Git 历史与 `app-lite`。

## 同步结果

- 8,268 个文件：7,571 个相同，更新 99 个，新增 598 个；本轮传输 229,640,134 字节。
- 全部复制文件 SHA-256 一致，复制期间源文件未漂移；独立复核 4,276 个源码、配置和资源文件，零差异。
- 目标 Git HEAD 保持 `032a79a53e80e31de9de1405360350c350267d38`，未提交、推送或改写历史。
- 覆盖前备份：`E:\ZAN\backroom\.cache\workspace-sync-20261027\backup-2026-10-27T10-15-52-740Z`。
- 依赖锁与安装一致，无需重装。Vercel 根输出为 `app/dist`，应用目录配置为 `dist`。
- 完整运行资源、素材来源和开发资料保留；缓存、原始调试日志、未引用历史截图及超过 50 MiB 的诊断报告不进入同步范围。

[同步清单](sync.json)、[独立文件核验](final-file-check.json)。

## 验证

9 条命令全部退出码 0：

1. `npm --prefix app ls --depth=0`
2. `npm run build`
3. `node app/scripts/check-vercel-config.mjs --built`
4. `npm --prefix app run check:movefeel`
5. `npm --prefix app run check:careers`
6. `npm --prefix app run check:warehouse-ui`
7. `npm --prefix app run check:merchant-trade`
8. `npm --prefix app run check:player-recovery`
9. `npm --prefix app run check:swim-integration`

完整生产构建约 65.7 秒。依赖、部署产物和六项专项检查通过，当前主包为 `assets/App-DP7dI-PO.js`。保留 `app/dist` 供检查，入口和主资源哈希见 [产物记录](build-artifacts.json)。本轮仅同步与静态验证，未启动实际游戏或浏览器；源项目已有实景记录随文档保留。

[全部结果与耗时](verification.json)、[构建日志](build-check.txt)、[部署产物检查](config-built-check.txt)。构建的既有字体路径、PostCSS、混合动态导入与包体积提示未影响构建完成。

验证产生的脚本、编译和 Vite 缓存已清理，依赖和当前生产包保留。未启动游戏、开发服务或浏览器，未执行远程推送或云端部署。[清理记录](cleanup.json)。
