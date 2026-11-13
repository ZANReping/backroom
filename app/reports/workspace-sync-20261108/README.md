# 项目增量同步（2026-11-08）

来源为 E:\ZAN\backroom，目标为 C:\Users\ZANRe\Documents\GitHub\backroom。

本次增量涉及 Level 5 开发者世界面板、关注度锁定与手动设值、传送安全落点、楼层入口定位、赌场返程，以及对应的引擎行为和验证资料。

- 核对 8,864 个文件，更新 9 个，新增 9 个，传输 639,386 字节。全部 SHA-256 一致。
- 独立复核 4,633 个源码、配置和资源文件，零差异。
- 覆盖前备份位于 E:/ZAN/backroom/.cache/workspace-sync-20261108/backup-2026-11-07T16-37-28-012Z。
- 目标 Git HEAD 为 7bd47c7fd42ea8f50165a206cff997ee2d559f8b。本次为本地文件同步。
- 依赖锁和现有安装一致。Vercel 根输出为 app/dist，app 目录输出为 dist，生产构建及两种目录配置的产物校验通过。
- 已清理本次验证生成的临时缓存，保留当前生产产物与已安装依赖。

## 验证

| 命令 | 退出码 | 耗时 | 输出 |
| --- | --- | --- | --- |
| `npm --prefix app ls --depth=0` | 0 | 2.17 s | [日志](dependency-check.txt) |
| `npm run build` | 0 | 87.28 s | [日志](build-check.txt) |
| `node app/scripts/check-vercel-config.mjs --built` | 0 | 7.79 s | [日志](config-built-check.txt) |
| `npm --prefix app run check:l5hotel` | 0 | 4.3 s | [日志](check-04.txt) |
| `npm --prefix app run check:l5map` | 0 | 4.94 s | [日志](check-05.txt) |
| `npm --prefix app run check:l5-integration` | 0 | 3.41 s | [日志](check-06.txt) |
| `npm --prefix app run check:l5tails` | 0 | 2.65 s | [日志](check-07.txt) |
| `npm --prefix app run check:beast` | 0 | 6.43 s | [日志](check-08.txt) |
| `npm --prefix app run check:jazz` | 0 | 8.19 s | [日志](check-09.txt) |
| `npm --prefix app run check:hound-l02-integration` | 0 | 2.28 s | [日志](check-10.txt) |
| `npm --prefix app run check:l02-round5` | 0 | 2.04 s | [日志](check-11.txt) |

11 条命令通过。本次完成生产构建与脚本检查。验证期间目标分支新增提交 7bd47c7，随后重新核对全部 4,633 个运行文件和配置，哈希一致，并确认它延续同步前的提交历史。

[同步清单](sync.json) · [独立核验](final-file-check.json) · [验证结果](verification.json) · [生产产物](build-artifacts.json) · [清理记录](cleanup.json)
