# 笑魇（Entity 3）重制 · v61

只改单机逻辑与渲染；不改存档格式、联机协议、生成表。所有变种仍是 `type: 'smiler'`，变种与 AI 状态只存于实体运行时字段 `e.sm`。

## 文件
| 文件 | 内容 |
| --- | --- |
| `src/game/entities/smilers.ts` | 5 个变种的数值、各层级权重、运行时状态类型 |
| `src/game/engine/smilerAI.ts` | 专属状态机（取代 entityAI 中旧 lightHunter 分支） |
| `src/game/renderer/smilerMesh.ts` | 新模型（黑火着色器、合并齿列、咧嘴/隐现动画） |
| `src/game/engine/entityAI.ts` | 钩子：`beginSmilerFrame` / `updateSmiler`（labeled block 跳过通用分支，碰撞分离照常）/ `flushSmilerSpawns` / `noiseEvent` 转交 `smilerHear` |
| `src/game/renderer/entitiesMesh.ts` | `smiler` 交给 `buildSmilerMesh`，旧方块模型移除 |
| `src/game/renderer/renderer.ts` | 传入变种、变种确定后重建模型、每帧 `animateSmiler` |
| `src/game/core/audio.ts` | `smilerGiggle(vol, pitch)` 程序化咯咯笑 |
| `src/game/entities/special.ts` | 图鉴文案更新 |
| `scripts/check-smilers.ts` | 行为验收（模拟引擎） |
| `proto-smiler.html`、`src/proto/smilerProto.ts` | 独立预览页（`?mode=lineup|grin|dark`），不进正式入口 |

## 机制
- **趋光**：手电亮时，视野内（sight）或光晕半径内（lightPull，可隔转角）的笑魇会察觉并逼近；关灯后只凭光锁定的个体约 1.2s 内失去目标。
- **对峙**：玩家直视（视线锥 ±0.4rad）且不奔跑 → 停下。黑暗中持续对视 3.5s → 沉回黑暗；亮灯时只会被光牵着蠕近，停在 2.2m。
- **恐慌**：已察觉且 8m 内奔跑、9m 内巨响、攻击它、对峙中移开视线 → 扑击：0.6s 约 8m/s 的弹射扑跃，之后 1.6 倍速追猎（快于步行、慢于奔跑），持续 3.2s。
- **诱饵**：10m 内的荧光棒（含飞行中的）会把它引开；到达后盯着咧嘴 6s 再咬碎（物品被移除）。玩家亮灯且贴脸 3m 内时，诱饵须比玩家更近才有效。
- **群猎**：扑击会唤醒 12m 内同类及同群犬形。
- **扼颈**：命中后减速 1.1s、体力 −25。
- **受伤**：普通变种血量 < 35% 退回黑暗；其余情况被打即扑击。
- **L3**：不受光照与目光约束（对峙无效）。
- **停电**：L1 停电生成的个体仍随灯光恢复消散（`blackoutSpawn` 逻辑不变）。

## 变种
| 变种 | 血/速/伤 | 特点 | 应对 | 出现层级（权重） |
| --- | --- | --- | --- | --- |
| 笑魇 | 40 / 2.5 / 20 | 标准行为 | 关灯、对视、慢退、荧光棒 | L1 64–80%、L2 52%、L3 38%、L8 46% |
| 幽影笑魇 | 26 / 3.6 / 17 | 环形眼、方齿；远处几乎不可见（4.5m 内或被照到才现形）；附近开手电的瞬间扑击；对视无效；1.6s 就咬碎荧光棒 | 在它附近别开灯 | L1 停电 22%、L2 16%、L3 14%、L8 12% |
| 饥饿笑魇 | 30 / 1.95 / 15 | 高瘦、拖地长臂、牙齿打颤；循声锁定 10–12s；对视只稳得住 2.4s；会吃地上的食物 | 丢食物、别出声 | L1 14–20%、L2 24%、L3 8% |
| 犬形笑魇 | 30 / 3.25 / 13 | 四足；2–3 只成群；绕到侧后方，从视线外扑；被盯住的那只后退 | 背靠墙、轮流盯 | L2 8%、L3 30%、L8 22% |
| 巨笑魇 | 140 / 1.55 / 34 | 体型 ×1.65、长角、四眼、双排齿；对视无效；脚步震屏，踩碎荧光棒；被手电持续直射 1.3s → 踉跄 2.4s（冷却 7s） | 手电照眼后绕开 | L3 10%、L8 20% |

## 模型与性能
- 单只 10–21 次绘制、约 900–1600 面（旧版 37 次绘制）。齿列、火舌、口腔均合并为单个几何体。
- 黑火：`MeshLambertMaterial.onBeforeCompile` 做沿法线的多频位移（保留雾效，program 按振幅缓存）。阴影深度材质不跟随位移，影响很小。
- 动画量由 AI 给出：`sm.grin`（咧嘴）、`sm.glow`（眼齿亮度）、`sm.vis`（幽影隐现）。

## 验收
- `npx tsc -p tsconfig.app.json --noEmit` 通过；`npm run build` 通过（仅 chunk size 提示）。
- `npx esbuild scripts/check-smilers.ts --bundle --platform=node --format=esm --outfile=.cache/check-smilers.mjs && node .cache/check-smilers.mjs`：22 项全部通过。
- 未在真实关卡中实机游玩；寻路仍沿用 `stepEntity`（无 A*），复杂走廊里的包抄效果需实机调参。
