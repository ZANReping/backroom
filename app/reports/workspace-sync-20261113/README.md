# 项目增量同步（2026-11-13）

将 E:\ZAN\backroom 的增量同步到 C:\Users\ZANRe\Documents\GitHub\backroom，包含 Worker 计算、据点图鉴、前厅论坛和音频、触控文档、鼠标视角恢复、近战蓄力及启动画面更新。

- 核对 9,021 个文件，更新 32 个，新增 157 个，共复制 39,933,009 字节。复制后 SHA-256 全部一致。
- 独立复核 4,667 个源码、配置和资源文件。目标 Git HEAD 为 7bd47c7fd42ea8f50165a206cff997ee2d559f8b。
- 覆盖前的文件备份在 E:/ZAN/backroom/.cache/workspace-sync-20261113/backup-2026-11-13T12-54-28-630Z。
- 使用目标目录现有依赖。Vercel 在仓库根目录构建输出 app/dist，在 app 目录构建输出 dist。
- 已清理本轮验证产生的临时缓存，生产产物位于 app/dist。

## 构建与检查

| 命令 | 退出码 | 耗时 | 输出 |
| --- | --- | --- | --- |
| `npm --prefix app ls --depth=0` | 0 | 3.84 s | [日志](dependency-check.txt) |
| `npm run build` | 0 | 132.35 s | [日志](build-check.txt) |
| `node app/scripts/check-vercel-config.mjs --built` | 0 | 28.5 s | [日志](config-built-check.txt) |
| `npm --prefix app run check:worker-pipeline` | 0 | 5.17 s | [日志](check-04.txt) |
| `npm --prefix app run check:worker-map-parity` | 0 | 8.17 s | [日志](check-05-retry.txt) |
| `npm --prefix app run check:melee` | 0 | 7.47 s | [日志](check-06.txt) |
| `npm --prefix app run check:model-warmup` | 0 | 1.47 s | [日志](check-07.txt) |
| `npm --prefix app run check:swim-integration` | 0 | 3.1 s | [日志](check-08.txt) |
| `npm --prefix app run check:foyer-entry` | 0 | 2.72 s | [日志](check-09.txt) |
| `npm --prefix app run check:foyer-survival` | 0 | 2.99 s | [日志](check-10.txt) |

10 条命令全部通过。Worker 地图一致性检查首次缺少源项目的旧版对照文件。补齐 16 个基线文件并核验哈希后，重跑通过 204 组比较。补录文件已计入新增数量，首次结果和重试均保留在验证记录。

[同步清单](sync.json) · [独立核验](final-file-check.json) · [验证结果](verification.json) · [生产产物](build-artifacts.json) · [清理记录](cleanup.json)
