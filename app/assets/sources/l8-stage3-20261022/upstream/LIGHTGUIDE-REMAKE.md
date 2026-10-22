# 微光向导（Entity 35）重制

参考：中文维基 Entity 35「Light Guides」与 ZAN 提供的附图（夜空里两颗带柔光晕的小光点）。附图只作造型参考，没有使用任何图像资源；模型和贴图都是运行时程序化生成。

ZAN 确认的机制（2026-10-21）：纯光球、可穿墙、带路先找补给再找出口、遇险变粉白警示、被打就逃并扣理智、氙弹珠守巢沿用旧设定、只在 L8 稀有生成。

工作副本 /workspace/work/l8-wt（与迷彩爬行者、受眷鸟、蛛形纲三个重制并行）。不改存档格式和联机协议。

## 第 1 阶段：建模（`renderer/lightguideMesh.ts`）
光核 + 内外两层加色光晕 + 色散环，四种情绪色 idle 暖白 / guide 青白 / warn 粉白 / nest 淡金。不写深度，可穿墙。

## 第 2 阶段：动画（`renderer/lightguideAnim.ts`）
7 个片段：wander / beckon / warn / color_shift / flee / nest_orbit / phase。位移写在子节点上，beckon 每循环前移 0.9m（游戏层同步前移锚点）。

## 第 3 阶段：机制（`engine/lightguideAI.ts`、`renderer/lightguideRender.ts`）
所有数值都在 `LIGHTGUIDE` 常量表里。AI 模块不导入 three、音频和渲染层（区块生成的 worker 也会打包它）；与动画片段共用的常量在 `LG_CLIP` 里重述，`check:lightguide` 会校验两边一致。

### 状态
| 模式 | 情绪色 | 片段 | 说明 |
|---|---|---|---|
| idle | 暖白 | wander | 绕「家」4m 内闲逛，0.5m/s，离地 1.3m |
| approach | 青白 | wander | 玩家进入 8m 且有视线（或 4m 内）：飞到离玩家 2.6m 处，1.9m/s；1s 后（最长 4s）挑目标 |
| guide | 青白 | beckon / wander | 沿寻路路径带路，见下 |
| arrive | 青白 | nest_orbit（半径 0.45m） | 在目标上方 1.1m 绕圈；玩家进入 3.5m 后再绕 5s；最长等 25s |
| leave | 暖白（变暗） | wander | 背离玩家飞 13m，2.2m/s；之后 30s 内不主动找玩家，同一目标 240s 内不重复带 |
| warn | 粉白 | warn | 原地停住，快速颤动，朝向危险；危险消失 1.2s 后回到之前的模式 |
| escort | 跟随领头者 | wander | 同组其余个体落在领头者身后 0.9m 起，左右错开 |
| nest | 淡金 | nest_orbit | 围着氙弹珠低空绕（离地 0.32m，半径 0.30m + 每只 0.05m） |
| flee | 当前色 | flee | 受击：1.5s 内骤暗、拉远、消失，之后实体移除 |
| avoid | 暖白（亮度 ×0.6） | wander | 冷却期内玩家在 12m 内：背离玩家，2.2m/s |

### 带路
- 目标选择（`pickLightguideTarget`）：玩家 60m 内最近的补给优先，补给按直线距离排序后逐个寻路，路程不超过 96m（60×1.6）的第一个就是目标。没有补给就选最近的出口。
  - 补给物品：`use` 为 eat / heal / cure / sanity / sanityeat / bigsanity，或 `value3 > 0` 的饮品。
  - 补给容器：crate、megcrate、campstall、barrel、fridge、corpse、bonepile（带 loot）、suitcase、locker，未搜过（`looted` 和 `data.searched` 都没有）。
  - 出口：窗口里已加载的出口（第九大道洞口、罗特尼斯通风口）直接寻路；都没加载时沿第九大道路标链走：先到最近的路标，玩家走到路标 5m 内就换下一块（`data.nextX/nextY`）。窗口里连路标都没有时，朝区域出口锚点（`regionExitPos`）贪心前进。
- 寻路（`findLightguidePath`）：窗口格子 BFS（8 邻接，斜走不切角，最多扩展 26000 格），可走格 = 非岩壁、无实心结构、非深水湖；结果做直线拉直。目标不可达时，出口路线取「离目标最近的已探索格」。
- 距离保持（`lightguideLeadStep`，沿路径的弧长）：
  - 领先不足 3m：追到玩家前方 4m，速度 max(1.6, 玩家速度+0.8)，上限 3.4m/s；
  - 领先 3–5m：beckon 等待。beckon 每个 3.6s 循环回绕时，锚点沿路径前移 0.9m，与片段的根位移同步（视觉连续）；再前移会超过 5.4m 时，这一轮改成原地悬停；
  - 领先超过 5m（玩家停下或落后）：以 1.5m/s 回头，停在玩家前方 4m。
- 每 1.5s 从玩家当前位置重新寻路；玩家偏离路径超过 4m 立即重算。补给被拿走或容器被搜过，就重新挑目标。
- 玩家离向导超过 16m 持续 10s：放弃带路。
- 全局同时只有一组在带路（领头者 id 记在 `lightguideWorld`）。

### 危险
- 每 0.25s 扫描一次（只在 approach / guide / arrive / escort / warn，或玩家在 8m 内的 idle）。
- 危险实体（`isLightguideDanger`）：非被动、伤害大于 0 的实体，或被激怒的被动实体；排除同类、旱虾、Ferren、食草蛛形纲。离玩家或向导 15m 内就算。其他实体的公共查询接口还没有，目前按类型和定义判断。
- 危险区域：结构种类 runenest / spidernest / webnest / mothnest，离向导或前方 8m 路径上的采样点 7m 内。
- 首次警示提示：「微光骤然褪成粉白色……」，8s 内不重复。

### 受击
- `combat.killCheck` 开头调用 `lightguideHit`：任何命中都不会打死它（血量复原），直接进入 flee。
- 玩家理智 -10（发 sanityhit 事件）；全局冷却 120s，冷却期内所有向导都回避玩家、不带路。
- 20m 内其他向导（守巢的除外）立即转为 avoid。
- 受击粒子改为半透明碎光（`bloodKind` 对 lightguide 返回 true），不溅红血。

### 氙弹珠与守巢
- 投出的弹珠（`combat` 的 lure 分支调用 `lightguideLure`）：16m 内全部向导过去守巢，包括正在带路的；20s 内玩家在旁也不离巢。
- 地上自然散落的弹珠：闲逛的向导发现 7m 内有弹珠就守着。玩家靠近时，巢里编号最小的那只出来带路，其余继续守。
- 弹珠被捡走（0.8m 内没有弹珠）：散开回到 idle。

### 生成
- 只在 L8 的多维之路区块（沿用原来的 `placeEntity('lightguide', 2–4)`，不改随机序列）。`groupLightguideSpawns` 用区块哈希整理：25% 区块没有，其余 45% 单只、33% 两只、22% 三只，组员挪到领头者 0.8–1.6m 内的可站洞底。
- 运行时首帧把 3m 内的向导并成一组（组 id = 组内最小 id）。
- 抽样（种子 20261022，29×29 区块）：150 个多维之路区块中 38 个没有、45 个单只、67 个 2–3 只，平均每区块 0.23 只，其余生态带 0 只。其他层的区块生成里也没有向导。

### 外观与灯光
- 直径按实体 id 确定性取 5–15cm（`lightguideSize`），AI 与建模共用。
- 不挂自带点光源：`lightguideLights` 取离玩家最近、28m 内的 3 只（`LIGHTGUIDE_LIGHT_CAP`），折算成 LightSource 交给渲染器的灯光池（和荧光棒同一通道），灯数变化不会触发着色器重编译。1.2m 内挤在一起的几只（守巢、随行）只算一盏，避免叠光把地面烧白、把光球本身淹没。
- 光的颜色跟随显示色；半径 1.7m + 尺寸系数×0.8m（灯光池里实际照射距离约为半径×2.6）；强度系数 0.17×尺寸系数×当前亮度（尺寸系数 = 0.65 + (直径−5cm)×6，即 0.65–1.25）；光源至少离地 0.6m。亮度随片段变化：穿墙时淡出，逃离时骤暗。
- 渲染（`animateLightguideEntity`）：按 `e.lg.clip / clipT / mood` 采样阶段 2 的片段；切换片段时做 0.25s 姿态混合；颜色再做时间常数 0.15s 的指数平滑；在岩体里时叠加 phase 片段的可见度和色散环。
- 飞行高度由 AI 自己控制（离地 1.3–1.45m，离洞顶至少 0.25m，升降 1.6m/s），不走通用的 `updateFlyingAltitude`。

## 接入点（共享文件里的钩子都用 `// [L8-lightguide]` 标出）
- `entities/types.ts`：`Entity.lg?: LightguideState`。
- `engine/entityAI.ts`：导入；实体循环前 `beginLightguideFrame(eng, dt)`；循环内（在水生/飞行高度更新之前）`if (def.type === 'lightguide') { updateLightguide(eng, e, dt, d); continue }`。
- `engine/combat.ts`：导入；`killCheck` 开头 `if (lightguideHit(eng, e)) return`；投掷 lure 分支改为 `const n = lightguideLure(eng, x, y)`（替换旧的「全图向导 investigate」循环）；`bloodKind` 对 lightguide 返回半透明。
- `renderer/entitiesMesh.ts`：导入；函数开头 `if (type === 'lightguide') return buildLightguideEntityMesh(opts?.seed ?? 0)`；旧的宝石星星网格分支已删除，换成一行注释。
- `renderer/renderer.ts`：导入；`eOpts` 条件加 `lightguide`（让 seed = 实体 id）；实体动画处 `if (et === 'lightguide' && !e.dead) animateLightguideEntity(grp, e, dt)`；灯光池 `portableLights = [...glowstickLights(engine), ...lightguideLights(engine)]`。
- `world/infiniteL8.ts`：导入；多维之路分支在 `placeEntity('lightguide', …)` 前后各加一行（记录起点、`groupLightguideSpawns`）。
- `package.json`：`check:lightguide`。

## 验收
- `npm run check:lightguide` 67/67（结果另存 `reports/lightguide/mechanics-check.txt`）。纯函数部分：目标选择、补给判定、带路距离保持、情绪色、危险判定。真实 Engine + 真实 L8 生成 + 真实 step 循环：靠近变色、补给优先、路径不穿墙、站着不动时保持在前方 3.9–4.8m、beckon 回绕前移 0.9m、跟随时始终在前方、到达绕圈后离开、没有补给时去第九大道洞口、遇敌警示（渲染色确实变粉白）后恢复、符文蛛巢区域警示、受击逃离消失、理智 -10、冷却 120s 内回避、冷却结束恢复、投弹珠三只守巢（轨道编号 0/1/2）、弹珠被捡走散开、自然巢派一只出来带路、组内随行、灯光上限 3、挤在一起的 3 只合并成 1 盏光、网格预热中不发光、穿墙 phase、只在 L8 生成、生成确定性。
- 游戏内截图：`node scripts/verify-lightguide-ingame.mjs`（vite 3453 / Chromium 调试端口 9453），截图在 `reports/lightguide-ingame/`。截图前等网格出模型预热队列（见下节）。

## 阶段 3 收尾：近处光球「只有地面光、看不见本体」（2026-10-22）
- 现象：上一轮游戏内截图 01、05、07、08、09 里光球本体不显示，地面上却有它的光；只有 10 号（逃离）能看到。
- 实机调试（无头 Chromium 里直接读 `__renderer.entityMeshes`）：新生成的向导组 `visible=false`，子节点的位置、缩放（外晕 0.35m）、不透明度、加色混合、`depthTest=false`、renderOrder 都正常。隐藏它的是 `renderer.updateEntities` 的模型预热：网格进 `ModelWarmupQueue` 后（着色器编译 → 贴图 → 缓冲上传，每帧推进一步），完成前每帧强制 `grp.visible=false`，并给实体置 `presentationPending`。单只向导要 5–7 帧、三只同时生成要约 22 帧（队列轮转）。
- 根因：无头 swiftshader 一帧约 1.7s，截图脚本生成向导后只留 1.5s 墙钟就截图（模拟用同步 `e.step` 推进，不产生渲染帧），预热还没走完，光球自然是隐藏的；10 号之前已经过了足够多帧，所以能看到。光却照常亮，是因为 `lightguideLights` 走的是全局灯光池，不看网格是否已显示。正常帧率下 5–7 帧不到 0.1s，玩家基本察觉不到，但同样会出现一瞬间「有光没球」。
- 改动：
  - `renderer/lightguideRender.ts`：`lightguideLights` 跳过 `presentationPending` 的向导——网格可见之前不往灯光池送光，光和光球本体同时出现。
  - `scripts/check-lightguide.ts`：加一条断言（预热中不发光）。
  - `scripts/verify-lightguide-ingame.mjs`：生成向导后用 `LG.shown(ids)` 按渲染帧等到网格出预热队列、组可见再截图（每个场景等了几帧记在 `runtime.json` 的 `warmFrames`）；每张截图同时记录 `visibility`（组是否可见、光核屏幕坐标、各层不透明度）。
- 结果：重跑后 01–09 的光球本体都在画面中心附近（`onScreen=true`，光核不透明度 1），带路青白、警示粉白、守巢淡金（三只绕珠，近看能分出两三颗）、逃离时骤暗（光核 0.22），都没有过曝。

## 已知不足
- 寻路只在当前窗口（5×5 区块，160m 见方）内做；去远处出口时靠路标链或贪心朝锚点前进，洞穴死胡同里可能要多绕几次重算。
- 带路沿二维格子走，没有考虑攀爬高差和必须匍匐的低矮洞段；向导本身贴着洞顶以下 0.25m 飞。
- 危险判定按实体类型和定义；迷彩爬行者、蛛形纲重制完成后若提供公共查询接口（例如「是否潜伏 / 是否敌对」），应替换 `isLightguideDanger`。危险区域只认结构种类名字（runenest 等），具体名字以蛛形纲那边最终注册的为准。
- 被动的普通近战命中仍会经过通用的击退、`provoked`、0.35s 僵直赋值，向导 AI 都忽略了这些字段，没有删。
- 联机：向导 AI 只在房主本机运行，`e.lg` 不同步；客人端看到的是通用提线木偶插值，没有颜色和片段。
- 冷却和已展示目标表存在内存里（按 Engine），不入存档。
