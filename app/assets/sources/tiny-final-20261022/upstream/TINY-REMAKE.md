# 小小（Entity 720）+ 石卡祖笛 + L8 乐器洞重制

参照：中文维基 trimmed:entity-720（正文与附图）、Level 8 正文中石头乐器洞穴的叙事。

## 已定（ZAN，2026-10-22）
- 小小不可杀：所有伤害无效，攻击只会激怒它。台心通往 L9 的门只能用持续巨响把它逼开。
- 持续巨响由石卡祖笛提供。水下也能吹，但会耗氧。在洞穴里吹，声音从弹射点传出，用来引开实体。新增 L8 乐器洞地标。
- 鲨鱼皮只是固定外观。不做伪装机制，也不做全局的「被注意」值；小小仍然靠现有的听觉发现玩家。

## 阶段 1 建模
- `renderer/tinyMesh.ts`：约 2.44 m 的瘦长类人形，正面朝 +X，由刚性关节组构成。
  - 小腿末端收成刀刃状尖鳍，没有脚。
  - 胸口、大腿、小腿各有一列蓝色荧光点，跟着所在肢段一起动。
  - 脸是米黄色面具甲壳，分成两片，铰在两侧（`carL` / `carR`），张开后露出尖牙巨口（`mouth`）。
  - 披一张鲨鱼皮：头罩、上颚齿列、两侧鲨眼、鳃裂、下颚（`sharkJaw`），鲨身上有背鳍、两片胸鳍和尾鳍（`tail`）。
  - 长矛是深色细杆，矛头由巨兽的牙磨成。`aimSpear` 按模型空间方向反解矛的朝向。
  - `poseTiny` 提供 hold / raise / thrust 三种姿势和甲壳开合。
  - 共 48 个网格，约 1.17 万个三角形。
- `refinedItemMesh.ts` 中的 `stonekazoo` 重做：
  - 锥管有内壁，带石钟乳的生长纹。
  - 笛口是扁椭圆形，带一圈断茬，就是从钟乳石上断下来的断口。
  - 顶部有笛膜座，座口封着一片天然薄岩当笛膜；下侧挂着几粒小滴石。
- `renderer/stoneInstrumentsMesh.ts`：石头乐器，包括小提琴、吉他、长号、马桶、邦戈鼓、断口钟乳石；风铃的六根石管单独成组，便于摆动。
- 预览：`proto-tiny.html?mode=lineup|three|head|open|kazoo|cave`，截图脚本 `scripts/verify-tiny.mjs`。
- 旧版 entitiesMesh 中 `case 'tiny'` 已删除，改为调用 `buildTinyMesh()`；部件名保持兼容旧渲染层的泳姿和攻击代码，阶段 2 会替换。

## 阶段 2 动画（4197b48、e9031ab、6c07bd8）
- `renderer/tinyAnim.ts`：hover / cruise / sprint / perch / maw / attack / recoil 共 7 个片段；`renderer/tinyRender.ts` 的 `animateTinyEntity` 把实体状态映射成动画参数（泳速按实际位移估算）。
- 手臂穿模修复与 `npm run check:tiny-arms`（7 个片段手臂/长矛穿模全部为 0）。

## 阶段 3 机制
新逻辑全部在 `engine/tinyAI.ts`（小小 AI + 石卡祖笛 + 石风铃），数值集中在 `TINY` / `KAZOO` 两张常量表。运行时状态挂在 `Entity.tiny`，不入存档/联机。

### 小小的状态机
| 阶段 | 行为 | 出口 |
|---|---|---|
| perch 盘踞 | 守在门心上方（门面 +0.63m），转头盯着 14m 内的玩家 | 被吵 → glare；连吹满 4 声 → repel；激怒且玩家在 20m 内的水里 → hunt；激怒状态下安静待满 120s → 消气 |
| glare 低鸣 | 第一次被吵：转向声源，最多离门 3m，2.5s | → return |
| repel 被逼退 | 合死甲壳抱头（recoil），以 1.3× 泳速逃到离门 18m 外的水域，上浮 5m | 25s 后 → return（激怒且玩家还在水里 → hunt） |
| return 回门 | 0.8× 泳速游回门上 | 到门 → perch；激怒且玩家在 20m 内的水里 → hunt |
| hunt 追杀 | 交给 entityAI 通用追击/攻击（伤害 24） | 玩家离水或远于 45m 持续 6s → return；持续笛声 → repel |

### 数值表
| 项目 | 数值 | 位置 |
|---|---|---|
| 门被挡 | 小小离门心水平距离 ≤ 5m（`level.tinyBlocksLittleDoor`，未改） | TINY.doorR |
| 逼退阈值 | 声源在它 8m 内、6 秒滚动窗口里吹满 4 声 | repelR / repelWindow / repelBlows |
| 逼退时长 | 25s（逃离 18m；回程 0.8× 泳速约 6.5s，门实际可通行约 28s） | repelT / fleeDist |
| 吹一声 | 0.55s 使用动作（举到嘴边，anim `blow`），不消耗 | KAZOO.useT |
| 卡祖笛噪音 | 14m（sprint=true），对小小以外的实体是普通诱饵噪音 | KAZOO.noiseR |
| 水下耗氧 | 每声屏气 +5s（L7 上限 35s，潜水面罩 60s；满气最多 7 声 / 12 声） | KAZOO.o2Cost |
| 回声 | L8 有机洞穴：沿视线水平射线 22m 内碰到岩壁 → 噪音在命中点前 0.45m 触发；否则、或在开阔水面/其它层级 → 从玩家身上传出 | echoMax / echoBack |
| 恼怒来源 | 噪音半径 ≥ 8m 或奔跑类噪音、且在 38.4m 听觉内：快速游泳、投掷物落水（新增 L7 落水声 12m）、爆炸、破门撬锁 | hearR / loudR |
| 恼怒去抖 | 同一阵噪音 4s 内只记一次；安静 45s 减 1 | annoyGap / annoyDecay |
| 激怒 | 恼怒 2；或任何肢体接触（贴身 1m、近战、投掷物/爆炸打中）立刻激怒 | angerAt / contactR |
| 半途而废 | 连吹窗口过期时不足 4 声 → 记 1 次恼怒 | — |
| 对话里提门 | 第一次警告并记恼怒，第二次激怒 | tinyScorn |
| 追杀放弃 | 离水或 > 45m 持续 6s | huntLoseR / huntLoseT |
| 消气 | 回到门上安静 120s：激怒解除、恼怒清零，重新可对话 | forgiveT |
| 不可杀 | `combat.killCheck` 先过 `tinyKillGuard`：血量回满、不死、不掉落；近战命中走 `tinyStruck`：受惊 0.6s + 肢体接触激怒 | flinchT |
| 石风铃 | 带着石卡祖笛戳：90s，每 1.5s 在风铃处发一次 16m 噪音（不刷新玩家噪音计时） | chimeT / chimeEvery / chimeNoiseR |

### 设计理由：逼退和激怒是同一条「噪音」轴的两端
维基原文把两件事写在一起：小小「惧怕噪音」，想安全探索就「带上一个能长时间发出巨响的物品」，靠它「短暂制服它」；同时它对水面上的一举一动极其敏感，厌恶噪音。我把它理解成：**持续的巨响是它的弱点，断续的响动是挑衅**。
- 所以卡祖笛逼退本身不记恼怒——否则「用维基推荐的方法」反而会被惩罚，玩家会觉得被骗。
- 但卡祖笛也不是免费的：吹到一半停下（窗口里不足 4 声）就退化成一次断续噪音，记一次恼怒。玩家必须下定决心连吹，水下还得算好气（4 声 = 20s 屏气，几乎是 L7 上限的六成），这是这套机制的主要张力。
- 曾考虑「逼退和激怒是同一条恼怒曲线上的两个阈值（先逼退、吹过头就激怒）」，没用：那会让「多吹」成为惩罚，和维基「长时间发出巨响」直接冲突；而且玩家在门边很难判断离阈值还差多少。
- 第一次被普通噪音吵到时，小小只转头低鸣、离门不超过 3m，**不会离开门区**——否则扔一个订书机就能把门让出来，绕过了 ZAN 定的「门只能靠卡祖笛」。
- 追杀中的小小也能被逼退，对应维基「短暂制服它、借此离开水面」；逼退结束若玩家还在水里，它会接着追。
- 激怒不是永久的：回门安静 120s 后消气。旧版激怒是一次性永久的，L7 几乎处处是水，一旦激怒基本只剩死路。

### 听觉（整理自 entityAI）
- 旧版 entityAI.noiseEvent 里 tiny 的专用分支（借 `scrapeT` 当恼怒计数、第一次被吵会朝反方向蹿开 6 格）和通用分支里的 `hearing × 2.4` 都已移除，改为 `tinyAI.tinyHear`。
- 新增：L7 投掷物落进水里会发 12m 落水声（`combat.landProjectile`）。
- 卡祖笛广播时设标记，`tinyHear` 不把它当断续噪音；卡祖笛对小小的效果只走 `tinyKazoo`。

### 石卡祖笛
- `items.ts`：`use: 'kazoo'`，使用动作 0.55s / anim `blow`（`viewmodel.ts` 新增：横举到嘴边、高频轻颤）；`inventory.finishUseSlot` 调 `blowKazoo`。
- `audio.kazoo(underwater, echoDist)`：锯齿波 392→440→415Hz + 6.5Hz 颤音，经 1250Hz 带通出膜片嗡鸣，叠一层低八度方波；水下低通 700Hz + 气泡噪声；有回声时按距离延迟复读一声更闷的。`audio.stoneChime(vol)`：不成谐的石管叮当声。
- 回声点有一小团石粉粒子作为视觉反馈。

### L8 乐器洞
- 生成规则（`world/infiniteL8.ts`）：
  - 每层恰好一处，锚在第九大道 2 号路标（离出生石岸约 100m），沿大道法线偏 12m，左右由 seed 决定。
  - 洞厅半径 4.4m，洞底压平到洞心原高度，洞顶压到 2.7–3.1m；从 2 号路标到洞心挖一条半径 1.75m 的直洞管。
  - 洞厅、洞底、洞顶和洞管都直接写进洞穴场（`l8CaveMarginAt` / `l8FloorAt` / `l8CeilingFrom`），所以和大道永远连通。
  - 洞心所属的唯一 chunk 放：`stoneinstruments`（整洞石乐器）、`stonechime`（石风铃）、一盏暗暖光，以及断口钟乳石正下方的一支石卡祖笛（维基：笛口和石锥底部严丝合缝——它就是从这里断下来的）。
  - 摆放由 `l8InstrumentLayout` 统一给出（生成与渲染共用）：入口对面岩壁上斜嵌小提琴/吉他/长号，洞心偏里是马桶和一圈邦戈鼓（两架倒了），入口左侧挂石风铃，右侧是断口钟乳石。
- 可达性：`l8InstrumentCaveReachable(seed)` 从 2 号路标沿洞管每 0.25m 采样，要求余量 > 0.9m、净高 > 1.9m、相邻高差 < 0.3m，并绕洞厅一圈检查净高；check:tiny 用 8 个种子全过。
- 渲染：`renderer/instrumentCave.ts`（按真实洞底/洞顶高度摆放；洞顶高于 2.75m 时给断口钟乳石补一段石柱、给风铃补一根石链）；风铃进 `ANIM_STRUCT`，`data.ring=1` 时石管摆动。
- 交互：`stonechime`——没有石卡祖笛时「拨不响」；有就戳响，90 秒内持续把附近实体引向风铃。

### 对话（`content/npcs.ts`，10 节）
按维基访谈重写：心灵感应说话；外号来历（2019 年 6 月，匿名流浪者起的讽刺外号，拒绝说真名）、与 Entity 20 的契约、「案板上的鱼肉」「研究再多，你们也没法游得更快」、鲨鱼皮的来历；厌恶噪音和肢体接触、讨厌听人讲道理。小小自己从不说「出口」；玩家提门/出路的两个选项走新动作 `scorn`（`DialogOverlay` → `tinyScorn`）。图鉴 lore 首次发现日期改为 2019 年 6 月，并补上「我们试过了。不值得。」。

### 渲染映射（`tinyRender.ts`）
- 进入 repel → 完整 recoil 1.8s；每一声没吹满的笛响 → 约 45% 的 recoil（`TinyState.cringeT`）。
- perch 阶段（含激怒后回到门上）→ 盘踞姿势。旧版「calm 时第一次转入 investigate 就播 recoil」已去掉。

### 验收
- `npm run check:tiny`：76/76（不可杀/无掉落、门被挡与放行、它会回来、逼退计数与窗口、太远不算、半途而废记恼怒、听觉与去抖、肢体接触、对话提门、追杀/逼退追杀/放弃/消气、水下耗氧、洞穴回声点与开阔水面、乐器洞规则/唯一/可达/净高、石风铃、对话树完整）。
- tsc（tsconfig.app.json）0 错误。
- 回归：check:tiny-arms、l7、generation-obstacles、entity-forms、hounds、refined-items、smilers、jerry、dev-teleport、item-batches、clumps、l1-interactions、partygoers、wretches、dullers、skinstealers 全部通过。
- 机制示意：`proto-tiny.html?mode=mech`（`node scripts/verify-tiny.mjs mech`）。

### 待办 / 未验证
- 游戏内实机截图（L7 门区逼退、L8 乐器洞在真实洞穴里的摆放）还没拍；乐器洞的岩壁乐器按洞厅半径摆放，实际岩面有 ±0.16m 的三维噪声，可能有轻微悬空或埋得过深。
- 第一人称吹奏用的是通用手部动作（没有专门的持笛手型）。
- 联机：客人端的小小仍由房主快照驱动；卡祖笛逼退只在本地结算，未接联机广播。

## 收尾（2026-10-22，提交 1284981）

- **数值**：ZAN 确认阶段 3 的数值全部保持不变（4 声 / 6 秒 / 逼退 25 秒 / 每声耗氧 5 秒；激怒 120 秒后消气；普通噪音引不开小小）。
- **乐器洞贴合**：改由 `seatInstrumentCave` 按洞穴体积场的实际表面贴合。
  - 岩壁乐器嵌入 3–6 cm。
  - 落地物件压入 1.5 cm。
  - 补柱和风铃插进洞顶。
- **修 L7 卡死**：场心石台在通用寻路里是实心格，小小会卡住。新增 `swimStraight`，小小在盘踞、低鸣、逼退、回门四个阶段都改为自己游；追杀阶段加了卡住检测。
- **联机**：
  - 新增事件：`kazoo`（卡祖笛）、`chime`（风铃）。
  - 实体快照新增 `tn` 字段。
  - 逼退只由房主结算。
  - 协议版本升到 4。
- **第一人称持笛**：手型用 `KAZOO_HAND_POSE`；`blow` 动作把笛口送到嘴边；`vmAnimPose` 新增 `ry`。
- **测试**：
  - check:tiny 85/85
  - check:tiny-net 23/23
  - check:tiny-arms 全部为 0
  - tsc 0 错误
  - 回归：l7 2433、jerry 120/120、hounds、l1-interactions 147
- **实机截图**：用 `scripts/verify-tiny-ingame.mjs` 拍，输出在 reports/tiny-ingame/。
