# v25 验收记录：实体栖息地生成过滤 + 新物品图标修复

日期：2025-06-15 · 分支：v25-fix

## 变更
- `src/game/entities/types.ts`：EntityDef 新增 `habitat?: 'indoor'|'outdoor'|'any'`（默认 any）与 `aquatic?`（水生实体 outdoor 栖息地接受 liquid 水域瓦片）。
- `src/game/entities/{humanoid,critters,special,deep}.ts`：全部 29 种实体逐种设定 habitat——
  - indoor（11）：duller/skinstealer/faceling/insulator/copierwraith/seated/bellhop/mirrorself/mimicry/partygoer/windowent
  - outdoor（7）：carrier（小巷/装卸区）/tiny/thething（L7 水域，aquatic）/watcher/strider/mangled（L9 街道）/soilworm（L10 田野）
  - any（11）：hound/clump/deathmoth（偏室内主巢 L5）/pipeworm/smiler/arcwraith/wrangler/camocrawler/lightguide/deathrat/wretch
- `src/game/mapgen.ts`：实体 spawn 按 habitat 过滤候选瓦片（reachFloorTry 新增 outdoor/anyHabitat/waterOk 选项）；无符合瓦片降级 any 并在 `m.habitatFallback` 计数 + console.warn；上层房间实体跳过 outdoor 栖息地。
- `src/game/infinite.ts`：无限模式 chunk 生成同样按 habitat 过滤（L0 实体绝迹故默认不产生实体；LiveChunk.entities 随窗口平移/卸载管理）。
- `src/components/HUD.tsx`：ItemGlyph 新增 15 个 SVG 分支（chalk/folder/rope/mask/meat/book/marble/fruit/uv/kazoo/pocket/wheat/nails/timber/coin），修复 15 个新物品落默认 box；GLYPH_COLOR 为 20 个新物品补全局唯一配色。
- `src/game/items.ts`：chalkstub glyph scrap → chalk（与壁纸碎片/烧焦字条区分）。
- `verifier/v1/check.mts`：新增 [7] v25 新物品图标断言（SVG 分支存在 + 配色存在且全局唯一）。
- 新增 `verifier/v1/smoke-v25.mts`（栖息地冒烟）、`verifier/v1/shots-v25.py`（Playwright 截图）。

## 验证结果
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `npx tsx verifier/v1/check.mts`：**415 通过 / 0 失败**（修复前 15 个新物品「背包图标」FAIL）。
- `npx tsx verifier/v1/smoke-v25.mts`：全部通过（8 层×3 种子位置合规；L7/L9/L10 室外生成率 ≥80% 实际 100%；L5/L11 室内 100%；L0 实体绝迹回归通过）。另测 L1 30 种子：运输车 18/18 全在室外小巷，降级 0。
- `python3 verifier/v1/shots-v25.py`（1280×800）：全部通过——背包 20 件新物品无默认 box（29 个 currentColor svg，0 个 box）；L9 watcher/strider/mangled 全室外、L5 bellhop/mirrorself/skinstealer 全室内、L1 运输车室外；console 无报错。
- 截图：`verifier/runs/shots-v25/items.png`（20 种图标可辨无重复 box）、`habitat-l9-outdoor.png`、`habitat-l5-indoor.png`、`habitat-l1.png`。
