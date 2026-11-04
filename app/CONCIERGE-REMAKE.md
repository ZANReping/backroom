# 看门人 Entity 131「The Concierge」重制（L5 恐怖旅馆前台员工）

参考：backrooms-wiki-cn.wikidot.com/entity-131 中文维基 + ZAN 附图；设计定稿见 `/workspace/work/concierge/plan.md`（ZAN 10-30 16:10）。
基线：l5-wt 的 `f1d5548^`（L5 1d 收尾之后）。提交链：
`f1d5548` 阶段 1 粗模 → `6911c36` v2 SDF 无缝模型 → `a8bc92a` v3 头颈精修 → `f29d746` v4 头部 → `cd7d12a` 阶段 2 动画 → `0e8ee88` 阶段 2.1 修正 → `0b892e6` 阶段 3 机制 → 阶段 3 文档 / 预览（本文件所在提交）。

## 1. 模型（SDF 雕刻 v4）
- 约 2.0 m 瘦高男体；写实黑山羊头（脸上 4 只橙眼、横瞳、可眨的上下睑、耳、角芽、鼻孔、裂唇、山羊胡）；白衬衫卷袖到肘上、黑领带、深色西裤 + 皮带；
  裸露深褐前臂长眼（左 4 右 5）；人手五指三节；反关节山羊腿（裤子包到跗关节，下露黑毛腿 + 分趾蹄 + 悬蹄）。
- 做法（`conciergeSdf.ts` / `conciergeHead.ts` / `conciergeBody.ts` / `conciergeMesh.ts`）：每个部件写成 SDF，窄带 Surface Nets 提取整块无缝网格，手 / 头细提后 QEM 减面；
  顶点投影回等值面、法线取 SDF 梯度；顶点色 = 区域色 × SDF 环境光遮蔽。部件只在衣物边界拼接（领口、卷袖、皮带、裤口），手 / 前臂、上下裤管用重叠带拼接。
  领子 / 领带 / 皮带扣 / 衬衫扣是独立薄壳。三平面细节纹理（毛 / 皮肤 / 棉布 / 毛呢）在绑定空间采样。
- v3 / v4 头颈：眼窝骨性结构、厚睑缘、睑裂加宽、虹膜放大 1.36×、颞下颌关节铰链 + 渐变喉部皮肤、颈毛缩短为黑褐毛簇、口腔 / 下门齿；颈毛 / 胡须发片是第三张 SkinnedMesh。
- 面数：**LOD0 64.1k 三角形 + 发片 2.7k**，**LOD1 14.7k**；全身 1 张 SkinnedMesh + 眼球 1 张 + 发片 1 张。
- LOD（`conciergeRender.ts` `CONCIERGE_LOD`）：先建 LOD1；第一次走近 14 m 内才建 LOD0；< 9 m 用 LOD0、> 11 m 用 LOD1（中间保持，防抖）。
- 前台道具（`conciergeProps.ts`）：柜台 + 钥匙墙（437 号那格空着）+ 台式电话 + 嵌墙送菜升降梯（上下拉门 + 小厢 + 侧边拉绳）。
- 无头 SwiftShader 画 GPU 蒙皮会崩：所有预览 / 截图带 `?cpu=1`（`qaCpuSkin`）。

## 2. 动画（`conciergeAnim.ts`，16 clips）
| 片段 | 时长 | 循环 | 说明 |
|---|---|---|---|
| idle | 6.0 | ✓ | 前台待机（目光跟住客） |
| phone | 6.4 | | 接电话（动态螺旋电话线） |
| giveKey | 4.6 | | 取 437 钥匙递出；倒放 = 收下挂回墙上 |
| walk | 0.92 | ✓ | 1.35 m/s，步幅 1.242 |
| run | 0.6 | ✓ | 4.33 m/s 基准（按实际速度最多 1.8× 推进） |
| armWatch | 3.4 | | 抬前臂用前臂眼「看」 |
| blinkTeleport | 1.6 | | 眨眼瞬移（0.58 s 时挪位置，冻结切换瞬间的姿态） |
| talk | 3.2 | ✓ | 搭话 |
| trip | 4.4 | | 扑倒 / 摔倒爬起（扑中 0.35 s，2.2 s 起爬起段） |
| bind | 4.2 | | 蹲下捆人 |
| drag | 1.4 | ✓ | 单手拖人倒退 |
| stuffLift | 3.6 | | 塞进送菜升降梯（2.75 s 拉门关上） |
| pullRope | 1.4 | ✓ | 双手交替拉绳 |
| wipeHands | 3.2 | | 手帕擦手 |
| teaBreak | 6.0 | | 茶歇（杯碟） |
| gnawMetal | 1.6 | ✓ | 啃金属（门牙） |

- 根空间可混合姿态，切换混合 0.2 s；手臂两骨 IK（铰链正确）+ 头空间锚点 + 捏取目标 + 前臂眼瞄准扭转；三段反关节腿 IK + 蹄锁定；
  异步眨眼、耳 / 领带 / 颈毛二级运动；道具：话筒、钥匙、杯碟、绳子、手帕、叉子。
- **2.1 修正（0e8ee88）**：螺旋电话线 `conciergeCord.ts`（4.5 mm 线 / 12 mm 螺圈，下垂贝塞尔上保长螺旋，避开身体胶囊和柜台，不用时盘在台上、话筒按拿起帧校准落座）；
  walk / run 自适应跖骨耦合 K 的腿 IK + 蹄尖支点抬跟，**髋压低改为 1.5 / 5 cm**（原 5 / 10.5 cm），步频加快；
  膝窝辅助骨（半角 kneeFix + 大腿后侧垫 kneeIn 随屈曲缩放）修西裤膝窝鼓包；喝茶肘部下压（贴杯时保持头空间手朝向）；trip 地面保护（髋抬到髋 / 膝 / 跗都离地）+ 腕抬起。

## 3. 机制（`engine/conciergeAI.ts`，调参表 `CC`）
- 孤例：全楼只有一位，1F 主厅前台（背靠墙 0.75 m，柜台在前；候选为主厅四面墙中段，避开实心结构和 4 m 内的出口）。别的楼层平时不在，被盯上时才眨眼出现在身后。
- 只算**真出口**：古典楼梯 → L4、锅炉房完全黑暗的门 → L6、深色木门 → L9。**电梯不算**（酒店自己的，不拦）。
- 不管的人：客房里蹲着不动 2 s（躲着发抖）、在床上睡觉、在正确方向上徘徊的。茶歇中、放行期内也不拦。
- 不可击杀：挨打 → 回满血、6 s 内追逐速度 7.2、关系 −10、直接追。

| 项 | 数值 |
|---|---|
| 朝出口判定 | 真出口 10 m 内持续接近（>0.35 m/s）1.2 s，或贴近 3.5 m → 眨眼瞬移到身后 2 m 搭话 |
| 追踪 | 关注度 ≥ 75（「清理」档，tier 3）离开前台；被注视（±0.75 rad、32 m、无遮挡）时站定 armWatch；不被看时每 2.2–3.6 s 眨眼一次，距离缩到 max(2.6, ×0.45)；3.2 m 内搭话 |
| 别的楼层出场 | 视线外 14–22 m |
| 搭话 | 9 s 不表态或走开 4.5 m = 拒绝；X = 跟他走（1.35 m/s 领到 14–20 m 外远离真出口的点，掉队 >7 m 超过 3 s 视为拒绝，最多 25 s）→ 放行 180 s、关系 +8 |
| 追逐 | 6.4 m/s（玩家冲刺 6.0），挨打后 7.2 m/s（6 s）；看不见他且 >7 m（或卡住 0.8 s）→ 眨眼贴到身后 2.2 m；>30 m 或断视线 10 s 追丢 |
| 扑倒 | 1.25 m 内起扑，0.35 s 扑中，**6 伤害**；**2 s 内连按 6 下**挣开（交互 / 攻击 / 跳跃 / X 任一键上升沿）；扑空照样摔一跤 |
| 捆绑 | **4.2 s 内连按 10 下**（每秒衰减 1.4）挣脱；挣脱后他愣 1.6 s、4 s 内不再扑，关系 −3 |
| 拖行 | 0.9 m/s 倒退拖到送菜升降梯：1F 前台那台 16 m 内就用它，否则在 2.5–12 m 内找整面墙放一台临时的；最多 30 s |
| 塞入 / 拉绳 | stuffLift 2.75 s 关门 → 黑屏开始；pullRope 2.8 s → 擦手回岗 |
| 13 楼（简化） | 黑屏 7 s、每 0.75 s 一声拉绳；**钥匙类全丢、HP −25、理智 −20、关注度 +15**、关系 −12；随机换到 **1–12 层**（不同于当前层），**员工通道醒来**（维修区优先、离真出口 ≥12 m），淡入 1.6 s |
| 金属分心 | 16 m 内住客丢下的金属（银餐具 / 刀 / 撬棍 / 扳手 / 压具 / 鹰币）；啃 **银餐具 12 s、其他 7 s** |
| 茶歇 | 每 **300–420 s 一次、持续 90 s**；换班开始时提前结束回岗 |
| 前台电话 | 35–80 s 一次（玩家 22 m 内才响） |
| 437 号钥匙 | 每张非 1F 地图 35% 放一把（客房 / 休息室 / 比佛利 / 维修区优先，离玩家 ≥25 m）；前台 X 交还 → **关系 +40、放行 600 s** |
| 挂眼提示 | 被盯上（追踪 / 搭话 / 追逐 / 正要拦截）时 **6–14 s 一次、每次 0.38 s**，屏幕四边之一（避开正中和角落） |

- 存档 `hotel.concierge = { met, talks, follows, chases, binds, escapes, lifts, gnaws, key437 }`，`hotel.cgWake` = 下次进 L5 在员工通道醒来。
- 只处理本地玩家（不管联机）。

## 4. 文件清单
新文件：
- `src/game/renderer/conciergeSdf.ts` SDF 原语 + 窄带 Surface Nets + QEM · `conciergeRig.ts` 骨架常量 · `conciergeHead.ts` 头部 SDF / 眼 / 口 / 发片区 · `conciergeBody.ts` 躯干 / 衣物 / 手臂 / 腿 SDF
- `src/game/renderer/conciergeMesh.ts` 组装 + 蒙皮 + 材质（LOD0 / LOD1） · `conciergeProps.ts` 前台 / 升降梯 · `conciergeAnim.ts` 16 clips + IK · `conciergeCord.ts` 螺旋电话线 · `conciergeRender.ts` 实体渲染接入（LOD / 前台 / 升降梯 / 片段切换 / 图鉴姿态）
- `src/game/engine/conciergeAI.ts` 机制（CC 表）
- `src/components/ConciergeHud.tsx` 挂眼 / 挣脱条 / 13 楼黑屏 · `ConciergeCodexFile.tsx` 图鉴员工档案
- `scripts/check-concierge.ts`（`npm run check:concierge`，74 项）· `scripts/verify-concierge.mjs` 模型 / 动画截图 · `scripts/concierge-gif.py` GIF 拼接
- 预览：`proto-concierge.html` + `src/proto/conciergeProto.ts`（模型 / 动画）；`proto-concierge3.html` + `src/proto/concierge3Proto.tsx`（阶段 3 场景摆拍，必须 `?cpu=1`）
- 截图：`scripts/verify-concierge3.mjs`（预览 12 格）· `scripts/verify-concierge-game.mjs`（实机前台 / 挂眼，入口 `/?cpu=1`）
接入改动（`// [concierge]` 标注）：entityAI · combat.killCheck · movement（conciergeControlsPlayer）· special（X）· l5Hotel（存档 / stepConciergeWorld / conciergePress）· level（conciergeArrive）·
entities/humanoid（定义 + 图鉴）· spawns · types · items（key437）· codexScores · l5Staff · audio（电话 / 蹄声 / 啃 / 拉绳）· entitiesMesh · renderer · entityArchiveModel · archiveViews · HUD · HotelLedger · InventoryOverlay。

## 5. 验收
`npm run check:concierge`（74/74）· `npm run check:l5hotel`（179/179）· `npm run check:maid`（64/64）· `tsc` 通过。
截图：`reports/concierge/stage1*.jpg`（模型）、`stage2*.gif / *-sheet.jpg`（动画）、`stage3.jpg`（阶段 3 汇总，预览为主，见报告标注）。

## 6. 已知问题
- **LOD0 首次构建约 1.65 s 卡顿**：第一次走近 14 m 内同步生成 LOD0（SDF 提取 + 减面），会掉一次帧。可改为空闲时预生成或 Worker。
- **柜台碰撞在 AI 层推开玩家**（`pushOutDesk`），柜台不进 chunk 结构（避免流式重建 / 平移丢失），所以别的实体 / 投射物不会被柜台挡。
- **被捆时第一人称看不到身体**：被扑倒 / 捆绑 / 拖行只有镜头压低 + 挣脱条，玩家看不到自己被捆的身体和绳子。
- **外楼层临时升降梯无门洞**：别的楼层在整面墙上「贴」一台升降梯模型，墙体本身没有开洞。
- **直线移动靠眨眼脱困**：追踪 / 追逐 / 回岗走的是直线 stepEntity，没有寻路；卡住时靠视线外眨眼瞬移脱困（被一直盯着时可能原地顶墙）。
- **大屈膝时膝窝折痕**：bind / trip 等深蹲姿态下西裤膝窝仍有折痕（2.1 的辅助骨只缓解中等屈曲）。
- **电梯不算真出口是推断，可改**：设计稿只说「错误方向」，电梯不拦是按「酒店自己的」推断，改 `CC.trueExits` 即可。
- **（阶段 3 截图时新发现）拉绳对不上绳**：`pullRope` 假设绳在他正前方 0.3 m（预览用 `CONCIERGE_DUMBWAITER.pull` 摆位），
  但游戏里 stuff→pullRope 他和升降梯都不挪位，绳在升降梯侧边 —— 双手在他正前方 0.3 m 处空拉，真正的绳在侧前方（横向约 0.68 m、纵深约 0.56 m，合计近 0.9 m）。可在 phase 1 时把他侧移到拉绳前，或让 pullPose 吃一个绳子目标点。
- **（阶段 3 实机截图时新发现）1F 前台送菜升降梯埋在墙里**：`CG_DESK.lift` 的纵深 −0.78 m 比钥匙墙贴墙距离 0.75 m 还深 3 cm，实机只露出黄铜拉环和绳子，柜子 / 拉门看不见
  （拖到前台那台塞人时会像塞进墙里）。把 `CG_DESK.lift[1]` 改到约 −0.70（并同步 conciergeRender 里的 deskLift 摆位）即可，未改。
