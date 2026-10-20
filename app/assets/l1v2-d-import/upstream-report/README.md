# L1 v2 阶段 D

在阶段 C（0d8d04e）基础上：

- **衔尾段**：地面随机散落纸片/碎屑（每区块≤46 片，细节盒不参与遮挡），约 16% 柱子旁立一块黑色木板（`world/l1Building.ts`）。
- **花园段**：地被改为更小、更平、更密的苔藓/三叶草卡片（0.7 m 网格，倾角 -1.25），地面贴图与烘焙反照率提亮成连片苔藓（`renderer/l1Architecture.ts`、`l1Materials.ts`、`world/l1Bake.ts`）。
- **小径理发椅房**：新结构 `barberchair`（液压圆底座、镀铬柱、奶白人造革座/靠背/头枕、扶手、脚踏），约一半医务室房间改为理发椅房：1–3 张椅子沿门对面墙一字排开、面朝门口，外加一张桌子（`renderer/structures.ts`、`world/l1Dressing.ts`、`core/types.ts`、`content/decorRegistry.ts`）。
- 天鹰暗区 / 干燥区 / 停电参考按最终灯光重拍。

## 指标（cmp.py，工具计算，仅供参考）

| 参考 | C SSIM | D SSIM |
|---|---|---|
| parking-dim | .359 | .504 |
| parking-dry | .401 | .455 |
| power-out | .077 | .235 |
| path-room | .378 | .394 |
| garden | .131 | .141 |
| ouroboros | .204 | .208 |

## 已知
- 花园整体比参考亮约 17 灰阶；衔尾/花园 SSIM 仍低，主因是参考图广角和大件杂物构图。
- 干燥区比参考亮约 30 灰阶。
- SwiftShader 下停电/干燥场景偶发 CONTEXT_LOST，截图脚本已自动重拍。
- `npm run check:l1-v2` 448 passed；`tsc --noEmit` 无错误。
- DECORATIONS.md 未重新生成（上游该文档本身已过期，重生成会带入大量无关差异）。
