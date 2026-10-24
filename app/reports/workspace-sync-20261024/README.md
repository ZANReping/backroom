# 项目再次同步（2026-10-24）

来源：`E:\ZAN\backroom`。目标：`C:\Users\ZANRe\Documents\GitHub\backroom`。

同步序章前厅、商店与枪械、NPC、遗物、商人之家通路及手部等最新更新，保留目标部署配置、运行依赖、Git 历史和 `app-lite`。

## 同步结果

- 本轮清单 7,670 个文件：6,868 个相同，更新 104 个，新增 698 个；传输 303,988,642 字节。
- 全部复制文件 SHA-256 一致，复制期间源文件未漂移；独立复核 4,070 个源码、配置与运行资源文件，零差异。
- 目标原有 Git HEAD `8b9a7204a8b20a4c2d42c532860311a08960b2e6` 保持不变。未提交、推送或改写历史。
- 覆盖前备份：`E:\ZAN\backroom\.cache\workspace-sync-20261024\backup-2026-10-24T15-06-26-606Z`。
- 依赖锁与现有安装一致，未重装依赖。根 Vercel 输出仍为 `app/dist`，应用目录配置为 `dist`。
- 保留完整运行资源、来源许可、脚本与开发文档，排除缓存、调试日志、未引用历史截图与超过 50 MiB 的诊断报告。

[完整同步清单](sync.json)、[独立文件核验](final-file-check.json)。

## 验证

9 条命令全部退出码 0：

1. `npm --prefix app ls --depth=0`
2. `npm run build`
3. `node app/scripts/check-vercel-config.mjs --built`
4. `npm --prefix app run check:firearms`
5. `npm --prefix app run check:foyer-entry`
6. `npm --prefix app run check:foyer-v2`
7. `npm --prefix app run check:ferren-foyer-integration`
8. `npm --prefix app run check:traders-circulation`
9. `npm --prefix app run check:four-import`

完整生产构建约 57.2 秒；依赖、部署产物及六项专项回归通过。保留当前 `app/dist/index.html` 和主包 `assets/App-C2uQiycl.js`，产物哈希见 [构建产物](build-artifacts.json)。构建保留既有字体路径、PostCSS、混合动态导入和包体积提示，未通过关闭检查隐藏错误。

[命令结果与耗时](verification.json)、[实际构建日志](build-check.txt)、[部署产物检查](config-built-check.txt)。

验证产生的脚本、TypeScript 和 Vite 缓存已清理，保留依赖和已验证生产包。没有启动游戏、浏览器或开发服务，没有执行远程推送或云端部署。[清理记录](cleanup.json)。
