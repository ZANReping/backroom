# 行李员 Entity 135（The Bellhopper）重制说明

L5 恐怖旅馆的行李员。全楼只有一位，只在 L5 出现。分三个阶段做完：建模、动画、机制与接入。
设计稿：`/workspace/work/bellhop/plan.md`（ZAN 10-30 23:09 定稿：全部按推荐方案）。

## 提交

| 阶段 | 提交 | 内容 |
|---|---|---|
| 1 建模 | 6342ef0 · 70ad733 · 28e9a8a | SDF 建模的瘦高男体（约 1.85 m）、仓鸮面具、制服、帽、手 |
| 头发重做 | 5ab724d | 22 簇哑光 SDF 头发体积，加上 alphaTest 卷发卡片和碎发层；头发三角形 9176 → 5222 |
| 2 动画 | 0bcca68 | `bellhopAnim.ts`，共 14 个片段，含 IK、拧头、衣摆和道具 |
| teaSip 修复 | e5c3616 | 喝茶时杯子一直在右手，沿碟到喙的弧线移动，手肘自然下垂 |
| 3 机制 | 0882243 | `bellhopAI` / `bellhopRender` / 图鉴档案 / 换脸贴图集，以及全部接入 |

## 模型（阶段 1）
- 文件：`renderer/bellhopHead.ts`、`bellhopBody.ts`、`bellhopFace.ts`、`bellhopMesh.ts`、`bellhopProps.ts`、`bellhopRig.ts`。
- 做法与看门人 v4 相同：部件先写成 SDF，再做窄带 Surface Nets 提取、QEM 减面，最后把顶点投影回等值面；法线取 SDF 梯度，顶点色用区域色乘 SDF 环境光遮蔽。
- 外形：仓鸮心形面盘（奶白上釉面具、黑圆眼、细长钩喙），姜黄蓬乱头发，藏青圆筒帽（金色四芒星、扇贝饰边），白色高立领，藏青双排扣长制服（每列 6 颗金扣），白色翻袖口，苍白细长的手，深色西裤配黑皮鞋。
- 8 张脸：`public/textures/l5/bellhop_faces.jpg`（960×150 图集。路径被 .gitignore 挡住，用 `git add -f` 加入）。
- LOD：LOD1 约 1.7 万三角形，立即建好；LOD0 约 5.9 万三角形，第一次走到 14 m 以内才建。9 m 以内用 LOD0，11 m 以外用 LOD1，中间保持当前档。默认 GPU 蒙皮，`?cpu=1` 时改用 CPU 蒙皮替身。

## 动画（阶段 2）
- `BELLHOP_CLIPS` 共 14 个：idle、headTurn、ringFriendly、ringAnnoyed、bow、walk、pushCart、takeItem、giveBack、tagHand、teaSip、faceShift、pickUp、stillWatch。
- 片段时长（`BH_CLIP_LEN`，单位秒）：idle 6、headTurn 3.2、ringFriendly 2.4、ringAnnoyed 3.4、bow 3、walk 1.05、pushCart 1.25、takeItem 3.2、giveBack 3.2、tagHand 3、teaSip 6、faceShift 1.4、pickUp 4.6、stillWatch 2。
- 姿态在根空间里定义，片段之间 0.2 s 混合。手臂用两骨 IK，可以按根、胸或头空间给目标，也可以给捏取或手掌目标。腿用人腿 IK，带脚掌和脚跟俯仰以及步态锁脚。
- 拧头按胸、颈、头 5/45/50 分配，可以拧到 180°。衣摆骨骼带二阶滞后。
- 道具：铃（握拳，铃舌会摆）、茶杯和碟、行李牌、行李车、手提箱。

## 机制（阶段 3，`engine/bellhopAI.ts`）
- **出现**：进入 L5 地图 10 s 后开始尝试。10F 一定出现；其他楼层首次 55%，失败后每 90 s 再掷一次，概率 35%。他站在你所在楼层一条长走廊的尽头，距离 20–40 m（找不到合适位置时放宽到 12–48 m），并且在你视线外。位置按世界绝对坐标存档，地图流式平移后会在原处重建。
- **「你回头的时候，他也会转头」**：判定为被你看着的条件是在你视线 ±0.8 rad 内、40 m 内、中间无遮挡。被看着时他一动不动（stillWatch）。你移开视线 0.45 s 后，他的头已经拧向你，脸也换了：8 张脸洗牌轮换、不重复，换脸只在你没看着时发生。他在视线外满 3.5 s，并且离你太近（9 m 内）、太远（46 m 外）或在你身后时，会挪到你前方下一条走廊的尽头。走到 18 m 内看清他的脸，会点亮图鉴里「见过的面孔」。
- **铃**：他不说话。友好铃清脆两下；恼怒铃沉闷一长声，使关注度 +10（3 s 冷却），并把 40 m 内的管家和看门人引到铃声位置。看门人赶过去以后会**回到原来的岗位**。
- **挨打**：他不会受伤，只后退 0.6 m 并摇恼怒铃。他本人从不攻击。
- **寄存**（2 m 内按 X）：收你**手上**那件东西（快捷栏选中的格子）；空手时收**快捷栏第一件**。**行李牌、关键物品、茶（客房茶、咖啡）、情书一律不收**。手里拿着不收的东西时，他不会替你另挑一件。每次寄存换一张行李牌，编号从 135 开始；最多寄存 8 件。再按 X 出示行李牌就能取回。寄存物存在 `eng.hotel.bellhop.deposits`，不在玩家身上，所以 13 楼的没收不影响它们。
- **关注度 ≥ 75**：他不再收寄存（摇恼怒铃），并把你寄存的东西全部送到 10F 行李房，得自己去取。
- **13 楼没收的钥匙**：转交给他保管，按 X 领回，代价是关注度 +5。如果先递过茶或已交情书，这次免代价。
- **死亡遗物**：你在 L5 死亡时，身上的东西被他搬到 10F 行李房。由于死亡会让本局存档失效，遗物按**存档位**存在 localStorage（键名 `br_bellhop_legacy_<槽位>`，最多 16 件），同一存档位的**下一局**在 10F 行李房取回。只保留最近一次死亡的遗物。
- **茶**：客房茶由 bellhopAI 在**每张地图放 1–2 杯**，优先放在客房、休息厅、餐厅区域，离玩家 8 m 以外。把客房茶或咖啡递给他：他摇友好铃并喝茶（teaSip），下一次领回免代价。
- **彩蛋**：10F 行李房里有一封「绅士的情书」（Entity 18 写给他的信）。交给他以后**本局**永久友好（领回不再有代价），图鉴解锁一行，这一行**跨局保留**。
- **好感度增减**（`BH.rel`）：寄存 +2、领回 +1、茶 +8、情书 +60、恼怒 −6、挨打 −10。
- 只处理本地玩家，不处理联机。

### BH 关键数值（全部来自 `bellhopAI.ts` 的 `BH`）
| 键 | 值 | 含义 |
|---|---|---|
| firstDelay | 10 s | 进入地图后多久开始尝试生成 |
| spawnP | lux 1 / other 0.55 / retry 0.35 | 10F 必出现；其他楼层首次 55%；之后每次重试 35% |
| retryGap | 90 s | 生成重试间隔 |
| spawnR / spawnLoose | 20–40 m / 12–48 m | 走廊尽头距离 / 放宽后的距离 |
| watchCone / watchR | 0.8 rad / 40 m | 「被看着」的判定范围 |
| turnAfter | 0.45 s | 移开视线后多久拧头并换脸 |
| relocateT / Near / Far | 3.5 s / 9 m / 46 m | 挪位置的条件 |
| faceSeenR | 18 m | 看清脸的距离 |
| serveR / depositCap / tagStart | 2.0 m / 8 / 135 | 服务距离 / 寄存上限 / 牌号起点 |
| refuseAt | 75 | 拒收并送去行李房的关注度阈值 |
| keyClaimAttn | +5 | 领回钥匙的关注度代价 |
| annoyAttn / annoyCd | +10 / 3 s | 恼怒铃的关注度 / 冷却 |
| lureR | 40 m | 引来员工的范围 |
| hitBack | 0.6 m | 挨打后退距离 |
| roomR / legacyCap / holdCap / roomCap | 2.4 m / 16 / 24 / 60 | 行李房交互距离 / 遗物上限 / 保管上限 / 行李房上限 |
| farBellR | 60 m | 远处铃声范围 |

## 文件（阶段 3）
- 新增：`src/game/engine/bellhopAI.ts`、`src/game/renderer/bellhopRender.ts`、`src/components/BellhopCodexFile.tsx`、`public/textures/l5/bellhop_faces.jpg`、`scripts/check-bellhop.ts`、`proto-bellhop3.html`、`src/proto/bellhop3Proto.tsx`、`scripts/verify-bellhop3.mjs`、`scripts/verify-bellhop-game.mjs`。
- 改动：`package.json`（`check:bellhop`），HUD、HotelLedger、InventoryOverlay，content 下的 codexScores、items（新增 bagTag、roomtea、gentletter）、l5Rules、l5Staff，`core/audio`（铃声），engine 下的 combat（挨打保护）、conciergeAI（听到铃声）、entityAI、l5Hotel、special，entities 下的 archiveViews、humanoid、spawns、types，renderer 下的 entitiesMesh、entityArchiveModel、renderer.ts。

## 检查结果
- `tsc --noEmit -p tsconfig.app.json`：通过（0 错误）。
- `npm run check:bellhop` 83/83、`check:concierge` 74/74、`check:maid` 64/64、`check:l5hotel` 179/179，全部通过。
- 场景预览：`node scripts/verify-bellhop3.mjs` 生成 9 张图（7 个场景 + 图鉴上下两半），汇总在 `reports/bellhop/stage3.jpg`。

## 与规格不同的地方
- 死亡遗物按存档位存在 localStorage，下一局在 10F 取回（规格没写死亡后怎么跨局保存）。
- 情书带来的永久友好只在本局有效；图鉴里解锁的那一行跨局保留。
- 看门人被恼怒铃引过去以后会回岗，不会一直留在铃声的位置。
- 寄存只收手上的物品；空手时收快捷栏第一件；行李牌、关键物品、茶、情书不收。
- 客房茶由 bellhopAI 每张地图放 1–2 杯，没有改地图生成器。

## 已知问题
- 走廊尽头那张预览里人太小、太暗。
- 恼怒铃动作里握铃的手偏张开。
- 手臂和身体之间没有碰撞，个别姿势有穿插。
- 遗物存在 localStorage：换浏览器或清除站点数据就会丢，而且只保留最近一次死亡的遗物。
- 不处理联机。
- 头发近看有卡片感，耳侧那簇偏硬。
- 实机截图（`verify-bellhop-game.mjs`）在 SwiftShader 下两次超时，没有出图，只有场景预览。
