# 设计模式 JSON 复刻指南（给 Agent）

玩家在游戏内「设计模式」（开发者模式 → 主菜单按钮）编辑布局/图鉴文案后导出的 JSON，
是**重制游戏内容的唯一事实来源**。你的任务是**严格、完整、逐项**把 JSON 落地到代码。
不允许自由发挥、不允许遗漏条目、不允许改动 JSON 未提及的内容。

文件位置约定：项目根 = 本文件所在目录；代码在 `app/`。

---

## 1. 文件格式总览

```jsonc
{
  "format": "backroom-design/v1",     // 版本标识；不一致先停下核对
  "exportedAt": "2026-08-10T…",       // 导出时间
  "layouts": [ /* 布局条目，见 §2 */ ],
  "codex":   [ /* 图鉴文案条目，见 §3 */ ]
}
```

`layouts` 与 `codex` 可单独或同时出现；同一文件可包含多个不同类条目，逐条处理即可。

---

## 2. 布局条目（layouts[]）

```jsonc
{
  "kind": "outpost" | "prefab" | "variant",
  "id": "gamma",                 // outpost=content/outposts.ts 的键；prefab=prefabs 的 id；
                                 // variant="l0:manila" / "l1:parking" / "l2:tidy" / "l3:sanct" 形式
  "name": "M.E.G. Gemma 基地",    // 显示名（可能与现名不同=要求改名）
  "level": 3,                     // 所属主层级
  "randomized": true,             // 仅 variant：纯随机布局——本条目只是 seed 下的一个样例（见规则 7）
  "seed": 424242,                 // 本样例的采样种子
  "customNote": "圣所大门改成双开", // 可选：玩家自由文本修改要求（规则 7b）
  "size": [80, 80],               // 瓦片宽×高（variant 固定 32×32 chunk）
  "tiles":   ["####", "#..#"],    // 主层（1F）瓦片行：'#'=地板 '.'=墙/虚空；行=y 递增，字符=x 递增。
                                 // ⚠ 编码注意（v54 修正）：早期文档误写为 '#'=墙——提取器/设计模式画布/既有导出文件
                                 // 一律为 '#'=地板、'.'=墙，本格式以此为准（up/upWall 等多层数组不受此影响：'#'=有楼板/有墙体）
  "up":      ["….#"],             // 可选：2F 楼板格（'#'=有楼板）；多层同理 "up2"=3F
  "upWall":  [".#.#"],            // 可选：2F 墙体；"upWall2"=3F 墙体
  "stair":  [{ "x": 12, "y": 30, "dir": 1, "lo": 0, "hi": 3 }],   // 可选：楼梯坡道格（dir 1东 2西 3南 4北；lo/hi=坡道两端高度）
  "structures": [{ "kind": "frontdesk", "x": 10, "y": 5, "w": 2, "h": 1,
                   "solid": true, "deg": 180, "data": { "tex": "…" },
                   "random": true, "chance": 0.25 }],   // random/chance 见规则 7（缺省=决定性摆放）
                   // randomized 样例上的固定编辑另带 "onRandomSample": true（必出）/ "remove": true（删除墓碑），规则 7a
  "npcs":      [{ "id": "brandt", "x": 12, "y": 20, "floor": 0 },  // floor=所在层 0/1/2
                { "id": "random", "flavor": "meg", "x": 30, "y": 24, "floor": 0 },  // 随机居民槽（规则 8）
                { "id": "new:老周", "newNpc": { "name": "老周", "role": "哨兵", "desc": "…" },
                  "x": 40, "y": 4, "floor": 0 }],                 // 全新固定 NPC（规则 9）
  "entities":  [{ "type": "ferren", "x": 8, "y": 9, "marks": { "capybara": 1 },
                  "random": true, "chance": 0.38 }], // marks=chunk raw 标记（calm/scale/hostile/tool/l3face/human/capybara）
  "lights":    [{ "x": 10, "y": 10, "r": 5, "color": "#fff2d8" }],  // 可增删/移动；r=半径，color=#rrggbb
  "exits":     [{ "kind": "unlockeddoor", "name": "北部入口", "dest": "back", "x": 40, "y": 1 }],
  "zones":     [{ "name": "大厅", "x": 40, "y": 24, "z": 0,          // z=楼层 0/1/2；x,y=标注锚点
                  "x0": 10, "y0": 18, "x1": 69, "y1": 30 }],  // x0/y0/x1/y1 可选=矩形范围（含边界瓦片；HUD 矩形内优先显示）
  "items":     [{ "type": "almond", "x": 8.5, "y": 9.5, "random": true }],  // 可选：固定地面物品（random/chance 同规则 7）
  "spawnRules": [{ "key": "infiniteL3.bigpainting.chance", "value": 0.25, "note": "大幅画作每 chunk 概率" }]
}
```

缺省字段 = 保持现状（未提及=不修改）。`"structures": []`（空数组）= 删除该布局全部结构；字段缺省 ≠ 清空。

### 落地路径

| kind | 落地点 |
|---|---|
| `outpost` | `app/src/game/world/mapgenOutpost.ts` 对应 gen 函数（手写布局）+ `content/outposts.ts`（名称/文案）+ `levels/l*.ts`（LevelDef） |
| `prefab` | `app/src/game/prefabs/` 对应预制件 fill 函数（prob=生成概率字段 prob） |
| `variant` | `app/src/game/world/infinite.ts`(l0) / `infiniteL1.ts` / `infiniteL2.ts` / `infiniteL3.ts` 中该变体的生成段 |

### 执行规则（严格）

1. **坐标系**：瓦片整数格，左上角 (0,0)，x 向右、y 向下；结构中心=(x+w/2, y+h/2)。
2. **tiles 与结构冲突**：结构落在墙格时，以 tiles 为准把该格改为地板（除非条目明确要求嵌墙）。
3. **data 原样透传**：不懂的 data 字段不要删改；deg 单位=度（逆时针）。
4. **概率类**（spawnRules / prefab prob / 生成器 chance）：把 `key` 映射到生成器中的具名常量或调用点（note 有中文提示），只改数值。
5. **NPC/实体**：按 id/type 在生成函数中改位置或增删；固定 NPC 的 id 必须已存在于 `content/npcs.ts`（全新 NPC 见规则 9）。
6. **多层**：`up`/`upWall`/`upWall2` 只出现于 floors>1 的据点；楼梯 stair 格必须与坡道两段对齐（lo=低层地面、hi=目标层板顶）。
7. **随机生成物与纯随机布局**：结构/实体/物品上的 `random: true` = 该对象由生成器按概率摆放（`chance`=每 chunk/每次生成概率，缺省=次数随机无单一概率）。`"randomized": true` 的 variant 条目整体只是 `seed` 下的一份随机样例，**样例内容（tiles/坐标/数量）一律不得照抄进生成器**。复刻规则：
   - (a) 带 `"onRandomSample": true` 的对象是玩家在样例上的固定编辑——**必须写进该变体的生成段保证必出**（按对象坐标/参数落到生成器对应位置；带 `"remove": true` 的 = 玩家要求删除该决定性对象，从生成段移除）；
   - (b) `customNote` 是玩家的自然语言修改要求（如「圣所大门改成双开」）——逐条落实；与代码现状矛盾或语义不清时停下来向玩家确认，不要自行发明；
   - (c) 样例中**不带** onRandomSample 的内容全部忽略坐标；其中 `random` 对象的调整只通过 `chance`/`spawnRules` 数值表达（chance=0 = 不再生成），非随机对象既未标记 onRandomSample 又未出现在导出条目里 = 保持生成器现状；
   - (d) `chance`/`spawnRules` 的数值改动映射到生成器中的具名常量或调用点（note 有中文提示），只改数值。
8. **随机居民槽**（`npcs` 条目 `id: "random"`）：由 `content/npcs.ts` 的生成池落地——`flavor` 对应 genRandomNpcs 的风味（meg/bntg/ariane/mixed/el3a）或专用池（jerry=jerryFollowerDef、brc=brcWorkerDef）；落位在对应据点 gen 函数中加 `genRandomNpcs(...)` 数量与落点（x/y/floor 有效）。
9. **全新固定 NPC**（`id: "new:<名字>"` + `newNpc`）：先在 `content/npcs.ts` 注册该 NPC——id 取 `<名字>`的拼音/英文小写，name/role 照填，personality/background/对话树 lines/idle 由 Agent 按 `newNpc.desc` 编写（jerry 系 NPC 一律追加到注册表末尾）；注册完成后按 x/y/floor 在生成函数落位。注册前不得落位（引擎按 id 查注册表）。
10. 每条落地后运行对应校验：`npx tsx --tsconfig .check/tsconfig.run.json .check/outpost-smoke.mts`（据点）、`smoke.mts`（有限层/预制件）、`l1inf-smoke.mts`/`l2inf-smoke.mts`/`l3art-smoke.mts`（无限层）。最后 `npm run build` 必须通过。

---

## 3. 图鉴文案条目（codex[]）

```jsonc
{ "kind": "entity", "id": "hound",
  "fields": { "name": "猎犬", "desc": "…", "codex.behavior": "…", "codex.lore.1": "…" } }
// 新建条目（v54；详见下方「新建条目注册流程」）：
{ "kind": "entity", "id": "new:夜行者", "new": true, "generate": "fromDescription",
  "fields": { "name": "夜行者", "desc": "…" } }
```

`fields` 的键 = 源文件中的字段路径（嵌套用点号；数组用数字下标）。**值是完整替换文本**（不是 diff）。

| kind | 源文件 | 可编辑字段 |
|---|---|---|
| `entity` | `app/src/game/entities/{critters,humanoid,deep,special}.ts` | name / desc / codex.no / codex.danger / codex.habitat / codex.behavior / codex.counter / codex.lore.N / codex.sighting |
| `item` | `app/src/game/content/items.ts` | name / desc |
| `level` | `app/src/game/levels/l*.ts` | name / label / flavor / lore / sd / entrance / exitDesc |
| `phenomenon` | `app/src/game/content/phenomena.ts` | name / desc |
| `faction` | `app/src/game/content/factions.ts` | name / fullName / desc（**fullName 对应源码字段 `en`**） |
| `outpost` | `app/src/game/content/outposts.ts` | name / intro.N / landmarkText.N |
| `npc` | `app/src/game/content/npcs.ts` | name / role / personality / backstory（**对应源码字段 `background`**）/ lines.N.npc（NPC 台词）/ lines.N.opts.M.text（玩家选项）/ idle.N |
| `doc` | `app/src/game/content/docs.ts` | title / no / body.N.head / body.N.paras.M |

注：`level` 条目的 `id` 是玩家可见编号（levelNo：601/274/101–106 等据点编号），落地时按 levelNo 反查 LevelDef。

### 附表：评分字段落地映射（v54 起并入所属条目的 fields，不再单列 cecs 条目）

| 所属条目 | fields 键 | 落地位置 |
|---|---|---|
| `level` | scores.ext / scores.env / scores.ent | `codexScores.ts LEVEL_SCORES[<可见编号>]` 的 ext/env/ent（0–5 整数） |
| | scores.cls | `LEVEL_SCORES[<编号>].cls`（值为空=删除 cls，回到三维平均） |
| `entity` | cecs.class | `ENTITY_CECS_CLASS[<type>]`（CECS_CLASS_INFO 的键） |
| | cecs.props | `ENTITY_CECS[<type>]`——**逗号连接的整组替换**（如 `"AGR,HVM"`；空串=删除整条） |
| | cecs.intel | `ENTITY_INTEL[<type>]`（A–E，含 `C-` 等细分） |
| | cecs.threat | 该实体 `codex.danger` 的**首位数字**（0–5；只改首位，保留其后文案） |
| `item` | iots.frequency / iots.utility / iots.origin | 写入 `IOTS_FREQ_OVERRIDE[<type>]` / `IOTS_UTILITY_OVERRIDE[<type>]` / `IOTS_ORIGIN_OVERRIDE[<type>]`（值须为对应 IOTS_*_VALUES 标准词汇；无覆盖的条目原为规则推导，落地即新增覆盖行） |

### 新建条目（codex[] 中带 `"new": true`）

玩家在设计模式左栏「+ 新建」产生。三种来源模式：

- **玩家自定义**（无 generate 字段）：fields 含该类的全部可编辑字段（值可能为空=玩家未填，按空文案落地或向我确认）；
- **Agent 依描述生成**（`"generate": "fromDescription"`）：只有 name/desc，全部设定按描述补全；
- **Agent 自动生成**（`"generate": "auto"`）：只有名称或完全留空，自行补全全部设定。

新建条目注册流程（按 kind）：

| kind | 注册流程 |
|---|---|
| `entity` | `entities/{critters,humanoid,deep,special}.ts` 注册 EntityDef（含 codex 全栏）→ `renderer/entitiesMesh` 低模建模（**遵守 facesX/+X 朝向约定**，过 ng-orient 审计）→ `spawns.ts` 生成归属 + `codexScores.ts` CECS/IETS → mesh-smoke 零 fallback |
| `item` | `content/items.ts` 注册 ItemDef → 像素图标（`scripts/gen-item-icons.py` 惯例）→ `renderer/itemsMesh` 低模（mesh-smoke 零 fallback） |
| `outpost` | `content/outposts.ts` 注册 + `levels/l*.ts` LevelDef（独立 id 空间）+ `mapgenOutpost.ts` 手写布局（若条目附带布局 JSON 则按 §2 落地） |
| `npc` | `content/npcs.ts` 注册（**jerry 系保持注册表末尾**；对话树按 desc 编写） |
| `phenomenon` | `content/phenomena.ts` 注册 + 引擎挂载点（engine.activePhenomena 推进逻辑） |
| `faction` | `content/factions.ts` 注册 + 标志图（`scripts/gen-faction-logos.py` 惯例） |
| `level` | `levels/l*.ts` 新 LevelDef（生成器/调色板/出口全套——工作量大，先与我确认范围） |
| `doc` | `content/docs.ts` 注册（body 段落结构） |

执行规则：
1. 逐字段在源文件中找到原文并替换；保持字符串转义与 TypeScript 语法完整。
2. 只改文案，不动字段顺序与结构；新增 lore/intro 段落 = 在数组末尾按点号下标插入。
3. 改完运行 `npm run build`；图鉴为运行时读取，无需其他校验。

---

## 4. 通则

- **逐条核对**：完成后回读 JSON，逐条确认全部落地；在回复中列出「条目 → 修改文件:位置」清单。
- 发现 JSON 与代码现状矛盾（如引用了不存在的结构 kind/NPC id），停下来向玩家确认，不要自行发明内容。
- 代码注释用中文；新增功能标记当前版本号（见 info.md 最新版本）。
- 禁止 git 操作。
