# 据点图鉴所属层级修复（2026-11-10）

原项目：`E:\ZAN\backroom`。

未发现据点的提示原先固定写为“在 Level 1 寻找定居点地标”，没有读取 OUTPOSTS 中已正确登记的 parent。现改为通过 `levelNo(o.parent)` 显示对应的玩家可见层级编号。改动位于 `app/src/components/InventoryOverlay.tsx:1448`，正式代码只修改这一处提示。

未发现的名称及简介仍隐藏，已发现的名称、介绍、阵营样式和团体筛选保持原行为。不修改发现记录或存档，不需要重置存档。

| 所属层级 | 据点 |
| --- | --- |
| Level 1 | Alpha 基地、商人之家、希波克拉底 - 1、Tom 的餐馆、丰饶角 |
| Level 2 | 办公区EL3A |
| Level 3 | Gemma 基地、存储设施、蓝色救赎 |
| Level 4 | Omega 基地 |
| Level 5 | 家政服务、家常酒店、原住民 |
| Level 8 | 空巢前哨站、哈莫兹洞穴社群 |
| Level 274 | 杰瑞的房间 |

## 验证

- 在实际 App 的“图鉴 → 据点”中检查全部 16 个条目，使用独立内存发现记录及存档。
- [修复前](before/result.json)：复现全部提示写成 Level 1，其中 11 处与注册层级不符；23 项基线检查通过。
- [修复后](after/result.json)：65 项检查通过，全部未发现条目的层级提示正确；已发现名称及完整介绍、混合发现状态、九种团体筛选、844×390 桌面触控模拟通过。
- [生产构建](production-build.log)：TypeScript 与 Vite 通过。
- 已查看桌面顶部／底部及触控底部截图。运行无未捕获异常、无错误级控制台消息、无游戏资产加载失败。记录中的 ANGLE 精度警告和 favicon 404 不影响本次检查。
- 浏览器使用独立 `--headless=new`、配置目录和端口；两次浏览器及服务均已关闭，配置目录均已清理。没有访问用户日常浏览器或玩家存档。触控检查为桌面模拟，未作 Android 真机结论。

| 视角 | 截图 |
| --- | --- |
| 未发现据点，上半段 | [修复前](before/undiscovered-top.png) / [修复后](after/undiscovered-top.png) |
| 未发现据点，下半段 | [修复前](before/undiscovered-bottom.png) / [修复后](after/undiscovered-bottom.png) |
| 已发现据点 | [修复后](after/discovered.png) |
| 触控视口、混合发现状态 | [修复后](after/touch-bottom.png) |

## 复现命令

在 `E:\ZAN\backroom\app` 下执行：

```powershell
node scripts/verify-outpost-codex.mjs --before
node scripts/verify-outpost-codex.mjs
npm run build
```

验收脚本复用现有实际 App 入口 `verifier/entity-codex-app.html`，通过真实按键打开图鉴并操作分类及筛选。`--before` 仅在独立 Vite 服务中读取保留的 `InventoryOverlay.before.tsx`，不覆盖工作区源文件。
