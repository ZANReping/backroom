# NPC 对话移除团体成长路线

2026-10-26，主项目 `E:\ZAN\backroom`。

NPC 对话不再嵌入完整的团体身份／晋升面板。成长路线沿用原入口：**图鉴 → 团体 → 查看团体详情与成长路线 → 个人 → 身份与晋升**。对话中的任务接取、阶段交付、普通选项、交易与寄存入口继续保留。

## 修改

- `app/src/components/MegMissions.tsx`：从 `MegNpcMissions` 中移除 `MegCareerPanel`。
- `app/src/components/FactionMissions.tsx`：从 `FactionNpcMissions` 中移除 `FactionCareerPanel`，覆盖 B.N.T.G.、阿丽安娜及杰瑞信众共用的对话组件。
- 成长组件本身、图鉴及设施中的成长入口、任务和存档数据保持原实现。

本轮源文件差异见 [task.diff](task.diff)，变更前副本保存在 `before/`，文件散列见 [manifest.json](manifest.json)。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 生产构建 `npm run build` | 通过；保留现有体积等构建警告 |
| `npm run check:careers` | 通过；36 次任务提交及现有路线、恢复、托管等检查 |
| `npm run check:merchant-trade` | 44/44 通过 |
| 实际游戏、真实光影、1920×1080、种子 424242 | 11 项通过，4 张截图 |
| 浏览器运行时／控制台／网络错误 | 0／0／0 |
| QA 资源 | 自有无头浏览器及服务器已退出，独立 profile 已删除 |

实际游戏从存档进入 Alpha，走原生 E 交谈入口与夜莺交谈，再切换至 EL3A 与薇拉·维斯珀交谈：两处均无完整成长面板，普通选项及任务保留；实际各接取一条任务成功。B.N.T.G. 寄存选项仍存在。关闭对话后，通过实际图鉴按键、团体分类及原有详情按钮进入对应团体，确认成长组件仍可展开。其他两个团体使用同一个已修改的 `FactionNpcMissions`，未逐一实测其场景。

已人工检查截图中的对话边界与排版，未出现移除面板后的空白占位。图鉴截图记录原有团体页面；成长内容位于个人页面下方。

## 截图与日志

- [MEG 对话](actual-game/dialog-meg.png)、[B.N.T.G. 对话](actual-game/dialog-bntg.png)
- [MEG 图鉴入口](actual-game/codex-meg.png)、[B.N.T.G. 图鉴入口](actual-game/codex-bntg.png)
- [浏览器结果及清理](actual-game/runtime.json)、[控制台](actual-game/console.json)
- [构建](build.log)、[成长回归](careers.log)、[交易回归](merchant.log)

## 复现

从 `E:\ZAN\backroom\app` 执行：

```powershell
npm.cmd run check:careers
npm.cmd run check:merchant-trade
npm.cmd run build
node reports/npc-growth-removal-20261026/verify.mjs --label=rerun
```

自动化使用 `--headless=new`、独占随机 Vite/CDP 端口及独立存储，不覆盖玩家存档。直接游玩时，与上述任务 NPC 交谈可确认面板已移出；图鉴中的团体详情仍可查看成长路线。
