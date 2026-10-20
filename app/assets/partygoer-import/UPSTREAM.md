# 派对客（Entity 67）重制

基线：`ZANReping/backroom` main `c60b1b1`。保留 `partygoer` ID、L601 生成表、存档格式与联机协议（多人冻结）。旧版方块模型与通用 `feignNeutral` 分支移除，改为专属 AI + 程序化蒙皮模型。

参考：中文维基 Entity 67「派对客 =）」（https://backrooms-wiki-cn.wikidot.com/entity-67）；用户提供的两张参考图（Daniel Kebab 首张素描：无脖圆角柱身、竖眼 + 上翘弧血刻笑脸、下垂面条臂 + 红吸盘口、宽裤管块状腿；Myra 狂战士图：胸甲双开门、青绿人脸、恐惧蜈蚣、粉色甲壳肉、灰白蜈蚣钩爪臂/尾）。

## 文件
| 文件 | 作用 |
| --- | --- |
| `src/game/engine/partygoerAI.ts` | 专属 AI、部位伤害、狂战士/倒地/爬走/复苏/焚烧、转化值 |
| `src/game/renderer/partygoerMesh.ts` | 程序化蒙皮网格（39 骨）+ Canvas 皮革/笑脸贴图 + 姿态动画 |
| `src/game/entities/partygoerLook.ts` | 颜色变体 / 实习生（红气球）确定性哈希 |
| `scripts/check-partygoers.ts` | 行为断言（`npm run check:partygoers`） |
| `proto-partygoer.html` + `src/proto/partygoerProto.ts` | 预览页：`?view=front/side/back/close/chest/poses/colors`；`&cpu=1` 走 CPU 蒙皮（模型自带的 `PARTYGOER_CPU_SKIN`） |
| `scripts/verify-partygoer.mjs` / `verify-partygoer-game.mjs` | 原型页截图 / 游戏内分阶段验收 |
| 修改 | `entityAI.ts`（派对客走专属 AI）、`combat.ts`（部位结算、防火免电）、`inventory.ts`（蛋糕）、`engine.ts`/`effects.ts`（`partyConv` 局内状态）、`dev.ts`、`entities/deep.ts`（codex 重写）、`entities/types.ts`（`e.pg`）、`content/items.ts`/`codexScores.ts`（`velvetcake`）、`entitiesMesh.ts`、`itemsMesh.ts`、`renderer.ts`、`structures.ts`、`HUD.tsx`、`world/mapgen.ts`（`placePartyPack`）、`core/types.ts`/`decorRegistry.ts`（`partyflag`）、`levels/l601.ts`（注释）、`package.json` |

## 建模
- 高约 2.2m；头身一根连续圆角柱（无脖子），宽裤管块状腿 + 斜切块脚。光滑金黄皮革 Canvas 贴图（褶皱、轻光泽）。
- 血刻笑脸贴花：两道竖眼 + 上翘弧嘴，脸颊血迹。
- 面条臂：7 节骨骼蒙皮，柔软下垂摆动；末端七鳃鳗吸盘口 + 内圈钩牙。可单独断裂（肩部留残桩）。
- 胸甲：两扇门平时闭合；狂战士弹开露出青绿人脸、恐惧蜈蚣、粉色甲壳肉，并弹出 2 条灰白蜈蚣钩爪臂（一条上伸、一条下绕成尾）。
- 颜色：大多黄色，少量红/蓝/绿/白；约 35% 为拴红气球的「实习生」。
- 预算：单只 ≤6 次绘制、≈7.9k 三角面；形态几何按变体缓存（克隆约 2.5ms/只），首次生成进预热队列。

## 行为
| 规则 | 数值 |
| --- | --- |
| 群体 | 永不落单（2–4 只，`placePartyPack` 聚群）；互相有视线（16m 内）即心灵感应共享目标与暴起状态；追击分配 0 / ±0.95 / ±1.7 rad 包抄角 |
| 近视 + 听觉 | 视距 6m；蹲行几乎听不见，步行约 6.4m、奔跑约 10.5m 可闻 |
| 速度 | 友善走近 1.5、追击 4.6、狂战士 5.1 m/s（玩家奔跑 6.0）；拉开距离/绕障可脱身；7s 无信息转搜寻，22s 后恢复伪装（被攻击过的不恢复） |
| 假装办派对 | 挥手、递蛋糕，进入 2.4m 暴起；派对客专属提示（「侍者不笑了」仅侍者使用） |
| 心灵低语 | 注视玩家时偶发熟人声音台词，结尾 `=)` |
| 抓咬 | 1.7m 起手、判定 1.95m，伤害 ×0.55，每口转化 +20 |
| 狂战士 | 蜈蚣爪三连抓（每下 12），冷却 0.65s |
| 防御 | 皮肤抗切割/穿刺；爆炸火焰无效、电击免疫 |

## 击杀流程（严格顺序）
1. 面条臂各 26 血，最薄弱。胸甲闭合时躯体（含头）减伤 90%，且躯体血量不低于 60%。双臂都断 → 无法再转化玩家，进入狂战士、胸甲打开。
2. 狂战士：躯干 ×0.35、头/脸 ×1.6。打到阈值 → 倒地静止。
3. 静止 6s 后面朝下用蜈蚣步足爬走（0.42 m/s），倒地 36s 后复苏（血量 45%，断臂不长回）。
4. 只有火盐晶体（`firesalt`）或火油桶（`gas`）在 3.2m 内引燃才能烧尽（2.6s，黑烟 + 硫磺味提示）。不新增物品。

## 转化（局内）
- 被咬 +20、吃「丝绒蛋糕」+30，不消退、无解药；满 100 →「加入派对」死亡，原地生成一只拴气球的派对客。
- 转化越高：受伤红闪越淡（失去痛觉）、雾距缩短 + 视野边缘模糊/金黄暗角（视力变差）。
- `partyConv` 只在引擎内存，新一局清零，不写存档；`PlayerState` 未改。

## L601 布置
派对客群旁放丝绒蛋糕（codex：切勿食用）、「TIME 4 FUN =)」海报、大红旗（`partyflag`）。`placePartyPack` 用独立小随机数，不影响本层其他生成。生成范围仍只有 L601。

## 存档兼容
存档格式不变。`velvetcake` 只是 `ITEMS` 新键，旧存档照常读取；唯一风险：带蛋糕的新存档被旧版本读取时可能不识别该物品。

## 验证
- `npx tsc -p tsconfig.app.json --noEmit`、`npx tsc -p tsconfig.node.json --noEmit`：通过。
- eslint（改动文件）：无新增问题（`HUD.tsx` 23 条、`structures.ts` 1 条为基线既有）。
- `npm run check:partygoers`：111/111。
- 回归全部通过：clumps、hounds、smilers、smiler-forms、skinstealers、wretches、dullers、rats、clump/hound/smiler/duller-integration、entity-forms、entity-preparation、faceling-skinstealer-models、wretch-mesh、rat-mesh、item-batches、refined-items、six-items、generation-obstacles、l2/l3/l4/l7/l10、static-colors、instance-colors、model-warmup、program-completion、render-geometry、static-transforms、scene-warmup。
- 截图：`reports/partygoer/`（原型页 front、side、close、chest、poses、colors；旧的游戏内 game-feign/reveal/berserk/down 为崩溃状态下所截，作废，仅留作对照）。
- 游戏内复验（2026-10-18，L601，种子 6767，1600×900，`?cpu=1`）：`game2-{classic,realistic}-{feign-cake,reveal-bite,berserk-chest,down-crawl,burn}.png` 共 10 张，两种光影下都能看到完整的黄色柱身、血刻笑脸、面条臂/吸盘口（狂战士为断臂残桩 + 蜈蚣爪）；结果 `game2-verify-{classic,realistic}.json`，全程 GPU 进程零崩溃、上下文未丢失。命令：vite 3318 → `node scripts/verify-partygoer-game.mjs launch|enter|shots|close <classic|realistic>`（`PG_SHOTS=` 可分批）。
- 旧截图「只见几块红色方块」的诊断：红块是 `severArm` 断臂时 `bloodParticles` 喷出的血点粒子（#b3352b，Points 方块），不是派对客材质。身体消失是因为无头 Chromium 155 的 SwiftShader（ANGLE→Vulkan）只要画任何 GPU 蒙皮网格，GPU 进程就以 `exit_code=4` 崩溃（4 骨 + MeshBasicMaterial 的方盒最小复现同样崩溃），上下文丢失/恢复期间所有程序（MeshLambert、Points、MeshBasic、OutputShader 等）报 `Shader Error 1282 / VALIDATE_STATUS false`、空日志——这是连带症状。换 `--use-gl=angle --use-angle=swiftshader`、`--use-gl=egl`（回落到同一 SwiftShader）、`--disable-gpu-watchdog` 都照样崩溃；本机没有 Mesa/llvmpipe。判断为软件光栅环境限制，不是派对客代码 bug：骨骼索引最大 38 < 39、权重/顶点无 NaN，同一套权重与骨骼矩阵在 CPU 上计算完全正常。
- 处理：新增仅限 QA 的 `?cpu=1` 开关（`PARTYGOER_CPU_SKIN`），派对客的 SkinnedMesh 只当骨架用（隐藏、不编译蒙皮程序），每帧用 `applyBoneTransform` 在 CPU 上写回一个静态替身网格；默认关闭，真实 GPU 不走这条路。验收脚本默认带 `?cpu=1`（`PG_QA_QUERY=` 可关闭）。
- 本次改动后重跑：`npx tsc -p tsconfig.app.json --noEmit` 通过；`npm run check:partygoers` 111/111；`check:clumps` 通过；`check:model-warmup` 111 项通过；`check:program-completion` 58 项通过；eslint（partygoerMesh.ts、partygoerProto.ts、verify-partygoer-game.mjs）无问题。

## 已知不足
- 闭合胸甲正面能看出矩形轮廓；断臂残桩略像耳朵。
- 倒地/爬走形体偏长条，蜈蚣步足不够明显；爬走时持蛋糕穿模未专门检查。
- 经典光影下皮革光泽弱。
- 转化满值的完整游戏内流程未在浏览器中跑通（headless 断言已覆盖）。
- GPU 蒙皮路径本身仍未在真实 GPU 上目测过：无头环境只能走 `?cpu=1` 的 CPU 替身。需要在有显卡的机器上不带 `cpu=1` 复验一次（预期正常；同一套 three.js 蒙皮在别的实体上已上线）。
- 游戏内倒地/爬走从脚端看，柱体底部开口与两截腿块像是竖起的，形体读起来不够清楚。
- 焚烧截图里火势是把 `burn` 直接推进到 0.55 再冻结的（软件光栅帧率太低，真实投掷物点燃后 0.9s 只推进了几帧），真实光影下身体偏粉橘发亮而不是焦黑；黑烟/火星粒子是脚本按 AI `smoke()` 的格式补的。
- 截图状态是脚本直接写入姿态量并冻结 AI 得到的，不是自然战斗中抓拍；此前一次火盐把同群另一只也烧掉了（3.2m 引燃半径，符合设定）。
