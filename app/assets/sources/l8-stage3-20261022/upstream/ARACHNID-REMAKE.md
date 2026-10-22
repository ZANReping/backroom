# L8 蛛形纲重制

阶段 1（建模，`renderer/arachnidMesh.ts`）与阶段 2（动画，`renderer/arachnidAnim.ts`）已提交，本文件只记录 **阶段 3：游戏机制**。

ZAN 的决定（2026-10-22）：18 项全部加入（17 个变种 + 符文蛛巢区环境）；多数蜘蛛可以靠跳水甩掉，但不是所有变种都不会游泳（水蛛、无氧蛛甩不掉）。

不改存档格式和联机协议：`e.ar`（实体运行时状态）与按 Engine 的 `ArachnidWorld`（中毒、网、茧、蛛巢登记）都不入存档；换层即清空。

## 新增文件
| 文件 | 内容 |
|---|---|
| `src/game/engine/arachnidStats.ts` | 变种数值表 `ARACHNID_STATS`（纯数据，forms.ts 也引用；`arachnidAI.ts` 原样再导出）、水体甩脱规则 `arachnidLosesTargetInWater`、图鉴/召唤用的 18 行子变种 |
| `src/game/engine/arachnidAI.ts` | AI 状态机、18 项特殊能力、玩家状态效果（中毒/蛛网/酸雾/螨群/吸附蜱）、受击/火焰/泼水/交互钩子、公共查询、开发者传送 `devGotoArachnidNest` |
| `src/game/world/arachnidNest.ts` | 符文蛛巢选址（纯函数 `arachnidNestOfChunk`）、L8 野外种群与守巢种群生成钩子 `arachnidL8Chunk`、旧外形数据映射 `legacyArachnidKind` |
| `src/game/renderer/arachnidRender.ts` | 实体建模入口、片段播放与 0.18s 混合、死亡姿态、符文点光源、蛛巢/人形茧/网/酸雾世界视图 |
| `src/components/arachnidHud.tsx` | HUD：中毒、被网缠住、螨虫瘙痒、吸附蜱进度、酸雾模糊/泛绿、蛛网白色晕影 |
| `scripts/check-arachnid.ts` | 无头机制验收（`npm run check:arachnid`） |
| `scripts/verify-arachnid-ingame.mjs` | 游戏内 Chromium 截图验收（`npm run verify:arachnid-ingame`，端口 3454/9454） |

## 变种数值表（17 个变种 + 蛛巢）
速度为「追击 / 游荡」m/s；感知为「视野 / 听觉」m；毒为「每秒伤害 × 持续 × 最多层数」；权重为野外生成权重（各洞系另乘 `ECO_MUL`）。

| 变种 | 名称 | 生命 | 速度 | 伤害 | 感知 | 半径 m | 毒 | 标志 | 权重 | 特殊能力 |
|---|---|---|---|---|---|---|---|---|---|---|
| wolf | 洞穴狼蛛 | 26 | 3.3 / 1.0 | 9 | 7 / 6 | 0.3 | 1/s×4s×1层 | ambush | 22 | 地面伏击：静伏到 4.5m 内暴起，lunge 扑咬带轻微毒（1/s × 4s） |
| weaver | 织网蛛 | 18 | 1.9 / 0.7 | 6 | 5 / 5 | 0.25 | — | webber | 18 | 在通道里织网（缠住 3s、挣扎可提前挣脱）；守网半径 7m，不远追 |
| jumper | 跳蛛 | 14 | 2.8 / 1.1 | 8 | 8 / 5 | 0.2 | — | — | 16 | 3–5m 内蓄力跳扑（根位移 0.9m，其余距离在空中补足），落点 1.2m 内命中 |
| blindcave | 盲眼洞蛛 | 22 | 2.5 / 0.8 | 8 | 0 / 7 | 0.28 | — | blind | 12 | 无眼，只靠脚步震动定位；蹲走（近乎无声）可以从它身边走过 |
| broodswarm | 群居幼蛛潮 | 30 | 1.7 / 0.6 | 2.4 | 4 / 6 | 0.7 | — | swarm | 10 | 几十只幼蛛涌上来持续啃咬（2.4/s）；单体打击只伤 12%，火焰/爆炸一次驱散；带母蛛时持续补员 |
| harvestman | 长脚盲蛛 | 8 | 3.0 / 0.8 | 1 | 4 / 5 | 0.45 | — | timid | 14 | 基本无害：3.2m 内或受击就逃（挂旧「食草被动型」标志） |
| diving | 水蛛 | 18 | 2.3 / 0.8 | 7 | 6 / 6 | 0.25 | — | swim | 6 | 会游泳和潜水：跳水甩不掉，在水里以 2.8m/s 追击、跟着玩家下潜 |
| colossus | 极巨蛛 | 180 | 2.1 / 0.7 | 30 | 9 / 9 | 1.1 · 余量≥2.4 | — | runic | 0.6 | 首次交战先 rear 威吓 1.6s，lunge 重伤 30 并减速；洞穴余量 <2.4m 的窄道过不去 |
| widow | 寡妇毒蛛 | 30 | 2.6 / 0.8 | 6 | 6 / 5 | 0.3 | 2/s×12s×3层 | runic | 1 | 强毒：每次咬中叠 1 层中毒（2/s × 12s，最多 3 层） |
| regen | 再生蛛 | 40 | 2.7 / 0.9 | 9 | 6 / 6 | 0.32 | — | runic | 1 | 每秒回血 3（被火烧后停 6s）；单次受击 ≥8 断肢，脱战后用 regen 片段长回 |
| undying | 不死蛛 | 34 | 2.3 / 0.8 | 10 | 6 / 6 | 0.32 | — | runic | 0.8 | 第一次「死亡」后 4s 内 revive，以 30% 血复活一次（跛行）；只有火焰或 ≥15 的重击处决才能彻底杀死 |
| fireproof | 抗火蛛 | 38 | 2.8 / 0.9 | 10 | 7 / 6 | 0.3 | — | runic,fireproof | 1 | 免疫火焰与爆炸火焰伤害，不怕打火机驱赶 |
| anoxic | 无氧蛛 | 32 | 2.6 / 0.9 | 9 | 6 / 6 | 0.3 | — | runic,anoxic | 0.8 | 无需呼吸：沿湖底追进水里，跳水甩不掉 |
| cavescorpion | 洞蝎 | 28 | 2.5 / 0.8 | 7 | 5 / 6 | 0.32 | 1.5/s×6s×2层 | — | 10 | 贴身 pinch 螯夹 7；1.1–1.45m 用 sting 尾刺 6 + 中毒（1.5/s × 6s） |
| whipscorpion | 鞭蝎 | 22 | 2.3 / 0.8 | 4 | 6 / 5 | 0.28 | — | — | 8 | 2–4.5m 内 spray 喷酸雾：35° 锥形内每口 2 伤害 + 6s 腐蚀视野；贴身 pinch |
| tick | 吸附蜱 | 6 | 1.8 / 0.5 | 1 | 3 / 4 | 0.12 | — | — | 12 | latch 吸附后每秒吸血 1、逐渐 engorge 膨胀；交互键或打击拔下；约 20s 吸饱后自己脱落 |
| mitecloud | 螨群 | 20 | 1.5 / 0.5 | 0.4 | 3 / 3 | 0.6 | — | swarm | 8 | 钻进衣物：20s 瘙痒（理智 -1.2/s、生命 -0.15/s）；入水或被泼水即散；火焰驱散 |
| runenest | 符文蛛巢区 | — | — | — | — | 危险区 6.5（+2 缓冲） | — | 环境 | 每 chunk 3.5% | 洞角厚网、3 个可拆人形茧（尸体掉落表）、巢区 3 张减速网、发光蒙面教会符文；守巢：1–2 只符文强化变种（极巨蛛只住余量 ≥3.2 的巢）+ 2 只织网蛛 + 1 群带母蛛的幼蛛潮 |

全局常量在 `arachnidAI.ts` 的 `ARACHNID` 表里（伏击距离 4.5、跳扑 2.8–5.2m、喷酸 2–4.5m / 35°、网缠 3s × 移速 0.12、蜱 1 血/s × 20s 吸饱、不死蛛 4s 复苏 30% 血 / 处决 ≥15 / 重击 ≥25 直接杀死、再生 3 血/s、群体近战系数 0.12（螨 0.25）且最低保留 25%、螨瘙痒 20s、打火机驱赶 2.2m、岸边放弃 12s 后 20s 内不再理会水里的玩家、远处降频 28m）。

## 机制要点
- **AI 状态机**（`e.ar.mode`）：wander / idle / ambush / investigate / chase / attack / rear / jump / spray / spin / flee / recoil / shore / flail / latched / dormant / revive / regen / sated。AI 只写片段名 `ar.clip` 与片段时间 `ar.clipT`、实际地面速度 `ar.speed`，渲染层据此采样（walk/run 按速度调步幅，脚底锁定）。命中时刻全部取阶段 2 的常量（LUNGE 0.40、STING 0.42、PINCH 0.30、LATCH 0.45、JUMP 0.38/0.78、SPRAY_PUFFS）。
- **水体甩脱**：L8 本身有水——出生点的地下湖（深水，`liquid=1`，最深约 5m）和各洞系的浅溪（`liquid=2`），所以没有新增水池。玩家进入深水（`eng.inLiquid===1`）后，不会游泳的 15 个变种进入 `shore`：追到水线停下，沿岸踱步，12s 后放弃；水蛛（游泳，在水里 2.8m/s，跟着玩家下潜，片段 swim/dive）和无氧蛛（沿湖底走）照追不误。不会游泳的个体掉进深水（跳扑落点、被打落）播 `flail` 往岸上划并溺水掉血；幼蛛潮 / 螨群入深水即散，螨群碰到浅溪也散。
- **蛛网**：织网蛛脱战时在家附近找一段余量 0.8–2.6m 的通道，走过去播 `web_spin` 2.4s 织网（网横在通道上，最多 2 张，冷却 22s）；吐丝时渲染层用 `arachnidEmitter('spinner')` 画一根丝。玩家撞进网（0.75m）被缠 3s，移速 ×0.12，有移动输入算挣扎（消耗 ×1.9），挣脱后网被扯断；撞网会惊动网主和 10m 内的织网蛛。打火机靠近、汽油罐爆炸会烧掉网。
- **吸附蜱**：咬住后挂在玩家右小腿前侧（不参与实体推挤），每秒吸 1 血、`engorge` 线性膨胀（feed 片段按膨胀度采样）。交互键拔掉（撕掉 2 血）、近战打一下就拍下来，约 20s 吸饱后自己掉落（sated，不再攻击）。
- **不死蛛**：第一次致死（且不是火、单次 <25）时翻倒假死（death 片段停在末帧，符文内核闪烁）；假死期间轻击无效，≥15 的重击或火焰处决；4s 后 revive 2.8s，以 30% 血复活、速度 ×0.7（跛行 walk 片段本身就是缺腿步态）；复活只有一次。
- **再生蛛**：生成时新肢是苍白短肢（regrow=1），脱战时播 regen 片段长到 `ARACHNID_REGROWN`，之后所有片段都传 `opts.regrow`；单次受击 ≥8 视为断肢，退回短肢再长一次。被火烧后 6s 不回血。
- **火**：汽油罐（`explode`）对蛛形纲走 `arachnidFireHit`：抗火蛛完全免疫；群体一次烧散；其余正常吃火伤并标记「火焰击杀」（不死蛛直接死）。打火机（副手装备）让抗火蛛以外的个体在 2.2m 外畏缩退开。
- **旧食草被动型**：保留为行为标志 `herbivore`（任意变种都可挂）：不主动攻击，被打后防卫 8s 再平息；旧数据里的 `arachnidMorph`（spider/scorpion/tick/mite）由 `legacyArachnidKind` 映射到新变种，旧生成调用和旧存档都能用。
- **生成**：只在 L8。罗特尼斯 / 新莫维勒 / 巨臂林地的旧蛛形纲生成保留（按旧外形映射），另外 `arachnidL8Chunk` 在每个 chunk 按洞系概率（8%–30%）补一群野外个体（按 `ARACHNID_STATS.weight × ECO_MUL` 加权，水蛛只在湖附近常见）；符文变种野外权重 ≤1，主要出现在蛛巢。钩子用独立哈希 RNG，不消耗 `genL8ChunkRaw` 的 rng，接入前后其它生成内容不变。
- **性能**：28m 外的个体约每 0.25s 才步进一次；渲染层 >18m 隔帧、>32m 每 4 帧才采样一次姿态；幼蛛潮 / 螨群是 arachnidMesh 的 InstancedMesh（游戏内把个体放大：螨 ×2.6、幼蛛 ×1.5，团的范围不变）；点光源只给 14m 内最近的 2 只符文个体 + 18m 内最近的 1 个蛛巢，走渲染器自己的 `portableLights` 排序与上限。

## 公共查询（给微光向导等系统）
`engine/arachnidAI.ts` 导出（坐标都是窗口坐标，`eng` 省略时用最近一帧的引擎）：
- `isArachnidDangerZone(pos, eng?)`：是否在任一已加载蛛巢的危险区内（半径 6.5 + 2m 缓冲）。
- `arachnidDangerZones(eng?)`：已加载蛛巢的巢心与半径。
- `getArachnidsNear(pos, r, eng?)`：r 内存活的蛛形纲（变种、距离、是否敌对、是否符文），按距离排序。
- `arachnidWebs(eng)`：当前生效的全部网（世界坐标）。
- 其它：`ARACHNID_STATS`、`arachnidLosesTargetInWater(kind)`、`arachnidSprayHits`（酸雾锥形判定）、`arachnidHudState`、`devGotoArachnidNest`。

## 共享文件里的接入点（都带 `// [L8-arachnid]`）
| 文件 | 行 | 内容 |
|---|---|---|
| `engine/entityAI.ts` | 25 | import |
| | 85 | `noiseEvent`：蛛形纲走 `arachnidHear`（盲眼洞蛛只听震动，蹲走半径 ≤1 听不见） |
| | 222 | `updateEntities` 帧首 `beginArachnidFrame`（玩家状态效果、蛛巢登记、网） |
| | 398 | 实体分派 `updateArachnid` |
| | 694 | 实体-玩家推挤分离：跳过吸附中的蜱 |
| `engine/combat.ts` | 7 | import |
| | 151 | `killCheck` 首行 `arachnidHurt`（群体减伤、断肢、不死蛛假死/处决、拍掉蜱） |
| | 549 | 滋水枪：`arachnidSquirted`（螨群被泼散） |
| | 622 / 628 | 汽油罐：`arachnidExplosion` 烧网；循环里 `arachnidFireHit` |
| `engine/movement.ts` | 27 / 143 | import；移速 × `arachnidMoveMul`（被网缠住） |
| `engine/interact.ts` | 26 / 787 | import；`doInteract` 首行 `arachnidInteract`（拔蜱、拆茧） |
| `entities/types.ts` | 13 / 89–91 / 136 | 子变种 id 模板类型；`arachnidVariant / arachnidNest / arachnidMother`；`Entity.ar` |
| `entities/forms.ts` | 4 / 53 | 蛛形纲子变种改为 `ARACHNID_FORM_ROWS`（17 变种 + 食草型） |
| `world/infiniteL8.ts` | 12 / 639 | import；`arachnidL8Chunk(...)` 补野外与守巢种群 |
| `world/infiniteRegistry.ts` | 46 | raw 实体字段 `arachnidVariant / arachnidNest / arachnidMother` |
| `world/infinite.ts` | 275 | instantiate 带入上述三个字段 |
| `renderer/entitiesMesh.ts` | 33 / 55–56 / 134 / 1071 | import；`EntityMeshOpts` 两个字段；`buildArachnidEntityMesh` 提前返回；旧「只换皮」case 移除 |
| `renderer/renderer.ts` | 13–14 | import |
| | 3747 | eOpts 带变种与母蛛 |
| | 3880 | 不叠加通用行走颠簸 |
| | 4145 | 旧腿摆动移除 |
| | 4257 | 每帧 `animateArachnidEntity`（含 death 片段） |
| | 4346 | 死亡分支 `arachnidDeathPose` |
| | 4362 | `updateArachnidWorldView`（蛛巢/茧/网/酸雾/吐丝） |
| | 1533 | `portableLights` 追加 `arachnidLights(engine)`（与微光向导同一行） |
| `renderer/entityArchiveModel.ts` | 23 | 图鉴模型带变种 |
| `components/HUD.tsx` | 43 / 798 | import；`<ArachnidHud engine={engine} />` |
| `package.json` | — | `check:arachnid`、`verify:arachnid-ingame` |

行号是本阶段结束时的位置，其他代理并行修改后会有偏移，以注释为准。

## 验收
- `npm run check:arachnid`：66/66，真实 Engine + 真实 L8 生成 + 真实 step 循环。覆盖：每个变种的特殊能力（狼蛛伏击+轻毒、织网蛛织网、跳蛛跳扑根位移与总位移、盲眼洞蛛蹲走躲开、幼蛛潮打不完/火驱散、长脚盲蛛逃跑、水蛛/无氧蛛下水追击、极巨蛛威吓/重伤/窄道过不去、寡妇毒叠层、再生回血/断肢再生、不死蛛复活一次/处决/火杀、抗火免疫/不怕打火机、洞蝎尾刺毒/螯夹、鞭蝎锥形酸雾、吸附蜱吸附/吸血膨胀/拔除/拍下/吸饱脱落、螨群瘙痒/入水冲掉/泼水散开）；水体甩脱规则（15 种甩得掉、2 种甩不掉、岸边徘徊后放弃、落水 flail）；蛛网减速与挣脱；蛛巢稀有度、守巢种群、危险区查询、`getArachnidsNear`、拆茧掉落；只在 L8 生成；野外符文个体稀有；远处降频。结果同时写入 `reports/arachnid/mechanics-check.txt`。
- `npm run verify:arachnid-ingame`：截图在 `reports/arachnid-ingame/`（狼蛛追击、扑咬、极巨蛛威吓、扑咬、幼蛛潮、螨群、符文蛛巢区（正面/守卫/侧面/巢区网）、玩家跳水后蜘蛛停在岸边、水蛛下水追击），运行记录 `runtime.json`。跳水两张（11/12）：手电系数 ×1.2；用 `AR.holdZ` 在每次 step 后把玩家脚底钉在 z=-1.38 / -1.25（眼高约 0.18 / 0.3m，贴着水线）平视岸边，画面下半是水面——不用蹲，蹲在水里是下潜，眼高会随时间沉到水下；从蛛巢传送到湖边后先等 `isNearWorldReady`（最多 300s），否则全量跑时湖边地形还没建好、画面一片黑。2026-10-22 全量跑时它在 300s 内一直没变成 true（`runtime.json` 的 `waterWorldReady=false`），但等完之后湖边地形已经画出来了；原因没有深查。
- `node_modules/.bin/tsc --noEmit -p tsconfig.app.json`：0 错误。
