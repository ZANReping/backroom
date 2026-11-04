# 项目同步记录（2026-11-04）

从 E:\ZAN\backroom 同步到 C:\Users\ZANRe\Documents\GitHub\backroom，包含 Level 5 重制、Level 5.1 赌场、据点返程、首次进入性能和部分场景道具更新。

- 比对 8,855 个文件，更新 100 个，新增 587 个，传输 52,762,575 字节。全部 SHA-256 一致。
- 独立复核 4,631 个源码、配置及资源文件。目标 Git HEAD 为 8b4f947051e4fbdee9968d81001dfb2de101f9a3。
- 覆盖前备份位于 E:/ZAN/backroom/.cache/workspace-sync-20261104/backup-2026-11-04T15-22-27-681Z。
- 沿用已安装依赖和锁文件。Vercel 根目录输出为 app/dist，app 目录输出为 dist。
- 保留已验证的 app/dist。已清理本次构建和检查生成的临时缓存。

## 目标目录验证

| 命令 | 退出码 | 耗时 | 输出 |
| --- | --- | --- | --- |
| `npm --prefix app ls --depth=0` | 0 | 11.29 s | [日志](dependency-check.txt) |
| `npm run build` | 0 | 144.36 s | [日志](build-check.txt) |
| `node app/scripts/check-vercel-config.mjs --built` | 0 | 17.18 s | [日志](config-built-check.txt) |
| `npm --prefix app run check:l5-integration` | 0 | 5.22 s | [日志](check-04.txt) |
| `npm --prefix app run check:l5map` | 0 | 6.79 s | [日志](check-05.txt) |
| `npm --prefix app run check:l5hotel` | 0 | 6.1 s | [日志](check-06.txt) |
| `npm --prefix app run check:casino` | 0 | 5.33 s | [日志](check-07.txt) |
| `npm --prefix app run check:outpost-return` | 0 | 6.83 s | [日志](check-08.txt) |
| `npm --prefix app run check:toilets` | 0 | 1.61 s | [日志](check-09.txt) |
| `npm --prefix app run check:l02-props` | 0 | 1.81 s | [日志](check-10.txt) |
| `npm --prefix app run check:entry-texture-upload` | 0 | 1.39 s | [日志](check-11.txt) |
| `npm --prefix app run check:entry-resources` | 0 | 1.44 s | [日志](check-12.txt) |
| `npm --prefix app run check:entry-compile-variants` | 1 | 1.4 s | [日志](check-13.txt) |

生产构建与 Vercel 两种根目录的产物校验均通过。原版着色器预热检查在源目录也会报错，原因是测试模拟渲染器只提供 compileAsync，而实际实现调用 compile。临时对齐模拟接口后通过 47 条断言，保留源与目标的原版脚本。[诊断记录](compile-variants-diagnostic.json)

本次验证仅运行生产构建与脚本，未启动游戏或执行远程推送。

[逐文件清单](sync.json) · [独立复核](final-file-check.json) · [验证结果](verification.json) · [生产产物](build-artifacts.json) · [清理记录](cleanup.json)
