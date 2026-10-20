# 杰瑞 Entity 7 重制（JERRY-REMAKE）

参考：https://backrooms-wiki-cn.wikidot.com/entity-7（新版重写）+ 紫蓝金刚鹦鹉参考图。基线 f869f9b（= 远端 main c60b1b1）。
多人模式、联机协议、存档格式均未改动：新状态全部放在局内内存 `eng.jerryRun`；沿用旧存档字段 indoctrination / jerryTamed / jerryOath / jerryAgreed。

## 已确认的设计
- 真实尺寸紫蓝金刚鹦鹉；会说话（像成年人一样平静有条理，名字是自己取的）；飞行吃力，只能扑跳或短距滑翔。
- 被伤害、被当众驯服、或信众声望 ≤ -10 时，在 L274 内扑击玩家（对应芬奇事件）；青鸟神父讲道时它站到神父肩上；不做化身。
- 教化：6m 内有视线就会累积，被它注视时涨得更快；接触 +25；在 25/50/75 各触发一次木僵；满 100 后无法离开 L274（执行传教使命中或已驯服时除外）。
- 杏仁水驯服：教化清零，但会留下木僵残响。被信众看见则算亵渎，并触发扑击。
- 去程序化：教化清零，代价是本局理智上限降到 75。
- 信众：
  - 传单和假日志读完后，会在地图上标出 L2 的信众宣传间；
  - 声望中立时不主动接触玩家；
  - 敌对时用投石索和近战，把人打晕后抢劫，不致死；
  - 声望很低时辛克莱·贝克特会带小队伏击。

## 数值（engine/jerryAI.ts `JERRY` 常量表）
| 类别 | 数值 |
|---|---|
| 模型 | 全长约 0.95m，14 根骨骼，3 次绘制，2868 个三角面 |
| 栖木 / 肩上 | 横杆高 1.48m（T 形架，立柱高 1.44m）；站肩高 1.5m，横向偏移 0.2m |
| 搭话 | 主动搭话 4.5m，交谈 5.5m，之后每 11–17s 说一句 |
| 注视 | 玩家在 9m 内时，约 65% 的时间盯着玩家；头部与玩家方向夹角 <0.55rad 才算「被注视」 |
| 扑击 | 射程 1–7.5m，速度 7.2m/s，伤害 24，冷却 12s，落地后恢复 1.4s |
| 教化 | 6m 内有视线 0.15/s，被注视 0.5/s；接触 +25（冷却 20s） |
| 木僵 | 25/50/75 各触发一次：失神 2.6s（锁定输入，镜头转向杰瑞），再加 1.2s 虔诚姿态并诵咏；读档时已越过的阈值不补触发 |
| 木僵残响 | 持续 300s，每 20–45s 发作一次，每次失神 0.5–1.2s，镜头偏转 0.55rad，逐渐减弱 |
| 去程序化 | 本局理智上限 75 |
| 信众观望 | 12m |
| 投石索 | 射程 4–14m，蓄力 0.8s，冷却 3.4s，石速 15m/s，伤害 7，可以横移躲开 |
| 近战 | 信众 9，辛克莱 14 |
| 击晕 | HP ≤12 时被打晕 5.5s 并拖走；醒来 HP ≥18，被抢 1–3 格物品（每格拿走一半），之后休战 120s；在 L274 会醒在南侧居住区小屋 |
| 辛克莱伏击 | 声望 ≤ -40 时触发；首次在 150s 后，之后每 480s 一次；带 3 人小队（各 45HP），辛克莱 80HP，持续 240s |
| 讲道 | 首次 25s 后开始；每次讲 45s，间隔 70–100s |

## 文件
- 新增：
  - engine/jerryAI.ts
  - renderer/jerryMesh.ts
  - renderer/qaCpuSkin.ts（仅 QA 用的 `?cpu=1` CPU 蒙皮）
  - proto-jerry.html、src/proto/jerryProto.ts
  - scripts/check-jerry.ts、scripts/verify-jerry.mjs、scripts/verify-jerry-game.mjs
- 修改：
  - 引擎：entityAI、combat、npc、interact、inventory、engine、effects、career、level
  - 渲染：renderer、entitiesMesh、itemsMesh、npcGearPlan、structures
  - 地图：mapgen、mapgenOutpost
  - 内容：critters、types、npcs、items、codexScores、l1、l2
  - 界面：HUD
  - package.json（新增 check:jerry）
- mapgen.ts 修了基线就有的一个问题：1×1 实心结构（长椅、讲坛、圣水盆、栖木）旁边的格子会被误回填成通顶墙柱。这个改动对所有据点层生效。

## 验证
- `npm run check:jerry`：111/111 通过。
- tsc（app 和 node 两侧）通过；eslint 没有新增问题。
- 回归检查 37 项中 36 项通过。outpost-colliders（alpha_office_station -25°）在干净基线上同样失败，不是本次改动引起的。
- 游戏内用 `?cpu=1` 实测准星接触：6 种对准情况全部命中，3 种偏离情况全部不命中；接触后教化 0→25 并触发木僵。
- 截图在 reports/jerry/。

## 已知不足
- 默认的 GPU 蒙皮还没在真实显卡上验证（无头 SwiftShader 下会崩溃，所以截图用的是 CPU 蒙皮）。
- 「每 11–17s 说一句」这项检查出现过一次偶发失败。
- 扑击时的尖啸气泡留白太多。
- 修墙柱的改动影响所有据点层，没有逐层截图检查。
- 真实光影下少了三张截图：肩上背面、木僵、虔诚姿态。
