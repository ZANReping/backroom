# 受眷鸟（Entity 37）重制

参考：中文维基 Entity 37「受眷鸟」与 ZAN 提供的附图。附图只作造型参考，模型、贴图都是运行时程序化生成。

- 第 1 阶段（建模）：`renderer/curabiturMesh.ts`。雌雄二型、发光浮囊（胶核 + 凝块）、蓬羽、水平钩喙、诱捕舌光、短前肢与猛禽腿；附带受眷胶罐、涂胶壳 `gelCoat`、发光孢子、孢子腐液滩。预览 `proto-l8fauna.html`。
- 第 2 阶段（动画）：`renderer/curabiturAnim.ts`。9 个片段：float_idle / drift / lure / strike / eat / spore_release（仅雄性）/ flee / hit / death。
- 第 3 阶段（机制，本文）：AI、三种新物品、L8 生成、验收。

ZAN 确认的设定（2026-10-22）：雌雄都悬浮在洞顶附近；雌性放舌光诱捕雄性死亡飞蛾，雄性周期性散播孢子；避开人类，靠近约 4m 或受击时上升逃离，死后坠落并掉落受眷胶；受眷胶是光源，可涂在近战武器上，代价是吸引雄性飞蛾；孢子约 80 小时后腐解成驱蛾腐液，也可以直接捣碎；星群极稀有；只在 L8 洞顶较高处生成。

## 文件

| 文件 | 内容 |
|---|---|
| `engine/curabiturTuning.ts` | 全部数值（下表），纯常量，AI、生成 worker、物品、渲染、验收共用 |
| `engine/curabiturAI.ts` | 受眷鸟 AI、实体循环后的世界步进（飞蛾诱引/驱避、胶燃烧、孢子下落与腐解、腐液滩）、物品使用、死亡掉落、光源清单 |
| `world/curabiturSpawn.ts` | L8 区块生成后处理：挪到高洞顶、栖点受眷胶、星群（只用 h32 哈希，不消耗生成器 rng） |
| `content/curabiturItems.ts` | 三种新物品定义 |
| `renderer/curabiturRender.ts` | 实体外壳 + 懒建模型、片段驱动与混合、死亡坠落、光源、物品模型、腐液滩/下落孢子/散播粒子、第一人称涂层 |
| `scripts/check-curabitur.ts` | 无头机制验收（`npm run check:curabitur`） |
| `scripts/verify-curabitur-ingame.mjs` | 游戏内 Chromium 截图验收 |

## 时间折算

游戏没有昼夜时钟。约定 **1 游戏小时 = 30 秒实时**（`GAME_HOUR_S`）。

- 受眷胶 12 小时 = 360 秒（6 分钟）。
- 孢子腐解 80 小时：再压缩 1/6，等于 400 秒（约 6.7 分钟）。不压缩要 40 分钟，一局里几乎看不到。

## 数值表

### 受眷鸟
| 项 | 值 |
|---|---|
| 生命 / 速度 | 42 / 3.8（沿用原定义；只有逃离用全速，漫游 ×0.22） |
| 悬浮高度 | 身体中心在洞顶下 0.95m × 个体缩放；离地至少 1.9m。垂直速度 0.9 m/s |
| 雄性体型 | 0.74 × 实例缩放（与模型一致） |
| 性别 | 出生点世界坐标哈希，约一半一半；同一位置重载结果不变 |
| 漫游 | 栖点 3.2m 内；到点后悬停 5–9 秒再换点 |
| 避人 | 玩家水平距离 < 4m 时 flee；< 7m 时缓慢后退并面朝玩家 |
| 逃离 | 水平逃开 9m，速度 ×1.0，最长 4.5s；上升到洞顶下 0.62m（垂直 2.2 m/s）。逃完把新位置当栖点 |
| 受击 | 血量下降（任何来源）→ hit 片段 0.5s → flee；不反击、不进入通用追击 |
| 死亡 | 从死亡高度坠到地面（death 片段 1.55s 落地），尸体停留 9 秒；必掉受眷胶 ×1（未开封） |

### 雌性诱捕
| 项 | 值 |
|---|---|
| 舌光吸引半径 | 7.5m（三维距离，需视线），只吸引雄性死亡飞蛾，每只雌性同时最多 3 只 |
| 舌尖位置 | 身体中心前 0.275m、下 0.335m（× 缩放） |
| 飞蛾行为 | 绕舌尖盘旋，半径从 1.1m 以 0.22 m/s 收紧；高度以 1.7 m/s 爬到舌尖（覆盖通用低空巡航） |
| strike 触发 | 舌光放下 1.2s 之后，猎物进入舌尖 0.40m（REACH 0.26 + 飞蛾半身 0.14） |
| 咬合 | strike 第 0.38s（`CURABITUR_STRIKE_BITE_T`）。猎物仍在 0.56m 内则整只移除（不留尸体、不掉落），否则扑空回到 lure |
| 吞食 | eat 4.8s（1.6s × 3） |
| 冷却 | 14 秒；一次诱捕最长 45 秒 |

### 雄性散孢
| 项 | 值 |
|---|---|
| 间隔 | 75 ± 30 秒（首轮随机） |
| 可拾取孢子 | 每次 2 颗，按 SPORE_TIMING 在对应孢子囊脱落时放出；以 0.45 m/s 下落，水平漂移 ≤ 0.12 m/s，落地变成「受眷孢子」 |
| 视觉 | 另有 26 颗纯视觉粒子（`sampleCurabiturSpores` 轨迹），约 7 秒后淡出 |
| 上限 | 8m 内已有 8 颗地面孢子就不再新增 |

### 新物品
| id | 名称 | 堆叠 | 稀有度 | 效果 |
|---|---|---|---|---|
| `curabiturgel` | 受眷胶 | 3 | 稀有 | 手持：黄绿光 r 2.3m、强度 0.32（荧光棒 1.8m / 0.25），12 小时（360s）耗尽一罐。右键：快捷栏有近战武器就涂上去（6 小时 = 180s，选中该武器时发光 r 1.7m / 0.22，第一人称有 `gelCoat` 发光壳）；没有武器就开罐放在脚边（剩余时长随罐子，耗尽后消失）。未开封的罐子（尸体掉落、栖点拾得、直接 Q 丢下）只发微光 r 1.0m、不计时。**代价**：手持、选中涂层武器、放置的开封罐会吸引 5.5m 内的雄性死亡飞蛾绕光盘旋 |
| `curabiturspore` | 受眷孢子 | 6 | 少见 | 放在地上 400s 后腐解成腐液滩；右键捣碎 → 1 份驱蛾剂 |
| `curabiturrepellent` | 孢子驱蛾剂 | 3 | 少见 | 右键泼在脚下 → 腐液滩，6m 内的死亡飞蛾（成虫各形态）回避，持续 6 小时（180s），最后 20% 渐隐；带在身上 2m 驱避；直接丢在地上（封口瓶）2m 驱避 |

腐液滩用 `buildSporeRotPuddle`（半径 0.38m）。驱避的做法：雄性改成 investigate 朝反方向飞 3m；巢内雌性和禁卫走自己的 AI，所以直接 `stepEntity` 推开。

### 生成
| 项 | 值 |
|---|---|
| 层级 | 只有 L8（生成表与 `genL8ChunkRaw`），其他层不含受眷鸟 |
| 普通生成 | 沿用新莫维勒原分槽：每座 3×3 地质带 2 个捕食点，各 1–2 只 + 4–6 只飞蛾 |
| 高洞顶 | 生成后挪到附近洞顶-地面 ≥ 4.4m、离岩壁 ≥ 1.3m、非湖面的位置（方环搜索 14 瓦片），找不到就删掉 |
| 栖点受眷胶 | 每个生成组 12% 在栖点下放一罐（未开封） |
| 星群 | 每个 L8 区块 0.5%（出生湖厅 3×3 除外），12–16 只，向日葵排布在 3.2m 内，要求洞顶 ≥ 5.2m |
| 运行时星群 | 6m 内同类 ≥ 6 只 → 共享栖点（中心），只在栖点 0.6m 内小幅挪动，空闲时一起放 lure 片段（舌光连成一片） |

### 性能
- 模型不挂 PointLight（数量变化会让 three 重编所有材质），灯光交给渲染器灯光池：全场只给离玩家最近的 3 只受眷鸟各一盏（雌 r 4.2 / 雄 r 3.2）。
- 16m 内满帧动画，16–34m 每 0.1 秒采样一次，34m 外停止动画。
- 每只个体单独建模型（雄性孢子囊几何体会被动画改写，不能共享），模型不投射阴影。

## 接入点（共享文件，全部标 `// [L8-curabitur]`）
| 文件 | 钩子 |
|---|---|
| `engine/entityAI.ts` | import；`generic:` 块第一行 `if (def.type === 'curabitur') { updateCurabitur(...); break generic }`（旧的 avoidsHumans + hunts 通用逻辑不再作用于受眷鸟）；实体循环结束后 `curabiturPostStep(eng, dt)` |
| `engine/combat.ts` | import；`killCheck` 中 `e.dead = true` 之后 `curabiturKilled(eng, e)` |
| `engine/inventory.ts` | import；`finishUseSlot` 开头 `if (curabiturUseItem(eng, where, i)) return` |
| `content/items.ts` | import；`ITEMS` 里 `...CURABITUR_ITEMS` |
| `renderer/entitiesMesh.ts` | import；`buildEntityMesh` 中 `if (type === 'curabitur') return buildCurabiturEntityMesh()`（旧的 curabitur 网格分支不再走到） |
| `renderer/itemsMesh.ts` | import；`buildItemMesh` 中 `else if (isCurabiturItem(type)) grp.add(buildCurabiturItemMesh(type))` |
| `renderer/renderer.ts` | import；灯光池 `portableLights.push(...curabiturLights(engine))`；`updateViewmodel` 中 `curabiturCoatViewmodel(this.vmItem, engine)`；实体循环每只实体末尾（通用死亡动画之后）`animateCurabiturEntity(...)`；实体循环后 `updateCurabiturView(...)` |
| `world/infiniteL8.ts` | import；`genL8ChunkRaw` 返回前 `curabiturChunkPass(...)` |
| `package.json` | `check:curabitur` |

## 验收
- `npm run check:curabitur`：53/53，真实 Engine + 真实 L8 生成 + 真实 step 循环。结果写入 `reports/curabitur/mechanics-check.txt`。覆盖：模型接入与性别重建、洞顶悬浮、诱捕（飞蛾升到舌尖）、strike 触发距离、BITE_T 时刻移除飞蛾、eat 与冷却、雌蛾不受诱、4m 避人与 4.6m 不逃、flee 远离并上升、受击 hit→flee 且不反击、死亡坠落与掉胶、尸体停留后移除、散孢与落地、400s 腐解成腐液、腐液滩时长、6m 驱蛾半径与推开距离、携带 2m 驱避、捣碎、手持光源参数与 360s 耗尽、吸蛾半径、放置开封罐与到期、未开封罐不计时、涂抹武器发光与吸蛾、星群概率（20 万区块 ≈0.49%）、真实星群区块、运行时星群与灯光上限、只在 L8 生成、只在高洞顶。
- `node scripts/verify-curabitur-ingame.mjs`：真实 App 读档进入 L8，生成雌雄个体与雄性死亡飞蛾，截图到 `reports/curabitur-ingame/`（lure / strike / eat / swarm / gel-held / gel-placed / gel-coat / spore-release / spores-ground / rot-puddle / death）。

## 已知不足
- 运行时状态（性别缓存、模式、开封胶的剩余时长、涂层、孢子腐解计时、腐液滩）不入存档、不进联机快照，与其他重制实体一致。读档后地上的开封罐会变成未开封（只发微光），孢子腐解计时从零开始。
- 驱蛾剂瓶可以反复捡起、丢下，地上的封口瓶没有寿命。
- 只有玩家击杀走 `killCheck` 才掉胶；被其他实体打死、开发者删除的个体不掉。
- 移动沿用直线 `stepEntity`，没有寻路；逃离时先试 5 个方向（正后方和左右 50°、92°），仍可能被洞壁挡住，挡住就换方向再逃。
- 被舌光吸住的飞蛾高度由本模块直接覆盖，水平仍走通用 investigate；飞蛾接近舌尖时偶尔会有一帧小幅抖动。
- 地上的孢子模型不随腐解进度变色（物品模型是静态的）。
- 截图走 swiftshader 的 CPU 渲染，没有在真机 GPU 上验证。
