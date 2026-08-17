# Backroom —— 后室 3D Roguelike 项目文档

> 基于当前代码库（v32 起，持续更新至 v58 + 联机模式）整理。本文档描述系统架构、层级/物品/现象/音频内容与开发者工具。
> 设定来源：Backrooms Wikidot（WD）+ Fandom（FD），代码内注释逐条标注出处。

---

## 1. 项目概述

第一人称后室生存探索游戏。玩家在 Level 0 的黄迷宫醒来，逐层下潜（L0 → L601「终点」），
收集 6 盘磁带揭开真相，在实体、停电、现象与成瘾的夹缝中求生。

- **技术栈**：Vite 7 + React 19 + TypeScript + 原生 three.js 0.185（无 react-three-fiber）
- **渲染**：`Renderer3D` 直接驱动 WebGL canvas；React 只做标题/HUD/背包/图鉴等 DOM 覆盖层
- **状态**：无 redux/zustand——`engine` 单例（`src/game/engine.ts`）通过 `engine.on(fn)`
  向 React 推送 `HudEvent`（**订阅必须调用返回的取消函数**，否则监听器累积导致播报重复）
- **运行**：`npm run dev` → http://localhost:3000/ ；`npm run build`（tsc + vite 权威校验）

## 2. 目录结构（app/src）

```
src/
├── main.tsx / App.tsx        # 入口 + 屏幕状态机（title→fall→intro→game）+ 覆盖层调度
├── components/               # HUD、背包/图鉴(InventoryOverlay)、设置、过场(Cutscene)、
│                             #   死亡/胜利屏、笔记本(NotebookOverlay)、文档(DocOverlay)、
│                             #   头像编辑器/预览、触屏控制、shadcn ui 库
└── game/
    ├── engine.ts (~690行)    # 核心组合根（v53 拆分）：全部状态字段、主循环 step()、
    │                         #   对外公共 API 门面（字段/方法名契约不变，委托 engine/ 子模块）
    ├── engine/               # v53：引擎机制分类拆分（逻辑自 engine.ts 逐语句搬运，行为不变）：
    │                         #   effects.ts 持续性效果/状态统一注册表 EFFECTS（33 项：id/默认值/
    │                         #   存档键/重置时机/tick 挂载点；runEffectTicks 驱动 step 顶部计时器组、
    │                         #   resetEffects 驱动 newRun/loadLevel 重置）/ save.ts 存档读写
    │                         #   （v54：4 槽位——br_save_slot1/2/3 手动槽 + br_save_auto 自动槽，旧档迁移槽 1）/
    │                         #   level.ts 层级切换与出口（loadLevel/takeExit/阶梯/据点往返/无限窗口平移）/
    │                         #   movement.ts 移动输入积分与垂直物理 / survival.ts 生存属性与现象判定 /
    │                         #   entityAI.ts 实体 AI 与感知 / combat.ts 战斗投掷击退与粒子 /
    │                         #   interact.ts 交互/容器/结构触发 / npc.ts NPC对话委托声望与杰瑞教化 /
    │                         #   inventory.ts 背包装备物品使用 / ambient.ts 现象与停电、氛围事件、视野 /
    │                         #   warehouse.ts v54：据点寄存仓库（阵营互通 48 栏，随存档持久）/
    │                         #   dev.ts 全部 dev API / shared.ts 难度定义
    ├── core/                 # 基础设施：
    │                         #   player.ts 固定子步积分 + 轴分离 AABB 碰撞（8 点采样）/
    │                         #   types.ts LevelDef / Structure / StructKind(153种) / LightSource 等 /
    │                         #   renderer3d.ts 兼容层（仅 re-export ../renderer）/ audio.ts（WebAudio 音频 + BGM）/
    │                         #   midi.ts（v56：SMF 解析 + 层级/团体曲目映射）/ rng.ts / storage.ts /
    │                         #   keybinds.ts / avatar.ts / llm.ts 可选 LLM API（OpenAI 兼容；
    │                         #   NPC 自由对话，失败回退预制）
    ├── world/                # 地图/世界生成：
    │                         #   mapgen.ts GameMap + 有限层生成 + 碰撞盒/高度/容器表 /
    │                         #   mapgenDeep.ts v23：L7–L11 与 L601 地形生成器（对 mapgen 仅 type-only 引用）/
    │                         #   mapgenOutpost.ts 据点生成器（Alpha 基地/商人之家/希波克拉底 - 1/
    │                         #   Tom 的餐馆/办公区EL3A(双层) 手工布局；无随机物品容器）/
    │                         #   infinite.ts 无限 chunk 框架 + L0 生成器（CS=32，5×5 窗口）/
    │                         #   infiniteL1.ts L1（7 区段）/ infiniteL2.ts L2（4 廊道变体；
    │                         #   世界坐标纯函数廊道网）/ infiniteL3.ts L3（v51：不规则廊道网 +
    │                         #   铁栅栏/栅栏门 + 双灯光变体）/ infiniteL4.ts L4 / infiniteL5.ts L5 /
    │                         #   infiniteL6.ts L6 双层苔原与地下廊网 / infiniteL7.ts L7 入口房间+四深度带海洋 /
    │                         #   infiniteRegistry.ts 无限层级注册表（避免循环依赖）
    ├── content/              # 内容/数据注册：
    │                         #   phenomena.ts 现象注册表（孤立效应/植殖癌/闪烁）/ docs.ts M.E.G. 文档注册表 /
    │                         #   items.ts 81 件物品定义 + 稀有度/后室物品标记 /
    │                         #   outposts.ts 据点注册表 / npcs.ts NPC 注册表（姓名/职业/性格/经历/对话树/交易）/
    │                         #   factions.ts 团体与声望 / codexScores.ts 图鉴评分与阵营字体 /
    │                         #   guide.ts 出口方向指引（HUD 箭头）纯函数计算 /
    │                         #   decorRegistry.ts v53：装饰物统一注册表（只读聚合；仓库根 DECORATIONS.md 由其生成）
    ├── levels/               # l0..l11 + l601 + lalpha/lbntg/lariane/ltom/lel3a(据点) + l274(杰瑞的房间) 纯数据 LevelDef；index.ts 汇总
    ├── entities/             # 36 种实体定义与 AI（含内部形态 vmad；v55 新增「疫疾」malady——无模型特殊实体，
    │                         #   图鉴可见 35；v53 删除绝缘猎手）+ spawns.ts（层级/威胁/稀有度派生表）
    ├── prefabs/              # 有限层预制房间
    ├── renderer/             # renderer.ts 主类 + structures(153种结构低模) +
    │                         #   geometry(地形烘焙) + entitiesMesh(实体)/itemsMesh(物品) +
    │                         #   viewmodel + playerModel + npcGear(NPC配饰,v40) + textures + liquidsSky +
    │                         #   decorations/(v53：氛围装饰——decals.ts 仅贴图贴花 / props.ts 无碰撞低模道具 /
    │                         #   context.ts 构建上下文 / index.ts buildDecorations 对外签名不变)
    ├── decorations/          # v53：装饰物数据——lore.ts(可查看装饰物文案注册表) + containers.ts(容器注册表)
    ├── design/               # v54：设计模式数据提取（DESIGN-GUIDE.md）——types.ts 设计 JSON 模型 /
    │                         #   extractLayouts.ts 布局提取（据点×7+变体×26+预制件×11）/
    │                         #   extractCodex.ts 图鉴文案提取（9 类）/ buildDesignFile.ts 导出组装
```

`public/music/`（v56）：BGM 的 .mid 文件——层级 13 首（l0~l11、l601）+ 团体 8 首
（meg/bntg/ariane/brc/wanderer/jerry/homely/originals）+ Tom 的餐馆专属 1 首（tom）。
层级曲目由外部作曲工作区
`generate_levels.py`（梦核电台 v2）生成，团体与 Tom 曲目由 `generate_factions.py` 生成（见 §3.10）；
本项目 `scripts/gen-midi-bgm.py` 为最早一版生成器（已被外部工作区取代，仅留档）。

## 3. 核心架构

### 3.1 无限 chunk 生成（L0–L7）

- **CS=32** 瓦片/chunk，**5×5 chunk 流式窗口**（WIN_R=2）；玩家跨 chunk 时窗口平移，
  旧 chunk 卸载（动态状态入 `ChunkDynState`：容器搜刮、门开关、掉落物、追加灯）。
- **共享边哈希缝合**：L0/L1 用 `edgeOpen(seed, vertical, a, b)` 两侧 chunk 对同一条边算出同一
  开口序列，天然连通；**L2 起改用「世界坐标纯函数」**（L2/L3 廊道网：廊道列 `l2CorrX(k)`/`l3CorrX(k)`、
  横道行 `l2RowY(r)`/`l3RowY(r)`；**L4 走廊网+街区群系**，v54），相邻 chunk 各自雕刻同一段廊道，天然对齐。
  `stitch()` 把 chunk 数组合并进窗口 GameMap（含 v41 新增 **crawl** 蹲伏通道数组与
  **v54 可选 outdoor 室外瓦片数组**——L4 窗景区窗外虚空；L6 地表写入 `tiles/outdoor/elev/terrain`，
  地下写入 `dn/dnWall`；**L7 全 chunk 为 liquid=1 深海**，入口房间与岩石岛局部清除液体）。
  楼层统一使用 `FloorBand = -1 | 0 | 1 | 2`，碰撞与高度查询集中在
  `walkableAt` / `wallAt` / `floorHeight`，其中 `-1` 为 L6 地下层。
- **生成器必须是纯函数**（同 seed+cx+cy 输出一致）；动态状态走 `data.sid` 持久化；
  L2 的房间/门/通道等跨 chunk 特征由「特征哈希」决定（`h32(seed, 槽位…)`），
  结构/实体按**锚点瓦片归属 chunk** 推送，不重复。
- 出口保底：L0/L1 每 8×8 chunk 超区域（RS=8）由 `regionHost` 选宿主 chunk 放 1 个出口；
  **L2 不用超区域**——消防出口直接替换门位（见 §3.3a）。
- v41：`GenChunk`/`LiveChunk` 新增 `crawl`（L2 扭曲的廊道横穿管道强制蹲伏；其余层恒 0）；
  raw 实体条目可带 `calm`（实例级被动——instantiate 浅拷贝 def 置 passive，L2 死亡飞蛾用）。

### 3.2 Level 0 变体（9 种）

迷宫 / 柱群 / 开阔 / 拱厅（安全屋，极小概率出滋水枪）/ 柱厅 / 深坑 / 熄灯区 /
马尼拉室（~1/31，米色墙纸，桌椅 + M.E.G. 文件夹 + **桌上 M.E.G. 文档**）/
红室（v34：到达红室 chunk 先 lore 播报预警；玩家真正走进红厅[瓦片 tint=2]才触发
红室蔓延 plague——理智 -15 + 震屏 + 全图变红，室内理智流失 ×2）。

### 3.3 Level 1 区段（7 种，`l1VariantOf`）

**变体聚集**（v34）：低频值噪声**群系图**（尺度 ~6 chunk，格点哈希 + smoothstep 插值）
决定基底变体——相同区段聚成有机团块，像不同群系；chunk 级 6% 异质（异质不出维护通廊）。
**边界规则**：非维护通廊之间默认无缝衔接（仅 ~20% 零星墙柱）；维护通廊之间**不设门**
（走廊槽位连通）；仅维护通廊与其他区段的邻边在共享门位开**恰一扇**墨黑色金属门。

| 区段                 | 概率                                              | 内容                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 天鹰段 parking       | ~32%（最常见，**(0,0) 出生 chunk 恒为它**） | 柱阵 + 废弃车辆 + 漏水水管/水洼                                                                                                                                                                                 |
| 过道 aisle           | 其余                                              | 开阔大厅 + 稀疏立柱                                                                                                                                                                                             |
| 跃金段 storage       | ~14%                                              | 高饱和金色 tint=7，板条箱成群，照明加密                                                                                                                                                                         |
| 哥特段 gothic        | ~7%                                               | 拱顶柱森林（v34：5 格规则柱网，粗圆柱柱顶喇叭展开 + 连拱板连成连续拱腹，新建模 vaultcol），暗暖光，极小概率出滋水枪                                                                                             |
| 衔尾段 ouroboros     | ~2.5%                                             | 永无止境的施工（v39 施工化）：灰色毛坯混凝土 + 补丁墙 + 深色裸露吊顶（tint=10/11），脚手架/红色管道/路障/建材碎料堆 debrispile，暖橙施工灯 keep 永亮；**BRC 员工 1~2 名在此施工**                         |
| 花园段 garden        | ~1%                                               | 青翠 tint=6 + 全覆盖立体草地（程序纹理交叉面片）+ 阳光 keep 灯；**植殖癌**                                                                                                                                |
| 维护通廊 maintenance | ~5.5%                                             | 整 chunk 2 宽迷宫走廊，白墙 keep 灯（停电避难所），墨黑门可交互开关；**v35 小径侧室**（45% 概率：小型办公室[桌+老旧电脑+昏灯] / 砖围狭室 / 大型医务室[病床+桌] / 橡胶房间[转椅] / 画作宽房[墙画+地板画]） |

### 3.3a Level 2「废弃公共带」廊道变体（4 种，`l2VariantOf`，v41 无限化重制）

**布局**：数条狭窄的**平行竖直（南北向）廊道**（可走净空 3 瓦片；狭窄感来自两侧贴墙机器壁龛），
间距很远（16~32 瓦片）；**横向（东西向）连廊**周期性出现（高 2，间距 20~36）把它们接通。
部分竖直廊道不贯穿某个区块——两端各留 10~18 瓦片 stub 作**尽头**（尽头前必有横道；
stub 过长会被钳制不穿横道）。所有 carved 地板经横道全连通（l2inf-smoke BFS 断言）。
走向全部由世界坐标纯函数决定，chunk 边界天然缝合。**变体聚集**同 L1 群系噪声（尺度 ~5 chunk，
6% 异质）；(0,0) 出生 chunk 恒为整洁的廊道，且必含 3 宽主廊道与 1 个消防出口。

| 变体              | 概率               | 内容                                                                                                                                                                 |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整洁的廊道 tidy   | ~30%（与晦暗等率） | 灯光明亮整齐（r4.5~5.5 冷白），部分机器正常运行（发光表盘/微光），tint=14 洁净                                                                                       |
| 晦暗的廊道 dim    | ~30%               | 灯多却昏暗（r2.2~2.8 低色温），管道墙面布满积灰 tint=13                                                                                                              |
| 肮脏的廊道 dirty  | ~26%（第三）       | 金属普遍生锈（tint=12 锈橙棕 + 结构 rust 变体），灯稀疏但每盏较亮暖光，地面散落 debrispile/scrap 碎石废金属，机器多为废弃状态（data.dead 暗色不发光），锈水洼        |
| 扭曲的廊道 warped | ~14%（最低）       | 灯光明暗不定、排列极不整齐（间距 2~13 随机聚集/分散、色彩混乱），**大小管道横穿廊道**——crawl=1 蹲伏低通道 + 下沉台阶（elev=1，stitch 自动双向坡道），tint=15 |

**墙壁与门**：廊道侧墙确定性门位（每廊道段几扇）。hoteldoor 支持 `data.hue`（0..4 颜色/材料各异）
与 `data.dbl`（双开门）。**大多数门锁死**（`data.sealed=1`——撬棍/万能钥匙/斧头全部无效，
交互提示「这扇门纹丝不动，锁的结构闻所未闻。」，焊死钢门建模）。v44：**未上锁门占比上调**
（门位类型 open 26%→39%，锁死类型 60%→47%；相当部分 open 槽位因连廊/房间/办公走廊退让规则
退化为锁死门，实测锁死 ~55% 仍占多数，l2inf-smoke 断言 ≥50%）。少数未上锁的门后是：
**横向连廊**（2 高双开门，通到相邻竖直廊道）或**大小各异的房间**——大设备房（maingen/boiler 群）、
补给间（crate/megcrate 带 loot + binshelf）、电脑房（**bigcomputer** 大号台式电脑：低柜+大机箱+
CRT 微光屏+键盘）、卧室（bed+table+officechair+充足灯光；**v45 ~8% 改生成信众宣传间**——见 §3.9
杰瑞的信众）、空房间。
**出口仅两类**：①**消防出口**（独特建模：绿色 EXIT 灯牌+金属防火门+钢制门框，走门类出口
嵌墙门洞通道）——替换 ~10% 未上锁的门，一半 `dest:'back'` 折返 Level 1、一半 `dest:3` 下行 Level 3；
②**办公走廊**（~4%，罕见）：某扇未上锁的门后是一条大量办公椅、L4 风墙面（tint=16）的走廊，
尽头 `officedoor` 出口 `dest:4`。

### 3.3b Level 2 实体规则（v41）

实体总密度低（~0.2 个/chunk，按变体 0.12~0.28 概率）。**肢团**最常见、**猎犬**较常见（池内权重 30/22）；
**笑魇**概率出现在黑暗廊道（肮脏/扭曲/晦暗低照度区，避开灯光落点）；**死亡飞蛾**极稀有且
**通常为被动小体型实例**（raw `calm` 标记 → instantiate 浅拷贝 def 置 passive，不主动攻击玩家；
v44 增 raw `scale: 0.6` 标记 → def.scale 渲染缩放——温顺飞蛾体积明显更小；被玩家攻击会反击，
被尸鼠攻击也会反击该尸鼠——`Entity.targetEnt` 实体对实体仇恨目标，见 §3.5）；
**无面灵**只生成于有家具的房间（binshelf/table/bigcomputer，40%）；**悲尸**小概率；
**窗户**（windowtrap 结构）仅罕见地出现在走廊尽头的墙上（stub 尽头 10%）；
**管道蠕虫**小概率**伪装成管道**（同瓦片放置一根普通 pipes 结构拟态，玩家近身才破土攻击）；
**尸鼠**（新实体 corpserat，critters.ts）：不主动攻击玩家；`hunts:['deathmoth']`——**实体对实体仇恨**，
主动猎杀附近的死亡飞蛾（engine  hunts 分支：9 格内有视线即追猎撕杀）；被玩家攻击后 `provoked` 反击；
v44 **群体激怒**：一只被激怒时周围 6m 内同伴一同激怒（`provokeRatPack`，攻击同一目标），
未激怒的尸鼠之后注意到 4m 内有同伴处于激怒状态也会加入围殴；
**窃皮者已从 L2 生成池移除**（「大停电」事件后销声匿迹——尸鼠失去唯一天敌，数量反升）；
v50 新增 **人制品售货机**（走廊尽头）与 **Nguithr'xurh**（天花板网囊）、**旱虾**（湿地）——见 §7.5。

### 3.3c Level 3「发电站」无限化重制（v51，`infiniteL3.ts`）

**布局**：不规则廊道网（世界坐标纯函数，chunk 边界天然缝合）——竖直（南北向）廊道列
`l3CorrX(k)`（名义间距 16 + 抖动 ±5，k=0 钉在 13），**段宽逐区块变化** `l3CorrW(k,r)` ∈
1~4（1=18% 一人宽砖砌隧道 / 2=42% / 3=28% / 4=12%；出生段保底 3~4）；横向连廊 `l3RowY(r)`
（名义间距 18 + 抖动 ±6，高 2~3）周期性接通；`l3Serve(k,r)` ~78% 贯穿（缺席段=廊道长短不一）。
**铁栅栏**（`l3FenceAt`）：竖直段 ~18% 被整段 `barfence` 封死（无门、不可破坏、不可通行——
另一侧可见不可达），~9% 为栅栏 + 1 宽可交互 `bargate`（data.open 开合 + solid 联动，
关门推人逻辑同 hoteldoor；已登记进 OPENABLE/DOORS/updateStructs 白名单/infinite 门态恢复）；
**v53b：门位钳制在 [1, W-2] 且仅 ≥3 宽段设门——栅栏门两侧必有链接墙壁的铁栅栏**
（1~2 宽段滚到门位降级为整段封死）；
出生安全区（|k|≤1 且 |r|≤1）与横道 ±5 格内不设栅栏。
**双灯光变体**（群系噪声聚集，尺度 ~5 chunk，`l3VariantOf`）：照明廊道 lit ~65%
（昏暗但整齐：5~7 格一盏 r3.0~3.6 冷白）/ 晦暗廊道 dark ~35%（14~22 格才一盏 r2.2~2.6）；
一人宽隧道覆盖为微弱灯光（8~14 格 r1.8）；出生 chunk 恒 lit。tint **18=lit / 19=dark**。
**墙面装饰**：`elecbox` 配电箱（mountOnWall 挂墙铁箱 + 指示灯光点 + 线管拐上天花板；
**可搜索容器**——CONTAINERS 登记，pool=battery/fuse/capacitor（注意：新容器种类还必须登记进
engine doInteract 的容器 case 列表，否则显示可交互但按键无响应——v51 修复）；
**附近有电流嗡鸣**——audio.setElecHum 常驻节点链，引擎逐帧按最近配电箱距离调音量，惯例同 scrape）与
`cables` 电缆线束（wallDir 贴墙：**水平横缆为主**——贴墙顶横贯瓦片 + 拐上天花板底面横伸，
竖向弯头仅 ~35% 瓦片带避免梯子感；生成器按**连续 4~8 格成排**布置，首尾相接成贯通长缆；
**v53b：装饰层墙脚/墙顶并行电缆束（gridCableRuns）贴墙化**——wallPropSpot 距墙 0.32m 的
家具摆位改沿墙法线推至距墙面 ~0.035m，贴地线缆不再悬空）；
宽廊道（≥3）侧墙偶有机器壁龛（generator/cabinet[loot]/pipes/valve，1 深 1~2 宽），≥2 宽廊道偶有
电缆沟 trench；晦暗区散落 debrispile/scrap/graffiti。
**大幅画作**（v53，新结构 `bigpainting`——类似标语海报但**贴图与尺寸均可自定义**：data.tex +
data.pw/data.ph 米制宽高）：wikidot L3「艺术品」——砖墙上覆盖白色画布状材质的来历不明画作，
~25% chunk（v53b 提高）一幅挂廊道砖墙（吹号天使/带翼骷髅/狂乱素描三张 PIL 贴图，
`scripts/gen-l3-artworks.py` 可复现）；**画布比例与贴图严格适配**（v53b：宽=高×贴图宽高比 0.8，
不拉伸）；**放置前强制校验**：跨度内每格背后皆墙、前方皆地板、
画前 ≥2 格净空、跨度内无既有结构（不压门洞不卡墙），离线断言 `.check/l3art-smoke.mts`；
**v53b 可交互「查看 大幅画作」**——先按贴图播报画作描述，再随机展开一页**笔记残页**
（wikidot L3 多页笔记纸转录 8 页，`content/docs.ts` L3_NOTES + L3_NOTE_IDS 注册，
DocOverlay note 风格 + **志莽行手书字体**，理智 -2）；
**开阔区**（`l3HallAt`，~7%/段）：竖直段侧墙贴附 6~10 深 × 5~9 长的小厅（与邻廊道间保底 2 格墙、
不与栅栏重叠、出生安全区除外），内含机器/容器/电缆沟/配电箱稀疏布置。
**四类特征房间（chunk 变种区段**，复用变种房间/区段机制——`l3VariantOf` 在群系 lit/dark 之前先 roll
（出生安全区除外）：**装配线 3.0%（wikidot：数量尤为突出）/ 发电室 1.6% / 锅炉房 1.6% /
圣所 0.5%（极小概率）**；进 rareVariants → DevPanel「本层固定结构 / 变种房间」原生传送 +
HUD 区域名显示；**相对封闭**：整 chunk 28×28 内厅 + 2 格围墙，廊道止于围墙外，
每条触及房间的廊道在围墙上开 1~2 宽门洞（50% 空洞 / 50% `bargate`[data.rot 东西墙变体]；
**v53b：bargate 仅落在 2 宽门洞——门扇一格 + 另一格 barfence 封死并连到墙环（门旁必有连墙铁栅栏），
1 宽门洞一律敞开**），
内容布置避开门口到房心的 2 宽走道；房间 chunk 跳过全部廊道特征（栅栏/小厅/壁龛/线盒散件）：

- **装配线**：3~4 列纵贯长传送带（conveyor 节段首尾相接 + 板材堆/三色箱变体）+ 每列上方成排
  factlamp 吊灯（**全房间最亮**）+ 墙边 worktable ×2~4 + 顶管排 + 2 处工具物品群
  （30% 附加杏仁水×2——wikidot「装配线中杏仁水瓶群集」）+ **额外 2~3 只实体**（实体知道人来这里）；
- **发电室**：maingen 居中 + 3~5 台发电机 + 2 跨 busbar 母线桥架 + 墙排 elecbox ×3~4 +
  四面墙 cables + warningsign ×2；杏仁水×2~3 + 火盐×2；昏暗冷调 + 主机蓝色微光点；
- **锅炉房**：sphboiler×2 + boiler×2 + 高位卧罐（pipes 墙式）+ 4~6 墙面管道丛林 +
  floordrain×2~3 + 黑液电缆沟 1~2 条（wikidot：锅炉房疑似产生管道黑液）；暖琥珀微光；
- **圣所**：**仅地板 tint 20（墙壁维持砖砌——wikidot 原设定）；tint 20 地板单独走 l3_marble
  灰白大理石贴图**（geometry 分网格合并），双列 pale 凹槽列柱成中殿（柱头已修复：
  echinus 喇叭板 + abacus 方板贴合柱顶与 4.2m 天花）+ fallencolumn 散落 +
  **angelstatue**（70% 房心 / 30% 尽端基座抬高，天使铜像坚不可摧）+
  墙边小雕像 + **2~4 幅 angel_fresco 宗教画作**（megposter data.tall 竖幅 + data.tex，
  PIL 程序绘制 `scripts/gen-angel-fresco.py`——wikidot：砖墙上的白色画布天使神祇画）+
  **2~4 扇彩色玻璃花窗**（v53b 新结构 `stainedglass`：石框尖拱 + 彩玻贴图背光微亮，
  红翼持天平/三天使吹号/金翼持心三张 PIL 贴图 `scripts/gen-l3-stainedglass.py`；
  data.tex/pw/ph 自定义、比例适配贴图 512:768；放置段刻意排在容器之后，
  跨度校验同大幅画作——背后皆墙/前方皆地板/无既有结构，l3art-smoke 强制圣所变体逐扇断言）；
  **零实体生成**；**实体恐惧范围=圣所 chunk 及其 8 邻域 chunk**（wikidot：实体甚至不会进入
  包含圣所入口的走廊）——踏入即强制逃向最近非圣所区域瓦片（移速 ×1.4、跳过攻击，
  wanderTarget 同步拒绝）；另：**栅栏后 1~3 格墙面 ~20% 挂 angel_fresco 画作**（25% 与雕像同现——
  wikidot：宗教画作大多位于栅栏之后）。
- **房间灯光**（v51 第四批，整齐充足）：全部按房间矩形网格对齐布灯——装配线灯带排 + 走道补光格
  （r3.5，全房间最亮）/ 发电室 5 格灯阵 r3.5 冷白 / 锅炉房 4 格灯阵 r3.2 琥珀 /
  圣所中殿单列烛光 + 雕像顶光 + **v53b 两侧副殿补灯**（x=5/CS-6 各一列 4 格间距暖光，全厅覆盖）；门洞补读图灯。
- **房间布局**（v51 第五批，真实机房布局替换填充机制——coverage/top-up 已删除，改为规范化布置）：
  **发电室**=中央 3 台 `turbinegen` 卧式发电机组（间距 2 格检修通道）+ 整面墙 `switchboard`
  配电盘排（表盘/指示灯/黑色断路器，各带 cabletray）+ 角落 `transformer` 变压器组（散热片+瓷瓶）+
  母线桥架横跨机组 + 电缆沟；**装配线**=≤3 组三列传送带银行 + 沿线每 4 格 `pressmachine`
  C 型冲压工位（面向带面）+ 端部工作台 + 墙边货架；**锅炉房**=6 格节距锅炉排（boiler/sphboiler
  交替、炉门朝同一清炉通道）+ 炉前 floordrain + 机组间隙 `feedpump` 给水泵 + 前墙 `manifold`
  集汽包（上升管/下行管）+ 三面墙 `piperack` 多层有序管架（不再散堆普通管道）。
  （旧版「覆盖率填充」机制已删除——房间密度来自规范化布局本身，校验仅保留门口走道畅通与全厅连通。）
  **栅栏后雕像**（`statue`）：整段封死（gate=-1）的栅栏段 ~22% 在栅栏后 1~3 格生成一尊
  **风化的希腊女像**（wikidot L3 雕像照片——大理石长袍女像立深色基座，data.dmg 三种残缺变体：
  双臂残桩/单臂残桩+斜首/无头颈桩；可「查看」lore，2.2m 交互半径故仅贴栅栏的可达，深处只能隔栏远观）。
  **物资全后室最富**：每 chunk 2~4 地面物品（def.items 池：保险丝 18/电池 12/绝缘服 8/瓶装闪电 8/
  门禁卡 3 + UNIVERSAL）+ 10% 磁带 + 1~2 loot 容器（cabinet/toolbox/locker/megcrate/safebox，
  仅放 ≥2 宽 lane 不堵一人宽隧道）+ ~15% chunk 角落火盐 + ~22% chunk 湿地 + 1~2 旱虾。
  **实体**：~38%/12% 一/两只，权重同 def.entities（arcwraith 16/smiler 12/clump 10 +
  v53 高智能实体：hound 8/faceling 7/deathmoth 6/skinstealer 5/corpserat 5/wretch 1；
  **v53 绝缘猎手（insulator）实体已删除**——定义/生成池/建模/近战减半特判/CECS 评分一并移除，绝缘服物品保留），
  笑魇只落无灯黑暗处，出生 chunk 不生成。
  **v53：L3 高智能实体**（wikidot Level 3 条目；chunk raw 标记 → instantiate 浅拷贝 def，不污染共享定义）：
  **猎犬**=伏击态（潜伏不动，玩家入视野且背对[viewAngle>1.2]才暴起；被直视即僵住）；
  **无面灵**=剥除被动转敌意（hostile 标记），~40% 持石器（tool：伤害+6、右手石锤建模），
  面部一律长出位置/数量错误的类眼耳鼻口器官（l3face，entitiesMesh 按实体 id 确定性排布）；
  **悲尸**=权重 1 极其罕见入池；**死亡飞蛾**=集群生成（2~4 只一小群）；
  **窃皮者**=伪装成流浪者（human 标记 → renderer buildPlayerModel 人形，14m 内径直走向玩家，2m 暴起）；
  **笑魇**=任何情况下都主动索敌攻击（L3 内无视 lightHunter 光照限制、不关灯退却）；
  **肢团**=追击 ×1.3 速且会转弯（持续追踪玩家本人而非冲撞最后声源点），体型 scale 1.2；
  **尸鼠**=水豚形态（capybara 建模变体 + scale 1.45），~9% chunk 地面设 **rattrap 捕兽夹**
  （新结构，非实心；玩家踩上 -5 HP+减速且被 14m 内尸鼠视为猎物[movement.ts]，
  实体踩上同样被夹伤并遭尸鼠群体追猎[entityAI.ts]，一次性 data.sprung）；
  **DevPanel 在 L3 召唤实体自动套用高智能变体**（entities/index.ts `applyL3Variant`，
  与 chunk raw 标记等价）；**尸鼠形态按层级固定**（v53 替代随机二选一——L2 灰白廊道种群 /
  L3 水豚 / 其余深褐，renderer 按 levelDef.id 传 ratMorph，L3 capybara 优先）；
  **图鉴 8 种实体 behavior 补记 L3 特性**（critters/humanoid/special/deep 各 def 文案）；
  mesh-smoke 新增三个变体建模断言。
  **出口**（v51 第三批：**仅保留电梯**——def.exits=[电梯→L4 / 电梯→L5] 两条 elevatorshaft，
  regionHost 50/50 随机，**均需 2 枚保险丝**；**嵌入墙内**：选廊道厚墙侧瓦片向墙内雕 1 格壁龛放置，
  geometry DOOR_EXIT_KINDS += elevatorshaft 开门洞，模型补门框且**门板凹入框前 0.12**；
  **双向电梯链路**：L4/L5 追加免费电梯出口（dest 3，**不占正常出口名额**——有限层出口 roll
  过滤后额外加放），takeExit 命中 elevatorshaft 时置 arriveElevator 标记，loadLevel 消费之
  把玩家出生在新层电梯旁（内存标记不入存档）。L2 消防出口 dest:3 入口不变。
  **贴图**（v51，SOURCES.md 登记）：l3_wall **ambientCG Bricks059**（CC0 真实砖墙照片，去色 +
  均值归一 0.72 + 轻积灰；本机 TLS 被截断需 `curl --tlsv1.2 -k`，缓存 scripts/.cache-l3/；
  程序生成版 gen_brick() 留作离线回退）+ **世界空间 UV**（WALL_UV_PER_M[3]=1，1 重复=1m——
  墙面不再是每瓦片整张映射导致的竖向拉伸竖砖，砖约 24×6.4cm 横砌清晰可辨）/
  l3_wall2 深色积灰砖变体 / l3_floor 积灰混凝土 / l3_ceil 积灰白天花板（Plaster006 派生，
  `scripts/gen-l3-textures.py` 可复现，palette 改暖灰砖调配合砖纹）。
  `gen:'grid'` 保留（墙高 4.2、电弧火花粒子、decorations case 'grid' 墙面走线装饰继续生效）；
  有限 grid 生成分支成为死代码（同 L2 pipes 先例）。

#### Level 3（v51~v54）

- 高智能实体八项：猎犬伏击、无面灵敌意+石器+错位面部器官、窃皮者伪装流浪者、笑魇无视光照索敌、肢团追踪转弯、死亡飞蛾集群、尸鼠水豚形态+捕兽夹、悲尸极稀有入池（v53）。
- 绝缘猎手（insulator）实体整体删除（定义/生成池/建模/特判/评分），绝缘服物品保留（v53）。
- 大幅画作 bigpainting（三张 PIL 贴图 + 可交互查看 + 笔记残页 8 页手书）与圣所彩色玻璃花窗 stainedglass（v53/v53b）。
- 栅栏门规则修正：bargate 仅落 ≥3 宽段 2 宽门洞且两侧必有连墙铁栅栏（v53b）。
- 装饰层墙脚/墙顶电缆束贴墙化（不再悬空）（v53b）。
- L3 出口加密：专属超区域 RS3=6（192m，密度 ×1.78，不复用 L0/L1 的 RS=8）（v54）。

### 3.3d Level 4「废弃办公室」无限化重制（v54，`infiniteL4.ts`）

**布局**：世界坐标纯函数走廊网——竖廊 `l4CorrX(k)`（3 宽，名义间距 20±3，k=0 钉在 13）+
横廊 `l4RowY(r)`（2 高，同间距），**全部贯穿**（不设缺席段）→ 天然全连通；走廊之间的
~14×15「街区」按**群系噪声聚集**（值噪声尺度 ~2 街区 + 6% 异质）分四区段：

- **办公间区 officehall ~30%**（出生街区恒定）：开阔大厅，两侧靠墙整齐排布办公隔间
  （cubicle 75% + officechair 60% 成排）；4 格灯网充足（r4.5 暖白）。
- **空旷区 open ~25%**：几乎无家具的大空间，1~2 根稀疏立柱；5 格灯网（仍充足）。
- **窗景区 windowview ~15%**（最少）：一侧整排半透玻璃窗（glasswin 新增 **data.deg 显式朝向**——
  窗格即窗洞、四邻无墙，框贴条带侧瓦片缘，跳过 mountOnWall；**data.rain 雨痕背板**——
  纯透明底 + 稀疏细亮痕程序纹理 opacity 0.3、玻璃 opacity 0.12——透过窗户能清楚看到外面），窗外 3 深 **outdoor 虚空条带**
  （GenChunk/LiveChunk/stitch 新增可选 outdoor 数组——无限层首个室外用例；雾灰天空盒为既有
  SKY_PROFILES[4]）；**灯网密度同其他区段**（4 格灯网）、**亮度略暗**（r2.9 冷白 ≈ 半径 ×0.65）+ 窗口 r6 天光，不留黑区。
  窗侧围墙不开门（否则门洞直通虚空——窗景仅观察不可达）。
  **v54b 虚空与雨雾**：def.id===4 的 outdoor 格不生成地板几何（天花板本就不画——真虚空只见雾灰天空）；
  虚空内 220 根雨丝 LineSegments 持续斜落微飘（**瓦片归属钳制**——出界即重生，不漏进窗内）+
  6 片径向渐变雾片缓慢漂移（**非边界虚空格锚定**，半宽+漂移严格小于到窗玻璃距离，窗内零穿透）；
  雨窗框体提亮至近墙色（data.rain 时 #9a948a，受光与邻墙一致）；
  structColliders 精确碰撞（data.deg 变体=贴瓦片缘薄墙板碰撞条、玻璃全高不可穿、消除整瓦空气墙）。
- **小房间区 smallrooms ~30%**：2×2 工作室/小办公室（内墙 + 每半墙 1 门洞互通）；
  **只有小房间有家具**（工位 v54c 二选一：desk[自带小屏幕]单独成位 / 简桌 table + bigcomputer
  大机组合——desk 不再紧邻 bigcomputer；40% cabinet/locker[loot] / 50% officechair[渲染层椅面朝桌——
  cubicle 已纳入 officechair 的「桌」类朝向判定]），每室一灯 r4。

**门**：街区北/西墙恒各 1 门洞、南/东各 35%，半数装 hoteldoor（hue 五色变体）；门洞坐标由
`blockOpenings` 世界纯函数统一决定（门规则自保证：沿墙两侧皆墙、穿墙两侧皆地板；**门洞避让
小房间内墙线** xm/ym——否则穿墙侧一邻是内墙，l4inf-smoke 曾抓到此违例）。
**出口链**（四类）：

- **电梯**（elevatorshaft，dest 3 免费回程）：每 8×8 超区域 1 槽位（regionHost）+ 出生 chunk
  保底 1 槽位。L4 全是 1 格薄墙（墙后必为房间），L3 的「墙内掏壁龛」法在此无点可挖——
  改**壁龛槽位法**（v54b）：槽位 = 宿主 chunk exitTarget 所在（或最近）街区的第一个**西/东门洞**
  （`l4ElevSlot` 世界纯函数；geometry 门洞开凿按 +x/-x 优先取邻墙，南北向壁龛会把门洞开到侧面墙，
  故只用东西向）；门洞格**雕开作 1 格壁龛**、房内背面格**回砌成墙**（房间让出 1 格成厚墙——
  出口嵌墙、门洞朝向的背面格必为墙，l4inf-smoke 逐槽位断言）；**槽位归属哪个 chunk 就由哪个
  chunk 推出口**（区域边界穿行也恰 1 个）；v51 arriveElevator 双向链路不变——L3 乘梯来 L4
  落 L4 电梯旁（出生 chunk 保底槽位即在出生点旁），返回落 L3 电梯旁。
  **v54b 朝向修复**：orientExitFaceFloor 改按壁龛贯穿轴定向（地板邻格+背面非地板+垂直向皆墙——
  旧实现取第一个地板邻格，出生广场啃穿西墙时壁龛侧邻变地板、门脸朝侧面；出生广场已收缩到 x≤15，
  l4inf-smoke 逐槽位断言贯穿轴垂直向皆墙）；古典楼梯护栏落地（stairrail 仅碰撞结构，见 §4/§5）。
- **~~假楼梯~~（v54b 已删除）**：fakestairsup/down 的生成与同层互传逻辑（updateStairs 分支、
  engine transition.teleport 字段与各登记点）已整体移除——L4 的楼梯出口只保留古典楼梯。
- **年久失修的古典楼梯**（oldstairs）：**L4 唯一楼梯出口**——8×8 超区域 ~55% 宿主 1 部（v54c 上调），
  走到底正常 takeExit **通往 Level 5**；独特建模（深色木踏步自井口缘起坡——楼板实体段内无踏步、
  不再卡进地板；**井口地板高度围合护栏**：两侧扶手 + 雕花栏杆柱[第 5 根朽坏缺失] + 尽头横栏 +
  入梯口端柱车木圆头——取代旧的顺坡斜置错位扶手）；**护栏碰撞**（v54b 新结构 stairrail——
  仅碰撞无模型，structColliders 细条：洞口两侧栏杆 + 尽头横栏 FULL_BLOCK，入梯口留在楼梯格两侧——
  玩家不能穿过护栏跌入井口）。
- **年久失修的活板门**（trapdoor，新 exit kind）：小房间每室 ~1.5%（锚点唯一候选——
  不归本 chunk 即由所属 chunk 放置，不得逐 chunk 重掷）；落地式建模（旧木框 + 微翘盖板 +
  铁环拉手 + 缝隙漆黑），**非嵌墙——不入 DOOR_EXIT_KINDS**；E 交互坠入 Level 6（fall 演出，
  fallDamage 10）。
  **雨声**：`audio.startRain/stopRain`——程序合成常驻雨声（低通雨幕底噪 + 带通 2.4kHz 雨打密响
  [0.09Hz LFO 雨势起伏] + 高通 5kHz 窗玻璃嘶声），loadLevel 按 id===4 驱动，离层/死亡/通关/
  退标题即停（惯例同 startHum/setElecHum）。
  **物资**：杏仁水权重 40 **全后室最高**（v54b 再上调；UNIVERSAL 池杏仁水 18 次之）；每 chunk 2~3 地面物品。
**自动售货机**（v54b，wikidot L4 设定）：办公间区 ~30%/街区（北/西墙边）、小房间区 ~15%/街区——
data.trade 机**免费取用**（不再收磁带），**每次出货后 25% 概率卡死**（data.jammed=1，之后不可用；
全程风味文本呈现，不写机制数值）；产出大概率杏仁水/罐装食品/咖啡，小概率腰果水/幸运豆奶。
  **实体**：几乎不生成——~1.2%/chunk 一只，池仅猎犬/钝人（官方仅确认两种），出生安全区
  （|cx|,|cy|≤1）不生成。
  **杂项**：l4.ts palette 改亮办公调 + lightSoft 1.3；有限 office 生成分支留作死代码
  （同 L2 pipes / L3 grid 先例）；design 模式 VARIANT_GEN[4] + L4_RULES + L4_RAND_* 表
  （design-smoke 变体计数 26→30）；离线校验 `.check/l4inf-smoke.mts` 全绿。
**v54c 修复**：出生小广场误伤墙线（plaza 整段删除——出生点恒在竖廊 k=0 内）；电梯壁龛背面
封死（geometry 对 L4 elevatorshaft 不开背面门洞，房内不再看见门板透出）；古典楼梯 stairrail
碰撞补世界坐标锚定 + 登梯判定收紧（井口段 |latS|≤0.5，隔栏不再被吸入）+ 宿主率 40%→55%；
Omega 基地（id 109）加入注册链——见 §3.9。

#### v54 杂项·Level 4
- Level 4 无限化重制（走廊网+四区段、雨声、古典楼梯/活板门/嵌墙电梯出口链；v54b 假楼梯已删）——见 §3.3d。

### 3.3e Level 5「恐怖酒店」无限化重制（v54，`infiniteL5.ts`）

**布局**（v55 大厅跨 chunk 重排）：世界坐标纯函数走廊网——竖廊 `l5CorrX(k)`（3 宽，名义间距 20±3，k=0 钉在 13）+
横廊 `l5RowY(r)`（2 高），全部贯穿；**大厅格层**（`l5HallAt`/`l5HallRect`/`l5HallOpenings`——2×2 街区合并为大厅格，
~50% 格为大厅，矩形实测 ≥30×30 跨多 chunk，各 chunk 各雕天然缝合；出生格恒主厅）+ 房间街区层分**九变体**。
大厅每侧 2 门洞共 8 个（第 1 口装门[北恒装/其余 50%]、第 2 口恒敞开；贝弗莉 8 口全敞；电梯壁龛占西/东第 1 口）——
多门多走廊口，走廊网把大厅串起来。区域判定 `l5RegionAt(seed,wx,wy)`（大厅格矩形含墙环→房间街区→走廊返回 null）——
HUD 区域名（id===5 分派，走廊显示「红地毯走廊」）与 DevPanel 传送落点（区域矩形中心）均按它；
L5_RARE_VARIANTS 九变体全列（传送页/图鉴可读全部九种）。1930 年代酒店、红金 palette（lightSoft 1.2）、
环境干净精致；**单层**（无 up/up2/outdoor——重制删除旧 L5 户外场景与多层结构），主厅保留挑高
（**GenChunk/LiveChunk 新增可选 `ceiling`/`liquid` 数组并经 stitch 缝合**——无限层首个挑高/液体用例）。
**四类大厅**（chunk 变体大房间，L3 特征房间机制）：

- **主厅 mainhall**：挑高 ceiling=1、**redpillar 红大理石金柱头方柱（新结构，v55）**、
  **ceilingbeam 装饰横梁 ×2（新结构，v55）**、水晶吊灯（v55 细化：三层金环+双层水晶挂坠+垂珠链）、
  古董 sofa/茶几/planter、北/南墙 photo 照片墙（哈希多变种）、中央多层地毯（rug data.layer 叠放）、
  金框大门；**电梯嵌墙槽位在主厅墙**（见出口链）。
- **贝弗莉室 beverly**（~9%，rare）：极宽敞空旷大厅 + 中央小桌（桌面小件）+ 巨吊灯 +
  四面墙全开门洞（blockOpenings 对 beverly 强制全开）。
- **维修大厅 maintenance**（~18%）：现代维修区——lightgrid 灯板/piperack/cabletray/busbar/cabinet、冷白亮灯。
- **餐厅 dining**（~22%）：dtable 白桌布餐桌阵列 + 吊灯×2 + 舞台角（桌+烛台拼件）。

**五类房间**（走廊两侧小房间）：

- **锅炉房 boilerroom**（~1%）：piperack/pipes/manifold/boiler/sphboiler/valve 管道丛林 + 琥珀稀疏暖灯；
  **深处完全黑暗的门 → Level 6**（boilerdeep：5 格内不设灯；焦黑门框+纯黑门洞模型，orientExitToWall 贴墙）。
  **v55 锅炉房改造**：群系噪声加聚集规则（邻片链式随迁，相邻成片）；房间可无墙——大型机器（boiler dead 交替列）
  当代墙阻隔视线与通行；**每片恰一扇黑门且贴墙/贴机器放置**（l5BoilerRoot 片根判定，不再出现房间中央）。
- **休息室 lounge**（~6%）：sofa/loungechair/table + **phonograph 留声机（新结构）** + candlestand。
- **健身房 gym**（~3%）：**gymbench 卧推凳（新结构）** + locker 排 + lightgrid 冷白。
- **游泳池 pool**（~2%，rare）：liquid 浅水 2/深水 1 + 湿区 + **poolladder×2 + divingboard 跳台（新结构）**。
- **客房 guestroom**（~27%）：2×2 小房间 bed/dresser(loot)/table/loungechair；房门 75% hoteldoor、
  25% data.locked 上锁可撬（**L5 既有房门锁机制原样保留**）。

**连通**：门洞北/西恒开、南/东 35%；门洞正前方格与客房内门前格禁放实心家具（libshelf 堵门致整厅孤岛的
真 bug 已修）；窗口 BFS 全连通（边缘截断分量按伪影豁免——实机窗口随玩家平移）。
**出口链**（四类）：

- **电梯**（elevatorshaft，dest 3）：`l5ElevSlot`/`l5SpawnElevSlot` 只取**主厅街区**西/东门洞雕壁龛
  （房内背面格回砌成墙），regionHost 8×8 超区域 1 槽位 + 出生 chunk 保底；geometry 的 L4 壁龛背面封死
  豁免扩展到 id 5；v51 arriveElevator 双向链不变（L3 乘梯来 L5 落保底槽位旁，返程落 L3 电梯旁）。
- **古典楼梯**（oldstairs，dest 4）：8×8 超区域 55% 宿主 + 出生 chunk 保底 1 部；新增引擎标记
  `arriveOldstairs`（engine 字段 + takeExit 置位 + loadLevel 消费，仅 id===5、不入存档）——
  **L4→L5 抵达落在楼梯切比雪夫 2~4 格环的第一可站空旷地板**（l5inf-smoke 断言落点存在）。
- **锅炉房深处暗门**（boilerdeep，dest 6）：见上。
- **深色木门**（darkwooddoor，dest 9，新 exit kind）：客房房门掷点 **~0.5%**（v55 由 ~2% 下调）替代正常房门
  （深色虚掩木门+门后纯黑模型，orientExitFaceFloor；E 交互走通用出口链路）；**v55：背面为墙色盖板+踢脚线根
  （门后看是一堵墙）、关闭时不可穿（darkdoorblock 仅碰撞结构）**；l5inf-smoke 断言概率区间 0.1%~2%（实测 0.7%）。

**实体低密度**（v55 定稿）：池五种——deathmoth（**集群**：1~3 只伴生落首领 3 格内，主巢另 50% 带伴生）/
hound/skinstealer（**human 伪装=L5 酒店侍者形象**：酒红夹克+黑裤+皮靴，humanDisguiseMesh 按 levelId 分派）/
**corpserat 正装变种**（ratMorph 加 'hotel'：深褐底+小西装黑马甲+白衬衫襟+酒红领结，levelDef.id===5 选取）/
nguithr（移除 smiler/bellhop/mirrorself）——密度 0.6%+0.25% 单列，实测 ~1.5%/chunk、安全区为零、不落水面。
**v55 二轮深化**：贝弗莉室/餐厅同挑高（三厅各 896 格 ceiling=1）；挑高区无限 chunk 灯具盒贴
tallCeilH 真实顶（buildInfiniteChunk fixY 对齐点光源 ptY 规则）；chandelier 短链贴顶（0.34m）；
房门门楣薄墙封到顶（门框上沿 2.27m→本瓦片天花底，挑高/多层自适应）；主厅/走廊挂古典肖像画
（gen-l5-portraits.py PIL 三张：贵族/夫妇/骑马像，bigpainting 机制）+ 风景油画变体扩充；
墙裙/腰线防共面偏移修 z-fight（裙板凸 5mm、腰线凸 2cm）；L5 table 古典化（胡桃木/弯腿/雕花沿，
轮廓碰撞不变）；全黑暗门率 0.5%→0.3% + 专属建模（深黑无反射门板+暗晕虚边）；主厅桌上花瓶
（table data.vase）+四角 planter（planter 重建：收分盆体/泥土/三层交叉叶）；锅炉房/维修大厅
装饰梯 + 维修大厅员工门（hoteldoor+「员工专用」wallsign+warningsign）；主厅 sconce 壁灯同位
fixZ 暖光（noFix，模型即灯具）；主厅门旁金色房号牌（wallsign data.gold，坐标哈希房号）；
贝弗莉入口银色「Beverly Room」标牌 + 中心换 oddtable 异形桌（歪扭腿+桌面饮料瓶+麻将牌墙/舍牌堆）；
锅炉房加 furnace 熔炉（炉膛微光/烟道）且街区缩小为厚墙小室；健身房加 treadmill/dumbbellrack/spinbike；
**留声机深化**：建模重建（柜座/唱盘/唱臂/曲柄/多节黄铜喇叭）+ 唱盘持续旋转（updateStructs）+
audio.setPhono 程序合成诡异圆舞曲（A 小调 3/4 八音盒音色+走调失谐+唱片底噪，按最近留声机距离衰减、
近场闪避 BGM 75%）+ E 交互停播/恢复（data.on，ChunkDynState 持久化）；休息室桌上饮料可交互
（data.drink，E 取一瓶随机饮料[杏仁水/咖啡/幸运豆奶/腰果水/液态痛苦]五种风味文本，取走不再出）。
**v55 三轮**：留声机碰撞错位修复（纳入 structColliders 柜类贴墙清单，与 flushToWall 位移对齐）；
主厅贴墙件统一 wallUsed 占位集互斥（bigpainting 跨度内无其他贴墙件）；interact bigpainting 分支按层级
分派（L3 笔记残页保留，L5 肖像各自描述文案不给文档）；oddtable 放大居中（贝弗莉矩形几何中心，桌面
1.3×1.05/7 瓶/双牌墙/8 舍牌）；吊灯配套 r≥8 大半径暖光（fixZ/noFix，模型即灯具）；三厅/泳池灯光加密；
主厅配电柜类移除（换 planter/sofa 装饰列）；sconce 重建（壁挂托座/双外弯烛枝/蜡烛/双层火苗 glow）。
**v55 四轮（修缮+性能）**：大厅跨走廊线围墙环显式回砌修贴墙件浮空（422 件全贴墙，smoke 断言）；
pipes 碰撞细化（贴墙管群改 0.28 深思墙侧碰撞条让出通行/蹲行净宽、横穿管按管径分盒[大管顶 1.18/小管顶 0.71]）；
锅炉房取消 boiler 代墙（回砌厚墙小室、机器只作内容，片内 BFS 可走遍断言）；黑门贴墙安装
（orientExitToWall dist 0.93，门框前缘微凸墙面）；foldladder 折叠梯新结构（替换锅炉房/维修大厅装饰梯）；
留声机喇叭细化（曲颈两节/外翻双层沿）。**性能**（L5 结构 1363/实心 700 明显掉帧→不改行为优化）：
updateStructs 按 ANIM_STRUCT 预登记过滤（23.4→2.3µs/帧，10×）；structBlocksPoint/structStandTopAt/
solidStructAtFloor 无限层走瓦片桶空间索引（3.06→0.27µs/次，11×；3 万点新旧逐点一致）——
**仅无限层运行时启用**（有限层生成期增删结构会致索引失效，Gemma 曾因此 32 格不可达）；
计时脚本 .check/v55-perf.mts。
**v55 走廊精致化**：走廊地面 tint 21 无缝酒红锦缎地毯（geometry carpetGeos 独立网格、0.75m 世界 UV 连续平铺；
Poly Haven + ambientCG CC0 真实 PBR 漫反射/法线/粗糙度）+
奶白墙裙（0.16~0.85m）+金色腰线（0.85~0.92m 微凸）+lightgrid 灯带每 4 格；房间分色 tint 22 暖毯/23 泳池瓷砖/
24 锅炉房深色/25 维修灰金属/26 健身灰蓝；踢脚线白名单加 id 5。**v55 地毯装饰**：新结构 rug（地面平铺贴花，
data.tex/data.layer；跨 chunk 统一 pushClipped 裁剪推送）——仅大厅/房间使用独立地毯块；走廊直接使用单层连续地形地毯，
不再叠加横竖 runner（修复连接处共面穿模与长宽拉伸）；泳池贴图 l5_tile 由 scripts/gen-l5-textures.py 可复现。
**v55 床类朝向**（全层级）：共享助手 bedHeadDeg（infiniteRegistry）——床头朝墙、床尾朝房间（data.deg 优先；
三种床模型床头在局部 -z，渲染层按 deg+180 旋转）；覆盖有限层/据点/预制件后处理 + infiniteL1~L5 各放置点；
outpost-smoke（37 张床）与 l5inf-smoke（181 张客房床）断言。**杂项**：l5.ts 改 infinite:true（palette 微调红金、lightSoft 1.2）；有限 hotel 生成分支留死代码
（同 L2/L3/L4 先例）；design 模式 VARIANT_GEN[5] + L5_RULES（18 条）+ L5_RAND_* 表（design-smoke
变体计数 30→39）；离线校验 `.check/l5inf-smoke.mts`（14 项断言）全绿。

#### v54 批次（L5 无限化重制）

- Level 5 重制为无限生成 1930 年代酒店综合楼（infiniteL5.ts，CS=32 纯函数、世界坐标哈希缝合）：
  九变体街区群系（主厅/贝弗莉室/维修大厅/餐厅 + 客房/休息室/健身房/泳池/锅炉房），单层无户外、
  主厅挑高（GenChunk/LiveChunk 新增可选 ceiling/liquid 数组经 stitch 缝合——无限层首例）——详见 §3.3e。
- 出口链：电梯嵌主厅墙 dest 3（arriveElevator 双向链不变）、古典楼梯 dest 4（新增 arriveOldstairs
  落点机制：L4→L5 落在楼梯 2~4 格环空旷地板）、锅炉房暗门 dest 6、深色木门 ~2% dest 9（新 exit kind）。
- 新结构 ×4：phonograph 留声机 / poolladder 泳池扶梯 / divingboard 跳台（板面可站）/ gymbench 卧推凳
  （凳面可站）——StructKind+建模+structColliders+decorRegistry+DECORATIONS.md+mesh-smoke KINDS 全套
  （结构 164 种）；DECORATIONS.md 顺把 finite-only 死代码件（mirror/ballroom/frontdesk/glassdoor/hotelwindow）标「—（未生成）」。
- 实体低密度（~1.6%/chunk，死亡飞蛾占比最高；池 hound/smiler/skinstealer/deathmoth，移除 bellhop/mirrorself）。
- 新 .check/l5inf-smoke.mts（14 项断言）；design-smoke 变体计数 30→39；terrain-smoke 覆盖 id 5。

#### v55 批次（L5 大厅化与精致化）

- L5 大厅改跨 chunk 大房间（大厅格层 l5HallAt/l5HallRect，2×2 街区合并、≥30×30、每侧 2 门洞共 8 个），
  走廊网串起大厅；区域判定 l5RegionAt 对齐实际矩形（HUD 区域名/DevPanel 九变体传送落点）。
- 走廊精致化：无缝酒红锦缎地毯（tint 21 独立网格）+奶白墙裙+金腰线+整齐灯带；房间分色 tint ×5；
  踢脚线加 id 5；rug 仅用于厅房整齐地毯块（pushClipped 跨 chunk 裁剪），走廊不叠加 runner。
- 主厅内饰：redpillar 红大理石金头柱、ceilingbeam 横梁、chandelier 细化（三层金环+水晶挂坠）、照片墙、多层地毯。
- 深色木门削弱：率 2%→0.5%、背面墙化、darkdoorblock 碰撞（关闭不可穿）。
- 床类全层级床头靠墙（bedHeadDeg 助手；有限层/据点/预制件后处理 + infiniteL1~L5；双重断言）。
- 新结构：rug/redpillar/ceilingbeam/darkdoorblock（168 种建模全过）；地毯改用 CC0 真实 PBR 材质，l5_tile 由 PIL 可复现。

#### v55 批次·二（L5 二十项深化）

- 挑高体系：贝弗莉/餐厅同挑高；无限 chunk 灯具盒贴 tallCeilH；chandelier 短链贴顶；房门门楣封墙到顶。
- 装饰：古典肖像画 ×3（gen-l5-portraits.py）+风景画变体；主厅照片墙/花瓶/planter 重建/sconce 配光/
  金色房号牌；贝弗莉银标牌 + oddtable 异形桌（饮料+麻将）；员工门+标牌；装饰梯进锅炉房/维修大厅。
- 新结构 ×7：oddtable/furnace/treadmill/dumbbellrack/spinbike/wallsign（+table data.vase 小件）；
  结构总数 174。防 z-fight：墙裙/腰线/地毯偏移修正。
- 留声机：建模重建+唱盘旋转动画+程序合成诡异圆舞曲（距离衰减/BGM 闪避）+E 交互停播恢复（持久化）。
- 休息室桌上饮料可交互（五种饮料权重随机+风味文本，一次性）；黑门率 0.3%+专属黑门建模；锅炉房缩小+熔炉。

#### v55 批次·三（L5 实体池/锅炉房聚集/灯光与贴墙修缮）

- L5 实体池定稿：deathmoth 集群（1~3 只伴生）/hound/skinstealer（human 伪装=酒店侍者制服形象）/
  corpserat 正装变种（ratMorph 'hotel'：小西装+领结）/nguithr；密度 ~1.5%/chunk 保持很低。
- 锅炉房聚集成片 + 机器当隔墙 + 每片恰一扇黑门且贴墙；留声机碰撞错位修复（structColliders 柜类贴墙清单）。
- 主厅贴墙件互斥（wallUsed 占位集）；L5 大幅画作交互不再给 L3 笔记（各自肖像描述文案）。
- oddtable 放大居中；吊灯 r≥8 大半径暖光贴附；三厅/泳池灯光加密；主厅配电柜移除换装饰列；
  sconce 烛台重建（托座/烛枝/双层火苗 glow）。

#### v55 批次·四（L5 修缮 + 性能优化）

- 贴墙件浮空根因修复：2×2 合并大厅横跨走廊线、走廊雕刻把大厅围墙环穿出缺口——生成时围墙环显式回砌
  （门洞/电梯壁龛除外）+ 装饰避让门洞；422 件贴墙件全部邻墙（l5inf 断言）。
- 性能：updateStructs 动画件预登记过滤（23.4→2.3µs/帧）+ 结构碰撞瓦片桶空间索引（3.06→0.27µs/次，
  仅无限层启用——有限层生成期索引失效踩坑记录见 §6）；.check/v55-perf.mts 对比脚本。
- pipes 碰撞细化（贴墙管群让出通行/蹲行净宽、横穿管按管径分盒）；foldladder 折叠梯新结构替换装饰梯；
  锅炉房取消机器代墙（回砌小室、片内 BFS 可走遍）；黑门贴墙安装（orientExitToWall dist 参数）；
  留声机喇叭细化（曲颈/外翻双层沿）。

#### v55 批次·五（喇叭/折叠梯/黑门重修）

- phonograph 喇叭重做：旧版各段独立手写旋转轴/定位致段间轴线不共线、裂成两瓣蚌壳——重做为一根轴向
  统一的整体漏斗（4 段圆台沿「前+上」轴堆叠、段间 15% 重叠闭合、口沿外翻唇、曲颈前弯接尾端）。
- foldladder 人字梯重做：前后架按 atan 对称倾斜、4 级踏板严格水平等距嵌于斜杆间、顶部铰链横管+
  顶台贴铰链下沿、四足齐地。
- 黑门嵌墙根因：boilerdeep 不在 geometry 门洞开凿名单（DOOR_EXIT_KINDS）——墙盒完整，模型贴墙外侧
  必被墙盒挡住；修正为纳入 DOOR_EXIT_KINDS（墙盒开门洞+门楣封到顶）、renderer 朝向分派改走 orientDoor
  （组放门洞墙格中心、开口朝出口格，同 fireexit/unlockeddoor 约定）。
- 离线自检 .check/l5-models.mts（真实 three 逐件世界 AABB：喇叭段连续链/开口朝前上/曲颈衔接、
  折叠梯四足齐地/踏板水平/顶台贴铰链、黑门 kind 在门洞开凿名单）。

#### v56 九轮（Level 5 金红地毯与卡顿优化）

- L5 地毯改为统一的深酒红 + 古金卷草纹：按用户酒店走廊参考图生成顶视织毯颜色图，镜像周期化为
  1K 无缝贴图；走廊 tint 21 与主厅/客房 rug 共用 `l5_carpet.jpg`，取消蓝色地毯引用，并继续复用
  Carpet015 的 CC0 纤维法线/粗糙度图。
- L5 无限窗口区块改为按玩家距离每帧只构建 1 个，消除首次进入同一帧构建完整 5×5 窗口的长卡顿；
  静态结构从逐帧动画 Map 中彻底剥离，仅门/容器/电梯/留声机等登记动画。
- 灯光热路径复用排序/强度/灯池缓冲并以平方距离排序，减少每帧临时分配与开平方；WebGL 上下文从
  `low-power` 改为 `high-performance`（浏览器提示而非强制提频）。设置→画面新增「高性能预设」，一键
  开动态分辨率并关闭阴影、远处灯光与后处理；L5 动态分辨率最低可降到 50%。
- **地表反射校正**：L5 金红地毯改为零环境反射、roughness=1，并移除纤维法线/粗糙度辅图，走廊
  tint 与独立 rug 同步压低乘色，不再在密集酒店灯下比硬地板更亮；环境反射改按材质分配给据点瓷砖
  （101/102/103/106）、L5 泳池釉面砖、L3 大理石与较弱的石板地面（108/274），普通地面保持哑光。
- **L3 红黄砖墙立体化**：默认/暗区墙面统一换成暗砖红、陶土橙与赭黄烧结砖，暖灰棕灰浆；颜色图
  经镜像周期化并继续走 1m 世界 UV。新增同相位 OpenGL 法线与粗糙度图，经典/真实光影均由砖缝法线
  响应局部灯光；真实模式仅给 0.2 的低强度环境反射和高粗糙度，砖棱有柔和高光而整墙不塑料发亮。
- **L3 砖墙比例/亮度修正**：无缝图实际约 10 砖宽，世界 UV 从 1 降至 0.45 重复/m，使横砖由约
  10cm 放大到约 22cm；墙面乘色由暖棕提到浅陶土色，暗区变体压暗幅度由 0.64 收至 0.78，保留
  危险区明暗差异但不再呈现细密、近黑的砖墙。

### 3.3f Level 6「熄灯」无限双层重制（`infiniteL6.ts`）

- 地表为近黑天空下的无限苔原：`tiles/outdoor/elev` 全量生成，`terrain` 以世界坐标低频噪声形成连续、微弱的自然起伏；
  群系地色按苔原/灰褐枯林/病态橄榄草原区分，枯林密集生成 4~7m 大型无叶枯木，恶臭草地改为宽幅密集草丛；
  巨石、晶簇、塌陷深坑与方尖碑按确定性区域哈希分布。深坑坠落会切换至地下层。
- 地下使用 `dn/dnWall` 保存全局连通的交叉廊网，层高 -5~-2m；墙地接入 Poly Haven CC0 剥落灰泥/污损混凝土
  颜色、OpenGL 法线与粗糙度贴图，灰绿色调表现发霉破败质感，并布置锈蚀管道与刻痕，无实体生成。
- L5 锅炉房黑门抵达地下；L4 活板门和 Omega 基地旧活板门抵达地表出生楼梯井。废弃楼梯井支持双向切层，
  每个 8×8 chunk 稀疏区域固定一处地表深海锈蚀活板门通往 L7、一处地下天然洞口通往 L8；生成器与解析式定位器
  共用宿主种子并按 `FloorBand` 定位，切层统一播放短暂黑场过场。
- 人造照明与关卡 BGM 在 L6 失效；地表材质无自发光，天空盒为厚云遮蔽的低月近黑夜空。进入后按约 8s 时间常数进行
  人眼暗适应（约 18s 达 90%），逐渐恢复更明确但仍微弱的月光/环境轮廓而非直接提亮地面，并低概率播放远处鸟鸣/风声幻听。L6 黑暗理智流失固定为
  0.1/s（不受手电状态影响）；其余层黑暗为 0.75/s，黑暗中开启手电为 0.25/s。
- L6 地下层 -5m 明确豁免普通层 `z < -4.5` 深坑死亡规则；地表坑先执行地下安全落点切换，流式窗口平移后重算瓦片索引，
  防止窗口边缘深坑漏判并打开死亡结算。
- 离线校验 `scripts/smoke-l6-world.mts` 覆盖无限标记、双层数组、入口楼梯井、跨 chunk 纯函数缝合、地下碰撞、
  地形起伏、双楼层出口生成/解析、地下存活、深坑切层、夜视耗电与跨类别准星交互优先级。
- 严格交互校验 `scripts/smoke-interact-strict.mts` 覆盖高大地标可见上缘命中、模型外俯仰硬门槛、贴身隔墙拒绝、低矮结构上方三维视线、
  地表/上层/地下各自墙体 LOS、大物体表面距离、杰瑞与人制品售货机跨层过滤，以及执行阶段目标失效。

#### v56 十轮（L6 开发者照明与夜视装备）

- 修复开发者面板「一键照明」在 L6 仍被暗适应曝光压低的问题：开启时直接恢复用户曝光基准，
  同时保留既有环境光、半球光与雾距强制增亮。
- 新增头饰装备「夜视眼镜」：被动放大暗部微光，不生成实际光源；在 L6 叠加有限曝光、
  冷绿色环境轮廓与暗适应，在普通熄灯区也保留部分可见度，但不会达到开发者照明强度。
- M.E.G. 哨所「家政服务」补给员佩特拉新增 `皇家口粮×2 → 夜视眼镜×1` 兑换；交易 UI 支持
  `trade` 与 `barter` 同一 NPC 共存，原有杏仁水补给商店不再被以物易物列表覆盖。
- 夜视眼镜补齐地面低模、装备预览与 HUD 兜底图标；outpost-smoke 增加兑换数量、装备栏与混合商店断言。

#### v56 十一轮（L6 地貌、出口、地下材质与夜视强化）

- 夜视增像曝光和绿色暗部轮廓显著加强，佩戴启用时改为每秒消耗 0.25 通用电量；电量不足提示与耗尽失效完整接入，
  并新增由 `scripts/gen-item-icons.py` 可复现的双目夜视镜像素贴图。
- v58 再强化：旧增像（ambient +0.06）在 L6 深暗纹理地形上几乎不可感知，墙/地/顶看似「完全没用」——
  夜视环境光/半球光提升约 5 倍（ambient +0.34~0.54、hemi +0.12~0.21），增像曝光 0.68→0.85 起；
  仍低于开发者照明（ambient 1.1）。绿色调改为**夜视滤镜**承担：光源保持白色（贴图不再被染绿），
  佩戴+有电时启用最末级后处理（绿磷 monochrome + 动态噪点 + 细扫描线 + 镜筒暗角，EffectComposer
  通道组合新增 'n' 键），开发者照明下让位。
- L6 自然暗适应时间常数由 10s 缩短到 8s，稳定后的曝光恢复量提高；开发者一键照明仍拥有最高优先级。
- L6 darkhall 装饰取点改读 `dn/dnWall` 且统一加 `UNDER_FLOOR`，修复地下废弃手电/刻痕等误生在地表、
  尤其在起伏地形和区块接缝处浮空的问题。
- 枯林改为成片的 4~7m 合并网格大型枯木，恶臭草地改为宽幅高密草丛；按群系加入灰褐冻土/病态橄榄草原地色。
- 修复 L6 出口宿主种子不一致与区域概率落空：每个稀疏区域稳定生成地表 L7、地下 L8 出口，解析定位按当前
  `FloorBand` 选择正确出口；海浪井强制避开深坑。
- 地下墙、顶、地接入 Poly Haven CC0 的剥落旧灰泥与污损混凝土 PBR 贴图（颜色/法线/粗糙度），形成发霉、
  开裂、积垢的破败廊道；来源与作者记录于 `app/public/textures/SOURCES.md`。

### 3.3g Level 7「深海恐惧」无限海洋（`infiniteL7.ts`，v57）

- **入口房间**固定在世界 chunk (0,0)：8×6 抬升平台（x11..18 × y12..17，elev=2），湿毯 tint=33；
  西墙 1×3 书橱（可搜索）、小咖啡桌、木椅、荧光灯排；南墙开 2 格门廊（x14,x15），门廊外即深海。
  世界原点 (15,15) 为出生点——`InfiniteLevelImpl.spawnWorld` 新增可选字段，`generateInfinite` 按它落点，
  进入 L7 固定出生在入口房间内。
- **四深度带水平投影**：Wikidot 的垂直深度带被投影为「距入口房间的径向距离 + 低频值噪声」的连续深度场
  （daylight <2.25 chunk / twilight <4.5 / midnight <7.5 / abyss ≥7.5），每带独立 tint 29–32、
  弱自然光密度与海床内容：有光带荒芜、微光带骨堆锈桶、午夜带大量遗骸与巨鱼骨、深渊焦油堆持续冒泡。
- **岩石岛**为 chunk 本地确定性圆岛（完全落在本 chunk 内）：liquid=0，岛心 elev=2、岸线 elev=0；
  避让入口房间/出生点/固定出口。
- **出口**：seacave 固定世界 (15,21)（入口正下方海山，→L8）；pipering 固定世界 (-135,15)
  （入口以西 150m，→L9，需绳索）；每 8×8 chunk 超区域宿主再保底一个出口，保证 `l0NearestExit`
  解析式指引在任何区域有解。
- **实体/物资**：出生安全区（|cx|,|cy|≤1）无实体；tiny 限有光带/微光带，thething 限午夜带/深渊，
  deathmoth 极稀少。地面物品按深度带概率漂浮/沉底（`waterItemZForTile` 从 mapgen 导出供 chunk raw 使用），
  容器书橱/木桶/板条箱/骨堆/尸骸挂 `data.sid` 持久搜刮。
- 离线校验 `.check/l7inf-smoke.mts`（入口房间五种子固定出生/家具/门廊深海、固定出口、四深度带覆盖、
  纯函数一致、出口指引可解析）。

#### v57k（Level 7 无限化）

- L7 从有限 `genOcean` 切换为无限 chunk 生成（`infiniteL7.ts`）：入口房间固定在世界 chunk (0,0)，
  进入 L7 固定出生在房内（`spawnWorld` 注册表新字段）；家具齐全——西墙书橱/小咖啡桌/木椅/荧光灯排，
  湿毯 tint=33，南门廊外即深海。
- 四深度带按「径向距离 + 低频值噪声」水平投影为无限洋面群系：daylight/twilight/midnight/abyss
  （tint 29–32；新增 geometry.ts 对应地板/墙/顶色表）。海床内容、弱自然光密度与实体分布逐带变化；
  岩石岛完全落在本 chunk 内，避免跨块缝合问题。
- 出口：固定 seacave(15,21)→L8、固定 pipering(-135,15)→L9（需绳索）；8×8 超区域宿主保底出口，
  解析式指引任意位置有解。`waterItemZForTile` 导出供 chunk raw 计算漂浮/沉底物品高度。
- 离线校验 `.check/l7inf-smoke.mts` 新增；smoke/mech/engine 冒烟全绿。

#### v57l（开始游戏加载界面与资源预载）

- 新增 `LoadingScreen`（进度条 + 当前资源名 + 最近加载日志）与 `core/preload.ts`：
  点击开始/继续游戏后先显示加载界面，预载目标层级、下一层级、通用结构/装备补给贴图
  与 MIDI 曲风 BGM；所有请求失败静默降级，不影响进入游戏。
- 加载界面最短显示约 1.1s，并包含「生成初始地图/进入后室」收尾步骤，避免缓存命中时闪屏；
  加载完成后才提交 `engine.newRun`，再走原有开场坠落动画或存档恢复流程。
- `renderer/shared.ts` 导出 `textureUrl` 供预载器构造资源 URL；标题「开始游戏」与存档槽
  「继续」均接入同一加载流程。

#### v57m（Level 7 入口舱体、门廊舱门与尼龙绳）

- 入口房间扩展为「房间 + 增长门廊」金属舱体：房间南门口接入 2 格宽、6 格深门廊，
  尽头一扇钢灰舱门（`hoteldoor` data.hue=2 / l7porch），门外即深海。
- 舱门开启瞬间 `forceL7PorchDrop` 把门边 2.6m 内的玩家强制传送到舱门外落海；
  关闭状态下保持实心阻挡。
- 平台地板保持 `elev=2`（浅水洼 liquid=2），舱体墙底钳制到平台高度、平台边缘不生成
  落地侧壁——从海面看入口房间下方是镂空的。
- 新增 `ropeanchor` 结构与交互：门廊入口使用尼龙绳后 data.deployed=1 持久化；
  绳索从门廊出口（x15,y23）垂到舱门外海面（x14,y25），海面靠近绳底按住前进即可攀回门廊
  （`climb` 状态扩展 zBase/zTop/rope）。
- 新增原创程序化金属贴图 `public/textures/l7_cabin_metal.jpg`（生成脚本
  `scripts/gen-l7-cabin-metal.py`，无版权负担）与 geometry.ts 三组 cabin 材质；
  家具金属化：书橱/咖啡桌/椅/荧光吊灯（data.cabin）。
- v58 舱内翻新：锈蚀钢板太暗太丑——内装改为 CC0 真实贴图（polyhaven）：
  地板 `l7_carpet.jpg`（dirty_carpet 湿毯，呼应「铺有地毯的地面上覆盖着一层浅水」）、
  墙板 `l7_cabin_wood.jpg`（distressed_painted_planks 做旧漆木）、
  天花/屋顶 `l7_cabin_ceil.jpg`（brown_planks_05 浅色木板）；仅舱底船壳保留钢板。
  2F 地板/墙/顶顶点色由深蓝灰调色板提亮为暖灰木调；吊灯半径 6.0→8.0，
  门廊新增一盏暖光（fixZ 4.15）。
- 离线校验新增 `.check/l7cabin-smoke.mts`（门廊/舱门/强制落海/绳部署/攀爬返回）。

#### v57n（Level 7 入口舱体 2F 化 + 海面自然光提亮）

- 入口舱体不再用主层 elev=2 模拟高度：`GenChunk/LiveChunk` 增加可选 `up/upWall`，
  `infiniteL7` 把房间与门廊地板写入 `up`、舱体墙写入 `upWall`；窗口缝合后 `m.floors=2`。
  一层对应瓦片保持 `tiles/liquid=1`，因此舱体真正悬浮在完整海面之上，下方镂空且有水面。
- 出生点注册 `spawnFloor=1`；`generateInfinite` 的出生校验与 `loadLevel` 按 2F 楼板落位
  （出生 z=3.0，玩家 floor=1）。家具、舱门与系缆桩均标记 `floor:1`。
- 尼龙绳部署后建模为两段：系缆桩（门廊入口）→ 门廊出口（沿门廊向前延伸）→
  门廊出口外一格的海面（向下垂落）；攀爬终点改为 2F 门廊出口（z=3.0）。
- 海面可见性：L7 深水水面改为更亮的青蓝色、提高不透明度与自发光；渲染器无限层环境光
  基线对 L7 单独提升（ambient 0.175 / hemi 0.225），`lightSoft=1.18`，生成器自然光
  半径 11.5/9/7 并提亮色温——海面呈普遍的昏暗自然光而非黑水。
- 离线校验更新：l7inf/l7cabin 覆盖 2F 楼板、spawnFloor、舱门强制落海与 3m 攀绳返回。

#### v57o（L7 垂直深度轴 / 舱体修复 / 水面与性能）

- `GameMap` 新增 `seaFloor: Float32Array`（每瓦片海床深度，米），`GenChunk/LiveChunk`
  同步可选字段；`floorHeight/tileH/wallBaseTopAt/geometry/movement/waterItemZ` 全部按
  `seaFloor` 计算深水底部。有限层默认 1.7m，行为不变。
- L7 深度带改为**按海床深度垂直划分**：`l7SeaFloorAt` 用三倍频值噪声生成 10~430m
  连续海床（舱体附近 7~25m 浅海），`l7ZoneAt` 按 <24/<90/<230m 判定 daylight/twilight/
  midnight/abyss。L7 深水潜降速度 -6.5m/s、上浮 5m/s；超过 150m 持续水压伤害。
- 水下渲染：随下潜深度缩短视距（16→5.5m）、雾色转黑、环境光/半球光指数衰减；海面加亮膜
  `surfaceGeos` 提供清晰水-空气交界线，海面材质不透明度/自发光再提高。
- 修复：尼龙绳 `ropeanchor` 进入 ANIM_STRUCT，绳索组始终构建并按 `deployed` 显隐；
  `doorNeedsRotate` 楼层感知（2F 舱门朝向归零）；L7 舱体连续屋顶（含墙顶）消除外部虚空；
  手电阴影 1024→512、隔帧更新。
- 水生实体：`entityWalkH` 支持 `aquatic` 参数，深水按海床高度寻路；新增 `entityBand`
  修正 z<-1 被误判地下层；`updateAquaticDepth` 让 tiny/thething 追击时贴近玩家深度、
  巡逻时悬于中浅层。tiny 听觉半径 ×2.4 可被投掷/爆炸声引开；thething 被手电照亮即激怒追击。
- 离线校验：l7inf 增加 seaFloor 纯函数/深度带自洽；l7cabin 增加 200m 海床触底与水压伤害断言。

#### v57p（细化游泳系统）

- 深水垂直物理重做：无输入时浮力把玩家送回水面平衡位（z≈-0.5），不再自动沉底；
  按住蹲伏持续下潜，跳跃键划水上浮；L7 下潜/上浮终端速度为 -6.5 / +5 m/s。
- L7 开放水域可冲刺快速游（体力消耗 16/s，快速游产生更大噪音，会吸引 tiny）；
  普通游泳速度由 1.7m/s 提升到约 2.45m/s。
- 呼吸系统：L7 基础屏息 35 秒，装备潜水面罩 +25 秒；浮出水面以 3× 速度恢复。
  超过水深 150m 的压强伤害保留。
- HUD：进入深水显示水深、剩余氧气条与「蹲伏下潜 / 跳跃上浮 / 冲刺快速游」提示；
  水下叠加蓝绿晕影。
- 离线校验：l7cabin 增加水面浮力、下潜、上浮与 200m 海床触底/水压断言。

#### v57q（L7 纯深度生成 / 连续光照 / 快速游泳方向）

- 取消原先按水平 chunk 划分的光带 tint 与 chunk 级区域生成：非出生 chunk 统一为
  「开放海洋」，所有结构/实体/物品按**放置点 seaFloor 深度**选择 daylight/twilight/
  midnight/abyss 内容；`l7VariantOf` 不再返回水平光带，HUD 区域名改为读取当前瓦片真实深度带。
- 海床仍由世界坐标 fBm 连续生成，相邻 chunk 共享边界值（校验最大相邻瓦片高差 0.42m），
  深层/浅层之间为连续坡面。
- 照明改为纯深度驱动：生成器不再铺水平区块点光源。L7 环境光/半球光基准大幅提高，
  日光带接近白昼；下潜后 ambient/hemi 按 depth/230 近乎指数衰减，深渊带接近无光。
  水面雾距提高到 34m，水下雾随深度从 16m 压缩到约 5.5m。
- 手电水下优化：光色转冷蓝、亮度随深度降至约 28%、照射距离 18m→约 8m。
- 快速游泳改为朝准星方向：水平方向跟随 look.yaw，俯角下潜/仰角上浮，平视保持深度，
  且快速游泳期间完全忽略水面浮力；无输入时返回水面平衡位的速度显著放缓。
- 水面分界再增强：水面以上 7cm 亮白泡沫膜 + 水面以下深色水膜，水面材质不透明度提高到 0.88。
- 状态锁定：开发者面板开启状态锁定时，氧气值恒满。
- 离线校验更新：l7inf 增加纯深度划分与海床边界连续性；l7cabin 增加状态锁定氧气断言。

#### v57r（L7 中性悬浮 / 操作优先级 / 海床衔接）

- 取消残余被动浮力：深水中无输入=中性悬浮，深度保持不变；只有蹲伏下潜、跳跃上浮或快速游泳俯仰才会改变深度。
- 蹲伏下潜优先于跳跃上浮；按下蹲伏时先清零残余上浮速度，修复「按蹲伏却仍在上升」。
- 快速游泳与垂直操作可叠加：冲刺 + 蹲伏同时下潜，冲刺 + 跳跃同时上浮；冲刺水平方向仍跟随准星。
- 出生点浅海安全区不再在固定半径硬切：shallow→raw 使用 smoothstep 过渡，并对最终海床场做
  3×3 加权低通；chunk 边界最大步差 0.62m，出生点过渡带最大步差 1.22m。
- HUD 深度带改为按玩家当前 z 深度显示（2F=入口房间，水中=真实下潜深度），与水平位置彻底解耦。
- 测试：l7cabin 增加中性悬浮、蹲伏/跳跃、快速游泳叠加、状态锁定氧气；l7inf 增加出生点过渡带与 chunk 边界平滑断言。

#### v57s（L7 室外海洋 / 彻底取消自动上浮）

- L7 生成器新增 `outdoor`：所有深水瓦片（入口舱体 2F 楼板及其下方除外）标记室外。
  海洋不再绘制室内天花板，改由天空盒与室外自然光照明；入口舱体下方保留船底/2F 天花板。
- 无任何游泳输入时 `p.vz` 直接清零，不再做阻尼衰减——上一跳/下落残余速度不会造成
  继续上浮或下沉，真正做到严格中性悬浮。
- l7inf 增加 outdoor 纯函数与「开放海洋=室外、舱体下方=室内」断言。

#### v57t（最近更新汇总：L7 实体/出口/岛屿/旧书/性能/水面/碰撞交互/快速游泳）

- L7 实体：死亡飞蛾不再生成；「小不点」更名「小小」，只在日光带/暮色带；7 层之物只在午夜带/深渊带。
  **v58 重做**：小小移出自然生成池，唯一一只可对话个体（calm 被动实例）固定在环形场；
  7 层之物全窗口同时至多一只（`instantiate` 过滤）。
- **v58 七层之物重做**（参照 Fandom Entity 20）：建模为多体节巨鳗——巨嘴尖牙大头（上下颚针齿、
  灰白浊眼、红色鳃丝扇、旧疤）+ 9 节渐细体节（背鳍膜/鳃裂/伤疤/尾鳍，皮革质深色皮），
  第 3/6 节带「故障」斑块（无规则闪烁 + 体节错位抖动）；体节链由拖链驱动——头领着走、
  体节越靠后越拖，摆动为多个不可约正弦叠加（无规律感），水下短视距里长尾没入黑暗呈
  「一望无际」。攻击时血盆大口大张（下颚旋开 + 整体前扑）。机制：它沿面向行进、转头迟缓
  （chase 1.15 rad/s，攻击前摇 2.2），攻击触发距离 2.0m；玩家可砍头部之后的体节（近似链
  命中判定，伤害 ×25%）使其转头迟滞 3 秒（0.4 rad/s）——巨大但不至于无解。
  后续修复（v58fix）：海床真实起伏让相邻水体格的海床高差常超 stepEntity 的 0.4m 限高，
  水生实体被永久卡死在海床洼地（看似「卡在海床下面」）——水体瓦片间游动不再校验海床高差
  （垂直位置由 updateAquaticDepth 负责）。浏览器实测确认巨鳗完整渲染、拖链跟随正常。
  再修（v58fix2）：水生实体生成 z 恒为 0（海面）——深海个体要花一分多钟从海面沉下去，
  深水玩家根本看不见（「陆地召唤可见、海里召唤不可见」的根因）；updateAquaticDepth 在非追击
  且偏离目标水层 >25m 时直接就位，dev 召唤水生实体直接生成在玩家所在水深。
  v58fix3：海生生物垂直泳速提升（thething 1.6→3.0、其余 2.6→4.4）；巨鳗建模竖扁写实化——
  竖直侧扁的缎带形体节（高而薄、非圆滚）、烂革质斑驳皮、口裂占头长 1/3 的海口与参差针齿、
  阴冷小侧眼、连续背鳍膜/臀鳍膜/胸鳍，实拍确认全身渲染与拖链正常。
  v58fix4：七层之物巡逻水层压到近海床（原 45% 水深在深海太高→离底 min(18, 12%) 米）；
  体型再增大（体节 0.58→0.8 半径、头部 ×1.28），体节链节距 1.12→1.35 随体长同步，
  节间与头部衔接更紧；体节命中近似链同步为 2.2+1.35n。
- **v58 环形结构场「小小的谎言」**：入口房间正西 150m 暮色带，海床压平为 46m 浅台
  （`L7_ARENA` 世界纯函数，跨 chunk 一致）；水下管道（seapipe，deg 定向管段）与石柱
  （seapillar，完整/断柱/倾斜三变体）围成内外双环，中心为可踏上的圆形石台（seadais，0.42m
  stand 碰撞），台面嵌一扇木门出口「小小的谎言」→ Level 9；环外散布骨堆与巨鱼骨碎片带。
- **v58 小小重做**（参照 backrooms-wiki-cn Entity 720）：建模为巨型类人形——焦油罩袍/头冠 +
  焦油层下生物荧光斑点（暗处更亮）+ 橡胶质皮肤 + 面部双片甲壳（追击终段张开露尖牙巨口）+
  巨物尸骨长矛 + 利爪；双眼自发光随深度增亮、近水面暗淡。行为：泳速 3.4（极快）、听觉 16
  （噪音 ×2.4 极远侦测）、水生实体拒登干地（entityWalkH 陆地返回 null）；极厌恶噪音——
  首次巨响受惊退避低鸣，再次被吵或被打即激怒（拒绝一切对话并转为追击）。
  对话（interact case 'tiny' → NPCS.tiny 树）：傲慢、恶意不掩饰、矢口隐瞒 L9 出口存在。
  动画：泳姿（常泳/速游 swimK 平滑过渡、俯身+四肢打水+头冠摆动）、攻击（骨矛后收前刺）、
  甲壳终段张开（openK 平滑）、眼/斑按深度驱动发光。
- L7 出口只保留两种并各有专属建模：午夜带海床概率生成岩洞洞口（l7cave→L8）；深水中罕见漂浮的
  「不是出口」门（notexit→L4，自带 z）。旧 seacave/pipering/abyss 出口删除。
  v58 新增第三种：环形场石台木门「小小的谎言」（littledoor→L9，固定坐标）；
  l7cave 岩洞洞口改为**贴海床斜面摆放**（洞口平面法线按连续地形高度场对齐，微沉贴合）。
- L7 深度光照（v58）：修复海床与各类生成物不随深度变暗——定向阳光（sunLight）此前不潜水深，
  深水区仍被全亮照射；现与 ambient/hemi 共用同一深度衰减因子（l7LightKeep，depthK×0.985），
  下潜越深海床/结构/遗骸越暗，深渊带近乎无光。
- 海床：出生 chunk 为平缓浅海台地，离开后才向 fBm 深海过渡；跨 chunk 使用连续高度场与解析法线，
  消除接缝；进入 L7 逐帧构建 chunk、轻量出口锚点 + 负缓存，修复入口房间卡顿。
  v58 真实随机起伏：新增中尺度沙丘/海岭/海沟（36~90m 倍频 + 55m 脊状沙纹，振幅随深度放大，
  深渊带 ±25m 山丘状）与 13m 小尺度碎起伏；出生浅滩与岛核区自动平息（岛屿判定不变），
  深度带边缘呈自然斑驳过渡；轻量出口锚点校验放宽为「锚点必存在于宿主出口中」
  （非宿主 4% 概率附加岩洞无需锚点）。
- 开发者面板：新增「传送到最近岛屿」；出口/区域传送均带 z 轴。
- 物品「来源不明的书」改为入口书柜固定一本，其余来源移除；使用打开旧书风格「七层之物」文档
  （可滚动、隐藏滚动条、配图与 7/20 正文）。
- 碰撞：水下结构以海床为基准，不再把上方整条水柱当作实心；交互增加 ±3m 的 z 轴门槛。
- 手电：classic 阴影贴图默认 512；v58 起阴影改为**按需更新**——贴图内容只随光源姿态与场景
  内容变化：静止时完全不重渲（20 帧心跳兜底门/实体等动态投影体），移动中 classic 每 6 帧、
  realistic 每 2 帧，开灯瞬间与层级重建/chunk 流式变化时立即刷新；水面/浅洼标记为只接收
  不投影（海面 25 chunk 网格不再反复画进阴影贴图），修复持手电帧率骤降。
- 水面：删除水面分界膜；玩家在水面随浪起伏、眼高贴近水线；「真实水体效果」默认关闭，
  开启后注入顶点涌浪 + 程序化波光着色器（多向正弦波叠加浪面法线、菲涅尔深水↔天空反射、
  天光高光与细闪波光，高频碎波随距离淡出；L7 海面瓦片 2×2 细分，纯视觉无物理），
  不使用 l7_water_surface.png 纹理；其他层深水同步获得弱化版光泽。
  v58 透明感重建：基础不透明度 0.94→0.42，按瓦片烘焙水深顶点属性（seaFloor），
  着色器按「水深/视角余弦」的穿水路径做指数吸收——俯视深水呈浓重暗色水体（非清晰透视
  水底），近岸浅滩/泳池清澈见底；掠射角让位菲涅尔反射，水下仰视仅弱吸收保留透光。
- 快速游泳严格按准星 3D 方向：WASD 只负责触发冲刺，水平按 cos(pitch)、垂直按 speed·sin(pitch)，
  优先级高于蹲伏/跳跃。
- L7 天空（v58）：无限模式首次挂接天空球（此前仅背景色/雾）——巨大迷雾的阴郁暮色
  （低空亮雾墙、高空暗灰蓝、浓云满铺、**无日轮**，顶光照明保留），SKY[7] 雾色对齐地平霾色，
  场景雾视距 34→27m，且**户外不再把雾推远**（旧版户外统一放到 48m，海平面上看不见距离雾；
  现 L7 户外仅 near 3.5 / far 29 的浅雾，海面始终笼在可见迷雾中）；
  天空球心从 5.5 压到水线 0.2，球底缘沉入海平面之下，
  修复海平面尽端与天空地平线之间的背景色「间距带」。
  迷雾中可见**蜃楼船队**（3 艘立体低模幽灵船：挤出侧影船体 + 盒式桥楼 + 细柱桅杆/吊杆，
  无船灯，霾色半透明 Lambert、fog:false、不写深度），每帧以玩家为锚摆放到固定方位
  ~38m——永远无法真正靠近；**随机慢频显隐**（120s 周期内按 船×周期 哈希开 16~46s 显现窗，
  占空 15~38%，大部分时间完全隐没），船前挂水平拉伸软雾幕缓慢漂过（迷雾笼盖），
  缓慢横摇，水下时全隐。
- 出口电梯（v58）：L3/L4/L5 嵌墙电梯出口补 `elevdoor` 结构（仅碰撞无模型，同 stairrail 先例，
  生成末尾追加不影响放置判定；data.noSight=1 不遮交互视线）——玩家/实体不再嵌进门扇平面；
  电梯交互距离 1.6→2.2m、交互体加大；**出口模型纳入准星视觉命中射线**（visualHit 新增 exit
  变体，与结构/物品同通道）——规定范围内准星指到电梯门必然可交互。
- 高层边缘挡板规则（v58）：临近本层楼板墙（upWall）不生成挡板（墙体自身即围挡；
  SKIRT 层级该类墙面临地侧本就有踢脚线）；临近**地面墙体且墙顶达到楼板面**
  （wallBaseTopAt.top ≥ slabTop，如 EL3A 2F 沿墙段）也不生成，SKIRT 层级改在楼板缘补踢脚线；
  临近空气但允许出去（L7 门廊尽头舱门落海口，按门 data.dropDX/dropDY 判定）不生成；
  其余临空边缘（如 EL3A 2F 北侧）照常生成。
- L7 门廊舱门（v58）：开门与「再度靠近已开舱门」（门口 0.9×1.4m 区域，攀爬冷却 0.9s 内除外）
  都会触发**异常重力拖拽演出**（`eng.porchDrop`，0.62s 加速曲线拖向落海点——视角猛沉前倾 +
  横滚抖动 + FOV +8）；末段（k>0.65）z 从 2F 高度压向海面再抛下——修复早期版本演出后
  悬停在门口半空（楼层带把落点误判为上层板面 FLOOR_H）不落海的问题。
  l7cabin-smoke 已更新为演出版断言并新增自动坠海用例；outpost-smoke 邀请函桩件补齐
  地图/引擎字段（v57 统一评分器后的陈旧桩件崩溃修复）。

### 3.4 现象系统（`phenomena.ts` + `engine.activePhenomena`）

| 现象               | 层级      | 机制                                                                                                                                                    |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 孤立效应 isolation | L0        | 理智缓慢流失（红室 ×2）；画面极轻微随机调色（CSS filter）                                                                                              |
| 植殖癌 plantcancer | L1 花园段 | ~75s 涨满：三阶段播报（僵硬→泛绿→叶脉），移速 -55%，视野变绿（绿色 vignette），涨满即"生根"死亡；离开 2 倍速消退                                      |
| 闪烁 flicker       | L1        | 低频率（~12%）：先 3.5s 预警期灯光快速明灭（keep 灯除外），随即完全停电 14–24s——笑魇于黑暗中生成扑向光源，天花板通风管的手臂伸出猎捕；复电后笑魇退散 |

开发者面板「世界」页可对每个现象强制开/关（`dev.phenOn/phenOff` 集合）。

### 3.5 生存与战斗

- 属性：HP / 理智（黑暗流失、实体压迫）/ 饥饿（归零扣血）/ **口渴（v54，归零扣血）** / 体力（冲刺）/ 电池（照明）
- **口渴值 thirst（v54，0-100）**：与饥饿同率自然流失（0.28/s ×难度 ×熵；据点 ×1/3、玩家不动 ×1/2
  同规则叠加）；**体力耗尽（stamina ≤1，同 movement 冲刺耗尽阈值）时流失 ×2**；
  ≤25 播报「你渴得喉咙发干。」+ 画面特效（边缘干涩发黄 + 轻微模糊，`anim-thirstPulse`，人制品效应期间恒显）；
  归零持续扣血（1.2/s）致死「渴死了」。HUD 口渴条在饥饿条正下方（青蓝 `--thirst`，全 8 主题有值）；
  状态页/DevPanel 状态控制/devFastForward 同步纳入；随 player 快照进存档（旧档浅合并默认 100）
- 近战：武器伤害（拳 8 / 木板 22 / 撬棍 25 / 刀 30 / 扳手 20 / 斧 45），
  可投掷道具（汽油罐爆炸/电容器电击/订书机引怪/氙气珠诱饵）；
  v44：**击退位移做墙体校验**——命中/击杀的击退落点不可走（墙/实心结构/不可达高差）则不位移，
  尸体不会被玩家一锤钉进墙里
- 34 种实体 AI：游荡/调查/追击/攻击/埋伏/伪装；听觉（冲刺噪音）、视线、栖息地过滤；
  渲染朝向经角速度上限短弧插值平滑（`renderer.entityFacing` 缓存，~6.5 rad/s）；
  v44：**被动漫游撞墙自动转向**——wander 卡住（含防穿模推挤完全抵消位移的「顶墙原地蹭」，
  stepEntity 实际位移 ≈0 亦判卡住）时，在当前目标方向基础上偏转 ±60°~120° 另选可走目标
  （`wanderDeflect`，Ferren 保留专属小半径逻辑）
- 被动实体（无面灵/尸鼠，`passive`）：不索敌（无视线/听觉/贴身触发），自行游荡；
  **被玩家攻击（近战/水枪）才激怒反击**（`Entity.provoked`），脱战 8 秒平息
- **实体对实体仇恨**（v41，`EntityDef.hunts`）：尸鼠主动猎杀附近 9 格内指定类型实体
  （死亡飞蛾）——有视线即追击撕杀（猎物直接死亡，不计玩家击杀）；被玩家激怒时优先反击玩家；
  v44：**猎物反击**——被尸鼠攻击的实体（飞蛾）`provoked` 且 `Entity.targetEnt` 指向伤害者，
  chase 转为追击该实体（击杀后仇恨解除，被动个体回漫游，不迁怒玩家）
- **实例级被动/缩放**（v41 calm / v44 scale，chunk raw 标记）：instantiate 浅拷贝 def 置 passive/scale——
  L2 死亡飞蛾「通常不主动攻击玩家」由此实现，不污染 L5/L8 的共享定义
- **v33：Level 1 限定实体与特性**（仅钝人/猎犬/肢团/悲尸常驻；笑魇停电专属；手臂随天花板通风管生成）
  - 手臂：少量天花板通风管（ceilvent）；层级灯光熄灭时伸出抓击（d<2.2 命中+减速），复电/远离缩回
  - 肢团：失明（blind，sight 0），只按响度半径听觉——听见声音即高速冲撞声源；蹲行(半径1)/慢走(4)可规避，搜索(6)/挥击(8)/冲刺(10)会暴露
  - 钝人：`phases` 穿墙实装（无视墙体碰撞），行动时发刺耳沙沙声（`audio.scrape`，按距离衰减，墙内更响）
  - 猎犬：`intimidatable`——玩家「实时直视其眼睛（视角锥 ±0.4rad + los）+ 持续制造噪音（playerNoiseT>0）」才定身；停止发声或移开视线，0.25s 内恢复行动
  - 笑魇：`lightHunter` 趋光——停电时于玩家周围黑暗处生成 2~3 只（blackoutSpawn 打标），仅手电亮时可索敌；关灯不靠近并退开；复电即消散。
    v44 **听觉通道**：关灯后玩家在听觉半径（hearing 4）内持续制造噪音（playerNoiseT>0 且有视线）同样会被察觉——进入追击；停止发声即退回游荡
- 理智下限：皇家口粮永久锁定 40（成瘾崩塌期失效）
- **疫疾感染值 infection（v55，Entity 19「疫疾」；0+ 隐藏数值——游戏内无任何数值/提示文本，仅风味特效）**：
  站在潮湿地板（wet=1，液态水中不算）或 L3/L5 锅炉房区域（boiler/sphboiler 4m 内）每秒 +1；
  每 100 点进一阶，效果逐阶累加——一阶平和期（边缘微弱病绿特效时有时无、体力恢复 ×0.9，消毒液完全清除）/
  二阶潜藏期（间歇轻微模糊 + 周期咳嗽[走 noiseEvent，可吸引实体]，消毒液只能退回 50）/
  三阶并发期（移速 ×0.8、治疗减半、全视野浸染常驻，**随身物品全部无效**）/ 四阶坏死期（持续扣血致死「疫疾恶化而亡」）；
  未满一阶：消毒液/皇家口粮清除、**杏仁水/幸运豆奶给 60s「恢复」buff**（v55 二轮——不再直接 -30：
  buff 期间感染不再增长，且非感染区每 5s 自然 -1；重复服用重置 60s 计时）；
  消毒液/皇家口粮的清除效果保留并同样给 buff（二阶退 50 也给；三阶起消毒液无效也无 buff）；
  **三阶以上只能找医疗身份 NPC 求治**
  （杜邦/马丁/莫雷尔[希波克拉底 - 1]/萨伊拉[Omega]，`NpcDef.medic`，对话出现「求治感染」）；
  **每次进入新阶段计图鉴遭遇「疫疾」一次**（退阶后重新升阶再计）；随 player 快照持久，freshPlayer 清零，
  DevPanel 状态页可见可调（0-450 滑杆）；**dev.statLock 状态锁定覆盖 infection（锁满=健康语义：每帧锁回 0）**，
  devFillStats 顺带清零；EFFECTS 注册表登记（player.infection 为快照字段不参与重置，infectionStage/coughT/infectionRecoverT newRun 清零）

#### v54 杂项·生存与口渴
- 口渴值系统上线：新属性 thirst（0-100），与饥饿同率流失、体力耗尽 ×2、据点同规则减缓、归零扣血「渴死了」；HUD 口渴条 + 低口渴画面特效（人制品恒显）；7 种物品口渴效果（杏仁水/咖啡/液态痛苦/腰果水/幸运豆奶/市政自来水/番茄浓汤，市政自来水不再恢复饥饿）——见 §3.5/§3.6（v54）。

#### v55：疫疾与感染系统

- 新特殊实体「疫疾」malady（Entity 19，special.ts）：无模型、不游荡生成——它是「感染」本身；图鉴条目全格式（CECS Enigmatic / NCR+TXC / 智能 E）；遭遇计数走感染升阶链路（每次进入新阶段计一次，退阶后再升重新计）。
- 隐藏感染值 `PlayerState.infection`（0+，游戏内不可见、仅风味特效）：湿地站立（水中不算）/ L3·L5 锅炉房每秒 +1；四阶段（平和/潜藏[咳嗽引怪]/并发[减速+治疗减半]/坏死[致死]）；物品规则与医生求治见 §3.5。

### 3.6 物品系统（80 件）

- **键位**（keybinds.ts，可自定义，`br_keybinds` 持久）：WASD 移动 / 空格跳 / C 蹲 / E 交互 /
  F 手电 / I 或 Tab 背包 / M 地图 / **G 图鉴 / J 任务 / U 状态 / L 日志**（v41 新增——
  背包打开时再按页签键切换页签，按当前页签键关闭）/ Shift 冲刺 / Q 快丢 / 1-7 快捷栏 /
  **F1 沉浸模式**（v54：隐藏整个 HUD 层[状态栏/小地图/快捷栏/消息流/DevPanel 水印/准星]与
  第一人称手部建模[vm/vmFlash/vmLighter 组]，再按恢复；背包/图鉴/设置/战利品面板等覆盖 UI 不受影响；
  F1 是浏览器「帮助」默认键，keydown 处一律 preventDefault）/
  **F2 半沉浸模式**（v54：只隐藏 HUD 铬件，保留手部建模[含手持物品]与准星；与 F1 互斥不叠加——
  按当前生效键恢复，按另一个键直接切换；`engine.hudHidden`/`handsHidden` 双标记）
- **分类**：后室物品（anomalous，17 件：杏仁水、腰果水、幸运兔脚、万能钥匙、巨兽之肉、
  来源不明的书、氙气玻璃珠、石卡祖笛、Pockets、presses、宣传册、市政自来水、福友玉、
  滋水枪、迁跃浆果、皇家口粮、天鹰币）/ 普通物品（v50 新增物品与瓶装闪电更名见 §7.6）
- **稀有度**：常见 18 / 少见 30 / 稀有 14 / 珍稀 4（Pockets、磁带等）
  （**v50 起展示层由 IOTS 罕见度八档取代**，旧四档保留为内部映射来源——见 §7.3）
- **装备槽**：副手（手电/打火机）/ 身体 / 手套 / **头饰**（潜水面罩/头灯）/ 口袋 ×4（**同类去重**）
- **特殊机制**：
  - 斧头：耐久 5，可劈开上锁的门，耗尽报废
  - 滋水枪：储罐 27 份（9 瓶×3），单一液体；清水无效 / 杏仁水 8 伤 / 腰果水 20 伤；
    **v34 线性水线**（沿视线射线步进 4.5m，撞墙即停，命中首个实体才触发效果）；
    右键自饮（杏仁水理智+10，腰果水-10）；物品栏信息面板装液
  - 腰果水：1/10 概率替代杏仁水生成（开局物资除外），理智 -30、口渴 -10（v54）
  - **物品口渴效果**（v54，`ItemDef.value3`，useSlot 各分支统一 `applyThirst`）：杏仁水 +30 / 咖啡 +10 /
    番茄浓汤 +10 / 幸运豆奶 +30（sanityeat 第三效果量）/ 市政自来水 +30（**不再恢复饥饿**，理智 +25 不变，
    描述同步改为「能解渴，但不顶饱」）/ 液态痛苦 -30 / 腰果水 -10；图鉴芯片区显示口渴恢复量；
    人制品效应期间**恒显口渴画面特效**（与恒显饥饿特效并列，描述同步）
  - 迁跃浆果：首次获得记录层级，食用传送回该层
  - 消毒液（v37）：希波克拉底团队标准配发；use 类型 'cure'——消去疫疾（**v55 已实装**：
    感染一阶完全清除 / 二阶退回 50 点 / 三阶起无效；未感染时仅提示「预防性消毒」）；
    阿丽亚娜以物易物/委托奖励的主要流通品
  - 皇家口粮：饥饿全满 + 理智下限锁定；成瘾 +180s/次（期间其他食物无效）；
    25% 触发"全部吃光"+理智急速崩塌
  - 笔记本和笔：手写体笔记本 UI，内容本地持久化；柜子稀有掉落，拥有后不再生成
  - 福友玉：HUD 实时显示最近实体距离（发烫/微温/温润/平静）
  - 头灯：头饰栏，与手电共用电池，光源在额头正中（手电在左手侧）
- **图标与低模**（v40 全覆盖）：66 件物品全部有**像素画图标**
  （`public/textures/icons/pixel/item_<type>.png`，32×32 原稿最近邻放大 128×128，
  深色描边+有限调色板+透明背景；`scripts/gen-item-icons.py` 读 items.ts 批量生成补缺——
  已有 png 跳过、缺画法的物品报错强制全覆盖；v40 补齐消毒液/欢迎纸条/Tom 餐馆 10 道菜共 12 张）。
  显示层 `ItemGlyph`（HUD.tsx `PIXEL_ICON` 表）：有像素图用像素图，404 回退旧贴图再回退手绘 SVG。
  66 件物品同时全部有**专属低模**（itemsMesh.ts；v40 补齐消毒液/天鹰币/10 道菜肴共 12 件——
  通用 fallback 打 `userData.fallback` 标记，mesh-smoke 断言零 fallback）

### 3.7 图鉴与文档

- **图鉴**（InventoryOverlay，**8 个子页面，v41 排序：层级/实体/物品/现象/团体/据点/人士/文档**）：
  实体（遭遇 1/3/6 次渐进解锁；**v54 遭遇计数按个体去重**——`Entity.encountered` 标记，
  玩家看见[d<sight+LOS] / 实体察觉玩家[索敌进入追击/攻击，或目标点为玩家的调查；实体互猎带 targetEnt 不计] /
  攻击命中 / 特殊交互[接触杰瑞] 四路触发，**每只实体只计一次**，旧 `seenThisLevel` 同层同类去重机制移除，
  `br_codex_seen` 计数键不变向后兼容，
  **三重筛选**：层级/威胁程度/稀有度——派生自 `entities/spawns.ts`；层级归属含
  **特殊事件生成**（`ENTITY_EVENT_SPAWNS`，如 L1 的笑魇[停电]/手臂[通风管]））/ 层级 /
  物品（**四重筛选**：类别/来源/用途/稀有度）/ 现象 / 团体 / 据点（卡片应用所属团体主题色+居中水印）/
  人士（静态肖像档案 + 所属团体居中水印）/ 文档
- **文档系统**：`docs.ts` 注册表 + DocOverlay（红头文件式仿真 UI；`style:'note'`
  为手写纸条风格——泛黄横线纸/斜体/无抬头落款）；马尼拉室桌上交互阅读
  「后室重要层级 文档 3/7」；**首次进入 L1 时出生点旁刷「致新流浪者的纸条」+ 杏仁水**
  （wikidot 原文；查看即收录图鉴「文档」），读过的文档自动解锁图鉴存档
- 物品信息：数值/效果走**芯片区**（伤害/属性/特殊机制），描述文本纯风味化
- 地图：大地图 + 小地图标注（容器亮/暗、地面物品、出口名称）+ 图例；
  v44：大地图玩家金点画在**真实地图坐标**（随内容平移——拖远可出画面；「回正」按钮归位到玩家居中），
  不再钉死在画布中心

### 3.8 渲染要点

- 静态几何按 chunk 烘焙合并（顶点色 + 程序纹理）；tint 氛围表
  （1 马尼拉 / 2 红室 / 3 熄灯 / 4 浓雾 / 5 维护白 / 6 花园青翠 / 7 跃金高饱和金 /
  8 民居暖木 / 9 白金属 / 10 施工毛坯[灰混凝土+深色吊顶] / 11 施工补丁[新浇水泥/残存粉刷] /
  **12 L2 肮脏[锈橙棕] / 13 L2 晦暗[积灰] / 14 L2 整洁[洁净] / 15 L2 扭曲[病绿] / 16 L2 办公走廊[L4 风]**，v41；
  **17 L274 蓝白圣辉[教堂穹顶主间]**，v45；**18 L3 照明廊道 / 19 L3 晦暗廊道 / 20 L3 圣所[圣白大理石]**，v51）
- **地板**（v34）：L0 与 L1 天鹰段取消 `(x+y)%2` 规律棋盘格（统一底色 + 保留随机明暗噪点）；
  装饰结构 `pillar` 默认使用该层级墙纸（wallpaperBox，L0 暖白叠乘/其余中性白）
- **贴图**（v34）：L1 墙/地/顶换用 ambientCG CC0 混凝土贴图（近中性灰，与顶点色叠乘）；
  补给箱/木桶/储物柜挂木纹/金属贴图（`texLambert`）；均经 `levelTexture` 加载、
  离线自动回退程序噪点，素材来源登记 `public/textures/SOURCES.md`；
  **v48：L274 专属贴图 l274_***（Bricks051 蓝白石墙 / PavingStones128 蓝灰石板地面 /
  OfficeCeiling003 蓝色吊顶——去色后蓝乘色 #aab2d8/#8a92c8 再亮度归一，
  `scripts/gen-l274-textures.py` 可复现；palette 同步微调：墙面调亮防双重叠乘过暗、地面调深半档，
  与 tint 17 蓝白圣辉协调）；
  **v51：L3 贴图重制**（既有红砖墙面保留 / l3_wall2 改深色积灰砖变体 / l3_floor 叠加积灰混凝土 /
  l3_ceil 改积灰白天花板[Plaster006 派生]，`scripts/gen-l3-textures.py` 可复现——离线再加工，
  palette 改暖灰砖调配合砖纹）；
  **v52：L0 地板/天花板与墙壁统一世界空间 UV**（`worldWallUV`：u=x、v=z，1 重复=1m，跨瓦片连续
  无相位跳变）；`l0_floor.jpg` 已垂直翻转补偿地板平面 rotateX(-π/2) 的 v 向反转
  （天花板 rotateX(+π/2) 方向本就一致，无需翻转）；
  **v53：L0 地板/天花板改「仅贴图」渲染**——叠乘底色（pal.floor #b8a548 / pal.wallTop×0.55）
  在线性空间烘焙进 `l0_floor.jpg` / `l0_ceil.jpg`（`scripts/gen-l0-bake.py`，输入
  `_src_l0_*_prebake.jpg`，幂等可复现），顶点色只保留调制因子（每瓦片明暗噪点 / 湿地 ×0.62 /
  tint 相对底色的折算比值），出口洞口地板顶点色改白，天花板离线回退色改 #685c25；
  **v50 的 L0 地板/天花板自发光提亮同步删除**（应要求移除 emissive 微调），其余呈现与改造前逐点一致
- **玩家模型**（v34，`renderer/playerModel.ts`）：性别体型 / 发型×16 / 上衣×8 / 裤子×6 /
  表情×4 / **眼镜×3·胡须×2·鞋子×2 可选项**（v54b 扩充，AvatarCfg 新字段 glasses/beard/shoes
  默认 0=无，br_avatar 浅合并自动兼容旧档；眼镜/胡须为面部件打 userData.face 标记）参数化建模；装备视觉（绝缘服/保温服/手套/潜水面罩/头灯）；
  四肢关节 mesh + `userData.parts` 骨骼动画契约，**无面灵复用本模型**
  （`randomAvatar` 随机形象，仅摘除 `userData.face` 面部件——头部即无五官的光滑平面，
  v54b 眼镜/胡须同标记一并摘除；BRC 黑影/信众复用同约定）；
  **发型细化**（v41）：8 款发型全部重做——分层结构 + 高光/暗部发色 + 发际线碎发 +
  鬓角 + 发尾变化（背头后仰顶层/双马尾分段外撇/齐刘海分缝锯齿/乱发五撮翘发）；
  **女性体型**（v40）：gender=1 躯干胸部加适度隆起几何（低调两块小盒体），男性不变——
  玩家模型与女 NPC（爱子/玛戈/杜邦/马丁等）自动生效，mesh-smoke 断言女模型节点 > 男模型
- 灯光池 48 盏（v36 自 24 扩；默认**点亮距离与当前雾可视距离一致**——雾内全亮、雾外渐隐；
  画面设置可开「**远处灯光全开**」：扩展池 48→96 盏进场景全场景点亮[关闭即移除零开销；
  灯数变化已补材质 needsUpdate 重编译，否则新灯不参与着色表现为无效]；
  另有「**距离雾远近**」50%~200% 滑杆——缩放统一在全部雾修正[室外/水下/熄灯区/浓雾区]之后应用，
  灯光点亮半径读取本帧最终雾距，天然同步）；
  灯具自发光 flicker；闪烁预警期非 keep 灯 ~7Hz 快闪；
  **v53：灯具自发光盒亮度跟随其点光源本帧实际强度**（fixtures 记录 src 光源引用，
  按灯池循环 lightPow 映射归一）——**停电（光源被剔除）/ 超出灯池未点亮 / L6 禁光时灯具不再发亮**，
  闪烁与停电预警和点光源同步；**熄灯区视距压缩删除**（应要求——只保留近黑雾色 +
  环境光/半球光近乎熄灭，不再压缩 fog.far）；**柱子叠乘色与墙面顶点色对齐**
  （wallpaperBox 非 L0 原近白 #e8e8e8 → pal.wall，与墙面 wSide 同源——昏暗/无光环境下
  柱子不再因反照率远高于墙面而像自发光一样亮起）
- viewmodel：主手武器竖持模型 + 副手手电/打火机（火苗跳动）+ 攻击动画
  （挥砍/投掷/喷射/饮用/拳击）
- 粒子：引擎粒子（血/蒸汽/水雾）；漂浮尘埃默认关闭（设置 → 画面可开）
- 全局滚动条样式（v41，index.css）：细条 + 琥珀滑块（hover 加亮）+ 深色轨道，
  webkit 与 Firefox（scrollbar-width/color）双通道，覆盖图鉴/背包/聊天等全部滚动区

#### 渲染与贴图

- L0 地板/天花板改为仅贴图化 + 世界空间 UV，移除自发光材质（v52）。
- L0 熄灯区视距压缩删除（不再收紧，仅保留近黑雾与环境光熄灭）、灯具与柱子在黑暗中不再自发光、手部建模不发光（v52~v53）。
- L3 墙面换 ambientCG Bricks059 真实砖纹 + 世界空间 UV（1 重复=1m），横砌砖纹不再竖向拉伸（v51）。
- 上层墙/楼板的顶点色与 UV 修复（保留 UV + 全层级世界空间 UV，多层贴图不再只采样单纹素）（v54）。
- 大小地图支持多层墙与楼梯标记（2F/3F 楼板、坡道符号与朝向）（v54）。

#### v54 杂项·结构与建模
- 新结构：墙体窗 wallwindow（代墙互视：下 1/3 墙+中段玻璃+上段接顶，踢脚线继承白名单、无墙侧薄墙板收边；
  v54b 窗框/收边全收进瓦片厚度内齐平或略凹、墙段与踢脚线改 wallMatchBox[默认盒 UV+顶点色×墙贴图]与主墙循环零色差）、
  服务器机箱 servercase、挂式电视 walltv、沙发 sofa。
- 门类双面把手：hoteldoor/inkdoor/bargate/unlockeddoor/officedoor 背面镜像补把手。
- 装饰性梯子生成点全部移除（通用散点/L5 楼梯间固定点/L10 谷仓），仅保留 data.climb 攀爬梯（L3 维修平台/L5 布草间夹层）。
- 办公桌 desk 精细化建模（抽屉柜吊抽+拉手/板面边沿/桌下挡板/键盘鼠标便签笔筒；轮廓与碰撞不变）。
- 工位规则统一：desk 与 bigcomputer 不再并排（配大机的工位一律简桌 table），转椅椅面朝桌
  （cubicle 纳入 officechair 桌类朝向判定）；l4inf-smoke/outpost-smoke 均有断言。
- 办公隔间 cubicle 精细化（金属收边/走线槽/脚垫）+ 默认面向最近办公转椅（与椅朝桌互相对位，data.deg 可覆盖）；
  desk 屏幕加支架/底座贴桌面（不再浮空，边框+屏面细分）。

#### v54e 批次（容器动画/建模细化/结构修复）

- 容器开启动画差异化（updateStructs + CONTAINER_ANIM 速率表 + movable() 基准位姿登记，全确定性）：
  crate 盖上翻后滑+钉带/角铁；barrel 盖抛物线跳落桶边+铁箍；locker 钢门快速外摆+通风栅/编号牌；
  cabinet 双开门对称外摆+台面/柜脚；toolbox 锁扣先弹→盖后翻 126°；megcrate 双片盖上抬对滑+印刷 M.E.G. 标记；
  safebox 转盘先转→厚门缓慢外摆+铆钉/刻度环；car 后备箱掀起保留+液压杆/内衬（车色改坐标哈希）；
  fridge 双门带密封条外摆+开门灯渐亮+散热栅；suitcase 搭扣弹开→盖翻平；mailbox 投递口小门垂开+旗倒；
  elecbox 箱门外摆+内胆熔断器；bookcase 抽书（坐标哈希选层）/bonepile 散骨下沉四散/campstall 摊布掀起/
  corpse 盖布侧滑/binshelf 收纳箱错落抽出；dresser 改三层抽屉错峰抽出。
- cubicle 桌面细化（mulberry 坐标哈希 4 变体：键盘/电话/文件托架/笔筒/便签板组合；既有屏幕补支架贴桌面）。
- 细化建模（轮廓/碰撞不变）：copier 稿台盖板/出纸托盘/操作面板；serverrack 机架分层/指示灯列/走线；
  vending 陈列窗分层货品/取货口/投币区；car 车窗/四轮/前后灯；generator 风扇罩/管线/仪表；
  maingen 散热片组/联轴节/控制箱；bed 床架/床垫/枕头/被子褶皱（哈希错落）。
- 门板双面一致：hoteldoor/homedoor 补背面嵌板（homedoor 补背面把手）、inkdoor 门扇两面加强肋对称。
- trench 电缆沟：沟沿金属包边+沟内分层线缆+哈希格栅盖板；四邻同 kind 连接成连续沟（端头封闭板
  只在非连接端出现，相连侧去端板、线缆按连接轴走向对齐，转角/T 型两轴布缆；mesh-smoke 断言
  中端 0/端部 1/孤立 2 端板）。
- boiler/sphboiler 精确碰撞（见 §6 约定）。
- 尸鼠形态修复：根因=L3 装配线大房间「额外实体」路径裸 push 实体、漏发 v53 实例标记（尸鼠 capybara:1
  →被渲染成深褐形态；同路径漏发 faceling 敌意/错位器官、skinstealer 伪装、clump scale）——
  infiniteL3.ts 收敛 l3EntityMarks() 统一出口；回归脚本 .check/v54-ratmorph.mts（L3 全变体扫描
  尸鼠必带水豚标记、L2 必不带、三形态主色可区分）。
- Gemma 天花镂空修复（见 §6 封边扩展）：前厅中庭边界封边薄墙 ×4 + B 井道 6 格挑高封顶 8.6；
  outpost-smoke 新增「室内格头顶必有覆盖」全图断言（复算 1F/2F/3F 各层带绘制条件）。
- mesh-smoke 新增：容器可动件/looted 即终态断言、trench 连接端板数断言、cubicle 变体节点数断言。

#### v54e 批次·二（cubicle 朝向/crate 收敛/抽屉内构/玩家建模/photo 变种）

- cubicle 自动朝向只看自身 3×3 瓦片内的 officechair（原半径 2.5 格会隔板吸邻间椅子）；
  无椅保持默认朝向；data.deg 显式覆盖优先。mesh-smoke 新增邻距断言（东 2 格不吸/东 1 格生效）。
- crate 开盖后滑 0.55→0.34m（盖沿恰贴箱口后缘）；dresser 抽屉抽出幅度 0.2→0.17 停半开位。
- dresser 抽出的抽屉补盒体建模（五面浅盒+内衬，随抽面滑出、关闭收进轮廓）；
  cabinet 柜内补隔板分层+顶层浅抽屉（双开门外摆后可见）。
- 玩家建模全面细化（playerModel.ts；parts 六键骨骼契约与无面灵 face 摘除契约不动，
  新增件全挂对应 part 随动；npcGear 挂点基准面原位）：脖颈/下颌（不打 face 标记）、耳×2+鼻
  （打 face 标记，faceling 摘除后光滑）、上衣褶皱/领口/下摆挂 torso 局部系（追击前倾不脱节）、
  裤线/裤脚、鞋拆鞋底+鞋面+鞋头、手臂末端方盒改手掌+3 指+拇指（手持挂点 y=-0.5 不动）、
  8 款发型各加 1~3 层次件；比例仅收细四肢（armW/legW 男女各 -0.005），肩宽/头围/关节坐标不动。
  mesh-smoke：576 组形象配置全过、女性体型节点 女62>男59、NPC 配饰 47 名全过、ng-orient 无回归。
- photo 多变种：scripts/gen-photos.py（PIL 程序绘制，可复现）生成 8 张 256×192 照片贴图
  （山/湖/森林/剪影肖像/合影/房屋/街道/静物，统一白边+褪色做旧），public/textures/photo_*.png，
  SOURCES.md 登记自制；photo 结构无显式 data.tex 时按瓦片哈希从贴图池选图（同位置重建不变），
  相框细化（木质/金属双色变体框条 + 半透明玻璃微反光面）；既有摆放自动获得变种。

#### v54b 形象系统扩充

- 发型 8→16（新增：丸子头/斜刘海/脏辫/长直发/短卷发/莫西干/双丸子/高马尾——沿用分层+高光/暗部
  发色惯例，挂 headG 不打 face 标记）；上衣 4→8（新增工装[背带+胸袋]/背心[V 领+腰袋]/毛衣[高领+罗纹摆]/
  风衣[翻领+腰带+双排扣]，挂 torso 局部系）；裤子 3→6（新增牛仔裤/运动裤/阔腿裤）。
- AvatarCfg 新增 glasses（圆框/方框/墨镜）/beard（山羊胡/络腮胡，发色×0.85）/shoes（运动鞋/皮靴，
  鞋底缘 y=-0.72 不漂移）——默认 0=无、浅合并兼容旧档；眼镜/胡须打 userData.face 标记（无面灵一并摘除）。
- 上一批的鼻子部件按用户要求删除（默认面部件计数 8→7：眼2+眉2+嘴1+耳2）。
- AvatarEditor 全部形象选项改下拉菜单（枚举 Select + 颜色 ColorSelect 带色板），新增鞋/眼镜/胡须三行，
  预览经 JSON key 实时重建；randomAvatar 扩池（12% 随机眼镜、鞋随机、胡须恒 0）。
- NPC 造型更新 5 名：boone 络腮胡+皮靴 / kui 墨镜 / tang 双丸子 / candyman 短卷发+圆框眼镜 /
  muller 山羊胡（均不与 npcGear 配饰挂点冲突）。
- mesh-smoke 随迁：形象组合 576→6144 全过；face 标记计数断言（默认=7、眼镜+胡须配置=15）；
  无面灵摘除回归（含眼镜胡须配置摘除后 face 残留=0）；女体型断言保持。
- **v54c 发型返修**：16 款逐款修连接/穿模/层次（发件统一走 hb() 助手打 userData.hair 标记+记录 dim——
  碎发/分缝悬空件下移咬合头皮、刘海/斜刘海抬出眉带、侧绺让出耳位、长发/马尾/脏辫分段贴背不穿躯干、
  莫西干发脊下沉成链）；mesh-smoke 新增防回归断言——16 款×男女 346 个发件逐一验算包围盒
  （每件与头盒或另一发件三轴间隙 ≤5mm；不穿面部带/耳盒/躯干盒 >1mm）。

#### v54c 批次·二（床类细化/照片池/贴墙多层修复）

- bunkbed 细化（28 节点）：四柱贯通+端部爬梯（收窄竖杆+横档×4）+上铺护栏（长边双杆/端栏留爬梯口）+
  上下铺床垫床单分层（垂边+色差）+枕头；hospitalbed 细化（25 节点）：床头摇起角保留，补床脚轮×4+
  床单分层垂边。轮廓/碰撞不变；mesh-smoke 3f 节点门槛断言。
- 照片池删除人物类（剪影肖像/合影）：gen-photos.py 删场景函数+STALE 自清旧文件（幂等可复现），
  PHOTO_POOL 8→6，SOURCES.md 随迁。
- mountOnWall 多层修复：新增 bandWall() 按结构楼层带判墙（floor0=tiles≠1[行为不变]、floor1=upWall、
  floor2=upWall2），wallDirs（faceOutward/flushToWall 共用）与 mountOnWall 全走它——2F/3F 贴墙装饰
  不再浮空/错贴；显式 data.deg 路径不变。outpost-smoke 新增渲染级断言（2F 合成 megposter 探针
  逆旋还原世界方向，1~3 格内命中 upWall）。

### 3.9 据点与 NPC（v35）

- **团体与声望**（`factions.ts`）：每个 NPC/据点有所属团体与**主题色**（图鉴边框、对话窗边框、
  选中项边框）与**副主题色**（`sub`，团体相关文字色：图鉴团体名/据点标题/HUD 声望行/DevPanel 声望行/
  对话委托标题；缺省=主题色——BRC #d3ae00 / 阿丽亚娜 #a29fb2 / BNTG #44754d）。当前五个团体——
  **流浪者**（玩家所属，淡灰，无声望）、**探险者总署 The M.E.G.**
  （#a5a45a，Alpha 基地，初始声望 30）、**不结盟贸易集团 The B.N.T.G.**（**#566c5a**，商人之家，初始声望 0）、
  **阿丽亚娜集团 The Ariane Circle**（#8676e2，希波克拉底 - 1，初始声望 0——由希波克拉底团队等八支
  专业团队联合而成的法语团体，致力于异常生物学研究与医疗救助）、**后室装修公司 Backrooms Remodeling Co.**
  （#4f4c7a，v39，初始声望 0——军事化筑房/改造公司，员工是浑身漆黑没有五官的人形实体，
  淡蓝搭扣风衣/红肩铠/白围裙/棕羊毛裤/黑雨靴/黑腰带/深灰军式贝雷帽[正面金属徽章按级别铜/银/金]，
  「重塑」后室区域的尝试往往以灾难告终并把层级分裂出子层；**Level 1 衔尾段是其永不停工的领域**，
  **玩家身处衔尾段时 HUD 状态栏下方显示 BRC 声望**（v41，按当前区段变体=ouroboros 判定））、
  **杰瑞的信众 The Followers Of Jerry**（v45，**#4142a5** / 副主题色 **#0071c9**，初始声望 0——
  崇拜鹉主「杰瑞」（Entity 7，蓝色鹦鹉）的宗教组织，四处张贴海报传播教义并「教化」流浪者；
  圣地是 Level 274「杰瑞的房间」，只有足够虔诚（声望 ≥10）的访客才被引路进入；
  **玩家身处 L2 信众宣传间（信众领地）时 HUD 状态栏下方显示 jerry 声望**（仿衔尾段判定：
  记下房间矩形，玩家在矩形内即显示））。
  声望档位：≥80 交易八折 / ≤-30 拒绝交易 / ≤-60 拒绝交谈 / ≤-90 禁入据点；
  挥击 NPC 降其团体声望 -15（NPC 是居民：不会受伤死亡；**BRC 员工与信众例外，见下**）。
  图鉴「团体」页查看团体与声望（**v41 标志改为介绍框背景居中水印**——faction_*.png 官方图源：
  流浪者=后室维基图标/MEG=官方鹰徽 EagleSD/BNTG=官方地球环鸽/阿丽亚娜=官方紫环/BRC=官方房屋盾，
  纯色标志已重着色为主题色、有色标志保留原色，低透明度不溢出框；据点/人士卡片应用所属团体主题色并附同款居中水印）；
  对话窗 NPC 名片显示其团体与当前声望（**对话面部模型同样显示职业配饰**——与图鉴/游戏内同一 npcGear 通道）。
- **BRC 员工**（v39，衔尾段 chunk 生成 1~2 名，`brcWorkerDef` 按 chunk 确定性生成）：
  **穿制服的黑影**——身体是无五官的黑色剪影（渲染层按 faction='brc' 摘除 `userData.face` 面部件），
  制服配饰由渲染层按 id 前缀 `brc_` 附加（贝雷帽+级别徽章/肩铠/围裙/腰带/雨靴/手中工具）；
  名称取家用物品/果蔬英文名（`BRC_WORKER_NAMES`：Spoon/Kettle/Apple/Chair/…，同 chunk 不重名）。
  **行为**：锚定在工作点（面向墙/脚手架）不游荡，**一直保持装修动作**
  （`NpcDef.workLoop`：hammer/saw/paint/mop，渲染层 procedual 驱动手臂+工具）；
  **沉默**——对话只显示「（对方没有回应，继续手中的活。）」，无自言自语，不能交易；
  **不受玩家行为影响**：攻击不改变其行为（不逃跑/不反击/不停手）。
  **声望机制**：①**模仿装修**——对话选「尝试模仿他们的动作进行装修」，玩家挥臂动画播完 +2 声望，
  全局冷却 ~90s（对话窗显示冷却）；②**伤害/杀死不立即降声望**——挥击跳过 changeRep(-15)，
  改记 `brcSin` 未告发计数（hurt/killed，随存档持久）；③**坦白**——有未告发记录时对话出现
  「坦白你伤害/杀死了他们的同事」，结清声望（伤害 -10/人、杀死 -30/人），且**该员工转为敌对**
  （`NpcState.hostile`：追击+近战 9 伤，玩家可反击杀死；敌对员工被杀死不再记罪）。
  被杀死的员工走 NPC 死亡动画（倒地+下沉）并从引擎列表与所属 chunk 一并移除。
  **chunk 链路**（v39 打通）：GenChunk.npcs（raw 内嵌 NpcDef）→ LiveChunk.npcs（活体 NpcState，
  对象身份跨窗口平移保持）→ `engine.syncInfNpcs()`（loadLevel 与窗口平移后重收集）；
  窗口平移随实体同路偏移 x/y/homeX/homeY/tx/ty 并按当前位置归属重定；卸载即消失不持久化
  （重访按 raw 确定性重建——被杀员工会复活，与实体同一契约）。
- **杰瑞的信众 / Level 274 教化系统**（v45）：

  - **L2 信众宣传间**：卧室房型 ~8% 改生成（`l2IsJerryRoom`，布局走模块级纯函数
    `l2RoomLayoutAt`——生成器与领地判定共用同一几何）——无无面灵，改为 **1 名信众 NPC**
    （`jerryFollowerDef` 按房间槽位确定性生成：外文音译名、#4142a5 主题色制服 + #0071c9 徽章、
    蓝色额带+鹉羽饰配饰；与 BRC 员工同一 chunk NPC 链路，进 knownNpcs/图鉴人士）+
    **墙壁贴满信众宣传海报**（jerry_poster.png：蓝底+鹉主剪影+「鹉主杰瑞伟大」，megposter
    data.tex 沿内腔边缘贴一圈，`scripts/gen-jerry-poster.py` 可复现）；
    房间矩形即**信众领地**（`l2JerryRoomRectAt`：HUD 在矩形内显示 jerry 声望）。
  - **信众行为**（引擎按 faction='jerry' 驱动）：看见玩家（~8m）**主动靠近**（approach，
    不追出领地 10m），到 ~2.5m 停下后**高频自言自语传教**（JERRY_PREACH_LINES 词池 bubble）；
    **v47：仅野外随机信众（L2 宣传间）主动传教——L274 内的信众（zeph/polly/青鸟神父/辛克莱/
    随机信徒）不主动靠近，正常游荡/自言自语，需玩家主动交谈**；
    **敌意规则（全团体通用）**：jerry 声望 ≤ -10 → 转敌对（`NpcState.hostile` 追击+近战，
    可被反击杀死，hp 45）；≥ -10 恢复主动交谈。
  - **信众对话**（DialogOverlay jerry 专属分支；**v47 起对话树/自言自语不含「（……）」式
    舞台指示，一律风味正文；v48 起台词整体改圣经体**——庄重、排比，「鹉主」「祂」「尔等」「凡」，
    传教/诵咏词池与信众 idle 同步润色；机制标注如「（声望 +10）」保留全游戏通行格式）：
    **v48 特殊选项一律追加在正常对话树选项之后**（不再替换）；
    「鹉主在上。杰瑞的伟大超乎一切层级。」（认同）→ **声望 +10**
    （**v49 起每局游戏仅首次有效**——宣誓一次全鹦鹉门下皆知，`engine.jerryOath` 随存档持久
    （旧档按 `jerryAgreed` 非空迁移）；之后任何信众处该选项不再出现（`canAgreeJerry`=false，
    改显示「你已宣誓过了」风味文本），引擎层 agreeJerry 同步拦截且声望不涨；
    **v48 仅野外信众（L2 宣传间）可选——L274 内信众不显示该选项，引擎层同步拦截：
    他们已认可你才带你来**）；认同后出现
    「请引我朝见鹉主——带我去杰瑞的房间。」→ **声望 ≥10 才引路切层到 Level 274**，否则拒绝
    （「你还不够虔诚。」）；「恕我直言——祂不过是一只鸟。」（非议，作死选项）→ **声望 -10**。
  - **Level 274「杰瑞的房间」**（独立层级编号 274，走 OUTPOST_LEVEL_DEFS 空间注册不占 LEVELS
    下标；`label`「Level 274 · 杰瑞的房间」；手工小层级复用 gen 'outpost' 管线
    `genJerryRoom`）：**v47 视为层级而非据点——层级图鉴（codexCat '层级'）出现
    「Level 274 · 杰瑞的房间」（应用 jerry 团体主题色规则：边框 #4142a5 / 标题 #0071c9 /
    标志水印，同据点卡片；详情走 `levelDefOf` 解析），同时仍显示在据点图鉴且名称为
    「杰瑞的房间」（outposts.ts 短名；HUD 层级显示走 label 不受影响；不占 LEVELS 下标，
    双图鉴无重复计数）**。
    布局（v47 教堂细化）：**前厅 + 主间**——主间为**教堂风巨大穹顶**（挑高 ceiling=1 +
    `domering`[同心环形肋+放射拱肋+顶心圣辉盘] + tint=17 **蓝白圣辉**），**杰瑞栖木居中立
    `perch`**，实体**鹉主杰瑞**（Entity 7，stationary+passive+noRetaliate 无害）栖息其上；
    **长椅排**（bench data.deg 东西两区条凳面向栖木）、**讲坛**（新结构件 `pulpit`）、
    **烛台**（`candlestand`）、**圣水盆**（`holyfont`）、**蓝色彩玻窗**（glasswin
    data.stain='blue' 变体：石框尖拱+蓝白彩玻格）、jerry 圣像/海报墙；**西翼告解室**
    （忏悔位+神父位双隔间）、**东翼祭衣间·圣器室**（祭衣台 kcounter/圣器架 binshelf）、
    **南侧信徒居住区**（走廊+一排小间：床/小桌/烛灯）；zones 同步（入口/前厅/主间/穹顶下/
    告解室/祭衣间·圣器室/信徒居住区）。
    **灯光适配穹顶**（v47）：灯具贴附规则扩展——挑高瓦片不再限于多层，单层挑高同样贴
    挑高顶（光源点 tallCeilH-0.25 / 灯具 tallCeilH-0.05）；**栖木聚光 fixZ=5.1 挂穹顶顶心
    圣辉盘真实高度 + noFix**（灯具模型由 domering 圣辉盘提供，灯源点与灯具模型不错位）。
    **NPC 扩充**（v47）：侍立信众 zeph 泽弗修士 / polly 珀莉修女 + **青鸟神父**（信众领袖，
    蓝袍誓衣+高冠+肩头小鹉配饰）+ **辛克莱·贝克特**（wikidot 最臭名昭著的成员：便装狂热者，
    蓝羽胸针+臂弯日记本配饰）+ **3 名随机信众**（jerryFollowerDef 池，主间与居住区活动）；
    **jerry 系固定 NPC 整体位于 NPCS 注册表末尾**（图鉴人士页按注册表序显示，信众排最后）。
    唯一出口=「返回」（dest:'back'）。
  - **教化系统**（indoctrination 0~100 + jerryTamed，随存档持久）：玩家对杰瑞交互
    **「接触杰瑞」**（scanInteract 新分支 kind 'jerry'）→ 声望 +5（每次）+ **教化 +25** +
    触发**诵咏**（L274 内周期性不受控咏出崇拜词，HUD 消息流，JERRY_CHANT_LINES；离开即停）；
    **v47：接触内置 20s 冷却**（`engine.jerryContactCd`，防连点刷声望/教化；HUD 交互提示
    显示剩余秒数，冷却中接触被拦截并提示）；
    **教化满（≥100）**：成为信众一员——**无法主动离开 L274**（takeExit 拦截：
    「你属于这里。鹉主还需要你。」；开发者传送除外）；**教化未满主动离开 → 声望 -5**；
    **驯服**：对杰瑞**给予杏仁水**（useSlot 通道，消耗 1 瓶）→ 教化清零且此后接触不再积累；
    **但若被信众 NPC 看见**（~8m 内有信众）→ 视为亵渎，**声望 -10**；
    **v47 伤害杰瑞的代价**：攻击/伤害杰瑞实体一次 → **jerry 声望立即 -50**（信众哗然）；
    杀死杰瑞 → **声望直接 -100 彻底敌对**（信众立即攻击玩家）；
    **v47 教化攻击约束**：教化值 **>0 后无法再攻击杰瑞**（挥击/投掷波及对鹉主无效，
    提示「你下不去手」）；教化值 **≥50 后无法再攻击信众 NPC**（他们是你的兄弟姐妹）；
    驯服清零教化后约束解除（可再次出手）。
    **传教使命（v47 标准委托化）**：jerry 声望 **≥30** 才显示入口（L274 侍立信众 zeph/polly
    处，DialogOverlay 委托三选一 `questOffers('jerry')` + `genJerryQuest` 题库，QuestDef
    新 kind `preach`）→ 向指定据点的任意 NPC、或任意地点的其他团体 NPC 布道
    （对话「向 TA 传播鹉主的教义」，`preachTargetOk` 判定）→ 委托标记完成，
    代价**听道者所属团体 -5**；回 **L274 侍立信众处交付**（`turnInQuest('jerry')`）→
    **jerry 声望 +10 + 小物资**（信众无货币，rewardCoin 恒 0）；
    **有进行中的传教委托时离开 L274 不受声望惩罚**——可借接任务无损离开；
    v45 的 `engine.jerryPreach` 专属字段已废弃（委托随 quests 随存档持久）。
    全部行为链均有 engine-smoke 引擎级断言（认同+10/门槛拒入/接触+5+教化25+冷却20s+诵咏/
    满100拦出口/未满离开-5/驯服清零+见证-10/传教委托化≥30+三选一+布道+交付/
    借任务离开免罚/伤害杰瑞-50/杀死-100/教化攻击约束+驯服解除/L274 信众不主动传教）。
- **委托任务**（MEG=探险署中控室「夜莺」/ BNTG=商人之家迎宾廊「行商·蓝」/ 阿丽亚娜=实验室一
  技术员「勒费弗尔」/ **杰瑞的信众=Level 274 侍立信众（v47 传教使命标准委托化）**）：**三选一确认**。
  MEG 题库=层级调查/现象调查/实体调查/提交物品；BNTG 题库=征集稀有商品/押运包裹
  （把货送给 M.E.G. 的特定 NPC，当面交付即结算）；阿丽亚娜题库=**异常样本征集**
  （目标全部取自 `ItemDef.anomalous` 异常物品池：杏仁水×2/兔脚/万能钥匙/来源不明的书/
  迁跃浆果/福友玉/氙气玻璃珠/巨兽之肉/腰果水，rewardCoin 恒 0——集团无货币，酬谢只发
  声望 + 绷带/消毒液/杏仁水/罐头物资，困难目标声望 +14）；交付按委托方发放声望与货币
  （meg=天鹰币 / bntg=压印币 / 阿丽亚娜无货币——toast 只显示声望与物资）；
  困难任务接取赠迁跃浆果；物品栏「任务」页签查看进度。
  **v43 EL3A 物流任务**（新 kind `deliverGoods`，物流主管麦考利处三选一接取，`genEl3aQuest`）：
  接取即得实体物品「**物流包裹**」（parcel，stack 1 不可堆叠占背包格，目的地见委托标题/详情；
  背包满则接取失败）；收件人池=各据点固定 NPC（kat/夜莺/justin/蓝/奥托/杜邦/马丁/Tom/爱子），
  到目标 NPC 对话当面交付（`deliverGoodsTo`：扣包裹 + 压印币 + BNTG 声望）；
  **包裹丢失**（不在背包）时回麦考利处可「认定任务失败」（`failGoodsQuest`：任务移除 + 声望 -3）；
  三路径均有 engine-smoke 无头验证。
  声望/任务随存档持久。
- **货币**：**天鹰币**（Alpha 基地，stack 30，1 杏仁水 ↔ 1 币）与 **B.N.T.G.压印币**
  （presses 改造：stack 60，1 杏仁水 ↔ 2 币）；商人之家物价换算杏仁水比 Alpha 更贵，
  珍惜物品更贵（如皇家口粮 Alpha 30 币 vs 商人之家 70 压印币=35 杏仁水）；
  交易 NPC：奥托·格雷（主管·保险库总账）/ 塞德里克（经理·首席鉴定师）/ 玛戈（雇员·杂货摊主）
  （另有 TGPF 警备队长布洛克、雇员行商莱恩·卡特，及 4 名外文音译随机 NPC 看摊）；
  **Ferren**（Entity 92 雪貂）为无害实体而非人士：仅雪貂笼漫游（小半径就近游荡 +
  直线路径可走校验——不隔笼墙选点蹭墙，偶尔趴下歇息），攻击 -15 BNTG 声望、杀死 -50。
  商人之家视觉：现代商场整洁风（l102_*：白瓷砖/净粉刷/办公室吊顶 + **交易保险库**
  [卷帘门墙立在房间内部：中央 3 宽狭窄走廊贯通南北两口，两侧 x=38/x=42 各 14 扇
  1 宽卷帘门相连成墙（validateDoors 允许相邻卷帘门互认作墙、两端锚在外壳墙）——
  无门框：整幅波纹钢帘板与墙同高、等宽同纹无缝相连，仅顶部卷轴盒；
  各藏 1 扇真门通向墙后储藏区可升起取货，其余 26 扇 locked 锁死；NPC 在库外——
  账台在大厅北环、守卫在北门外；顶部长条灯 + tint=9 白色金属]，BNTG 标志为地球+环形飞鸽（bntg_logo.png/bntg_poster.png
  自制）+ 悬挂店招（shopsign：吊杆 + BNTG 招牌板 + 描边灯，店前脸与大厅中央）+
  **商业海报墙**（45+ 张多样广告沿大厅/店铺门脸/迎宾廊/南连廊/保险库外墙：
  促销/杏仁水/美食广场/数码科技/时尚新装/BNTG 标语 轮换，megposter data.tex，
  deco 校验改为实心面[砌墙或虚空]皆可挂）+
  商场风装饰（bench 长椅 / planter 花坛 / trashbin 垃圾桶 环布大厅与迎宾廊 +
  mall_arrow.png 地面导引箭头指向保险库——photo flat 贴花支持 data.tex/data.deg）；
  **以物易物**（v37 阿丽亚娜，集团无货币）：NPC 定义可选 `barter`（玩家给 give×giveN、
  换得 get×getN；v38 起可选第二食材 `give2`/`give2N` 复合菜谱），DialogOverlay trade 模式在
  无 `trade` 有 `barter` 时显示以物易物列表（无货币行）——杜邦（绷带×1→杏仁水×1 / 消毒液×1→罐装食品×1）、
  马丁（绷带×2→电池×1 / 消毒液×2→绷带×3）；v38 Tom 的餐馆沿用同一机制（食材换菜+来料加工，
  复合菜谱如 杏仁水×1+罐头×1→意式披萨）；
  身处据点时 HUD 状态栏下方显示该团体声望；DevPanel 状态页可 ±1/±10 调整声望
- **据点（Outpost）**：特殊的小型有限层级（`gen: 'outpost'`，完全手工布局——无任何
  随机物品/loot 容器/实体）。**不占 LEVELS 数字下标**：走独立 id 空间（100+，
  视为入口层级的子层级，`levelDefOf` 解析；`OutpostDef.parent` 记录主层级，v40）——
  **身处据点时 HUD 顶部信息栏层级号显示主层级**（LEVEL 1 / B1 / LEVEL 2 / LEVEL 3，而非 LEVEL 101~108；v40）。当前八个——**M.E.G. Alpha 基地**（id 101，
  label「Alpha 基地」，Level 1 天鹰段子层级；探险署/行政署/档案署/研究署 + 5 居民区 +
  北/东/西入口，K=1.25 放大至 80×80）、**商人之家**（id 102，B.N.T.G.，Level 1 跃金段子层级；
  商场式：中央交易保险库[房内卷帘门墙+中央窄走廊+墙后储藏区] + 环厅市场街店铺 +
  会议室/加工中心/公共生活区（南区经南店铺南北贯通门与大厅相连——否则孤岛回填会把整片填成墙））
  与**希波克拉底 - 1**（id 103，阿丽亚娜集团，Level 1 哥特段子层级；大型医药研究所/生物实验室：
  北入口迎宾廊+接待大厅[接待柜台/候诊长椅/花坛/公告栏/ariane_poster]、中央消毒走廊贯通南北、
  北翼手术室[手术台案+无影灯(hanglight)+药品柜]与药房[药品柜+货架排]、西翼 3 间病房
  [病床+输液架+药品柜]、东翼 2 间生物实验室[实验台+标本罐+药品柜]、南翼研究办公与值班宿舍；
  6 名固定 NPC[勒孔特/穆勒/杜邦/莫雷尔/马丁/勒费弗尔，全白制服+紫徽章，法语人名] + 4 名随机
  NPC[护工/药剂师/化验员等医疗风味]）与 **Tom 的餐馆**（id 104，**不属于任何团体的独立餐馆**
  [faction='wanderer'——无声望 UI/无准入拦截]，Level 1 天鹰段子层级，v38；家庭餐馆布局：
  北入口迎宾廊→前厅[前台柜台+菜单黑板(tom_menu.png 粉笔字黑板)+暖红招牌(tom_poster.png)+悬挂招牌]→
  中央餐厅[20 张白桌布餐桌(dtable 含对侧餐椅/餐盘餐具/小烛台)]、东翼厨房[灶台 stove×4/料理台
  kcounter×2/水槽 sink×2]→冷库[卧式冷冻柜 freezer×4+货架；非容器]→员工区、西北储藏间；
  2 名固定 NPC[Tom（意大利裔美国厨师，白色厨师服+暖红徽章，意大利口头禅）/ 佐藤爱子（前台跑堂，
  暖色制服——wikidot 设定：救过三百多人的「撒玛利亚人」，内向厌名，打工的容身之所）] + 5 名
  随机食客[genRandomNpcs 'mixed' flavor：faction 按序轮换 meg/bntg/ariane/wanderer（有团体穿团体色
  上衣，流浪者便装），名称池中英混合，职业池=避难者/旅人/吟游诗人/行商/前哨队员/讲故事的人，
  对话提及来历团体]；交易为 barter 以物易物（无货币）——Tom 处 9 条菜谱分简单/中等/复杂三档
  （番茄浓汤/蒜香烤面包/田园沙拉；番茄意面/炖肉煲/意式披萨；千层面(bigsanity)/Tom 招牌炖菜(rare)——
  菜肴为新物品且仅 Tom 处可得，glyph 新增 bowl/plate/bread），爱子处 2 条来料加工（巨兽之肉→
  烤兽肉排 / 干果与干菜×2→果酱面包））。**v46 第五个据点——办公区EL3A**（id 105，B.N.T.G.，
  **Level 2 整洁的廊道子层级**；存储/分配从 L2/L3 搜刮的物资，转运其他层级居住地）：
  **真多层双层据点**——（v54 起引擎多层机制泛化为楼层带 0|1|2：bandOfZ z≥4.5→2 / ≥1.5→1；
  GameMap 增加 `up2`/`upWall2`（3F 楼板/3F 墙体），读取侧经 `upAt/upWallAt(m, f)` 泛化访问；
  geometry 逐楼层带 f=1..floors-1 绘制楼板/墙/天花（板顶=f×FLOOR_H、板底=下一层天花，
  更上层楼板存在时本层天花不另画；坡道格不穿破本层顶才画本层天花）；
  **跌井守卫** `stairServesBand`：坡道只服务其到达的楼层带——从楼板踏入不到达本层的坡道段
  即拦截（canOccupy 严格容差 STEP_UP，bfs3D/entityWalkH 宽松容差 JUMP_REACH 保旧行为）；
  2F→3F 坡道走 `stampStairRun(..., base=FLOOR_H)`（可站标记按坡道面高度带分段：下段 up /
  上段 up2 / 交界格两带）；2D 孤岛回填跳过坡道格；三层先例=Gemma 基地，见下。
  **v54 多层墙面修复**：上层墙/上层天花几何改 setVCKeepUV 保留 UV + 全层级 worldWallUV(geo,1)
  世界空间 UV（此前 setVC 清零 UV、仅 L0/L3 靠 wuv 恢复——105/106/L4/L5/L274 上层墙贴图只采样
  单个纹素=无纹理平色）；**上层踢脚线**——upWall/upWall2 与地面起算高墙在 f×FLOOR_H 楼板边
  补饰条（面向本层房间侧面；楼梯口/栏杆边缘不加；白名单同主层 0/101-106）。
  「高层过高踢脚线」实机排查结论：踢脚线条永远只在 base+0.08m（离线探针枚举 106/105 全部墙格
  证实），用户所见「高踢脚线」实为楼板侧沿暗带（slab 侧面 fc×0.45，2.65..3.0/5.65..6.0）在上层
  墙面无纹理无饰条时的误读——UV 修复 + 上层踢脚线落地后楼板边读作地板沿，不再误读）——
  第一层=大开间仓库：北/中约 60% 为无楼板**挑高中庭**（托盘堆 pallet/
  货架 binshelf/建材碎料堆[全部装饰非 loot，据点铁律] + 歇脚区 + 黄色安全线地面导引），
  南侧约 40% 被夹楼覆盖（夹楼下=**装卸区**：承重柱顶到楼板底 2.65 + 货架/托盘）；
  第二层=**南侧一整片夹楼办公区**（v48 重排：up 楼板南侧单侧整铺 x13..68 × y41..60 ≈40%：
  临中庭北走廊 + 档案室/休息室[桌椅+自动售货机+长椅全部面朝公共区]/运营主任办公室/
  值班办公区[开放工位+值班铺]，upWall 隔墙各留门洞）；
  两部**真阶梯**（stampStairRun 坡道 + 三级踏步渲染 + 落地平滑斜面 + **实心斜扶手**[v49：
  handrail 加 data.h0/h1=坡道面在瓦片局部 -x/+x 端高度（相对结构底座，2F 侧挡段可为负下探），
  扶手/横杆旋转对齐坡角沿坡道两侧逐级倾斜上升，衔接落地端 1.0m 与落梯口夹楼栏杆；
  碰撞保持细条碰撞盒 FULL_BLOCK]，楼梯口上方有顶、坡道中段可跳——canOccupy 楼梯溢出放行修复换带卡死）上下；
  **灯光全部贴附**：挑高中庭**壁挂斜照大灯 walllamp**（贴墙灯箱向下投光 + fixZ 光源）洗墙 +
  **v49 挑高顶高顶灯 ×15**（hanglight 吊线灯具贴挑高真实顶 5.6 + fixZ=5.32/noFix 配套光源，
  r=9 暖白大半径——1F 挑高仓库地面/货架清晰可读，不再只靠壁灯），
  夹楼下网格灯贴楼板底 2.65，夹楼灯挂上层天花（z=FLOOR_H），
  挑高顶与夹楼天花拉平 5.6m（消除错层漂浮纹理），楼板底面独立 l105_ceil 吊顶纹理；
  **v49 低顶上方填墙**（通用规则，geometry）：低顶地板与挑高地板直接相邻处
  （迎宾廊口/东西门廊口——低层屋顶 3.0 到挑高顶 5.6 之间原本是虚空）按 `ceilingSteps`
  在分界线填薄墙封闭；墙瓦片底/顶计算抽出为 `wallBaseTopAt`（渲染与冒烟共用单一事实源，
  挑高侧低顶房间[物流办公室/兑换间]外墙顶=5.6）；
  **专属贴图 l105_***（**v49 墙面定制款**：CorrugatedSteel009 波纹钢 + PIL 叠加 BNTG 深绿水平饰条 +
  墙根黄黑安全标识带 / Concrete046 仓库混凝土 / OfficeCeiling001 吊顶，
  灰绿乘色；`scripts/gen-l105-textures.py` + `gen-el3a-poster.py` 可复现）；
  6 名固定 NPC[物流主管麦考利（发/收/认栽物流任务）/ 兑换员维斯珀（**仓库直销价**兑换基础物资
  [杏仁水/罐装食品/绷带/电池，压印币 2/2/1/2——比商人之家便宜] + **免费救济**：玩家基础物资
  总数 <2 时对话出现「免费领取补给包」（杏仁水×1+罐装食品×1，每次进入 EL3A 限领一次，
  engine.el3aReliefClaimed 每次进仓重置））/ 分拣员皮奇 / 搬运工布恩 / **运营主任惠特菲尔德**
  （2F 主任办公室，介绍据点与 L2/L3 物流线）/ **老会计科瓦尔斯基**（2F 休息室，闲聊+彩蛋——
  Tom 欠他一顿千层面），全 BNTG 灰绿制服+外文音译名；**NPC 支持楼层**（NpcState.floor：
  夹楼居民在 2F 游荡/交谈/被挥击判定都按楼层带过滤，渲染站在楼板）] +
  3 名随机 NPC（genRandomNpcs **'el3a' 专属池**：叉车司机/盘点员/质检员/装卸学徒/仓管文员/
  押运护卫，经历闲聊围绕 EL3A/L2/L3 物资线——不再与 Tom 餐馆的 'mixed' 共用）；
  zones 带 z 字段（0=主层 1=上层，大地图/小地图/当前区域名按层过滤；**大地图 1F/2F 切层按钮
  移到地图右侧缘竖排**；v54 按楼层数动态生成，支持 3F）。**v54 第六个据点——Gemma 基地**（id 106，
  M.E.G.，**Level 3 子层级**；wikidot Level 3 条目：M.E.G. 在 Level 3 的主要根据地，位于该层
  最大开阔区域，持续运作中，约数百名成员常年驻防）：**真三层单图**（引擎三层机制的首个三层
  据点，m.floors=3）——1F 公共部（迎宾廊+入口前厅[frontdesk 前台/长椅/公告栏/饮水机 vending]
  +开阔大厅[接待等候区成排长椅×2 排/公告栏墙多幅海报/花坛/自动售货机]+食堂[dtable×4+
  kcounter 打饭柜台×2 排队动线+收残垃圾桶+杏仁水海报]+医疗角[hospitalbed×2/ivstand/medcabinet
  +binshelf 货架隔断隔帘感]+补给兑换处[binshelf 货架+柜台+军需官]+东北资料室（v54e：原楼梯间B 的 1F 改普通房间——书架墙/阅览桌椅/登记台，南门接大厅；B 坡道仍悬于 3.0 上空、由 2F 平台进出））、**v54c 解耦重排**（上层平面独立于 1F 轮廓，见 §6）：2F 住宅部（宿舍A/B 两大间+
  观景廊[挑空中庭护墙]+洗漱间+储物间+**电视娱乐室**[彩色隔断小间 ×3——挂墙电视 deg 180 贴 2F 南墙+
  弧形休闲椅]+南翼三房间[休闲区沙发围合/阅览角书架阵列/储备角]+井廊[A 落梯厅]）、3F 行政部
  （会议A/B+主管办公室[harper]+办公室工位排+资料室+机房[serverrack/switchboard/servercase]+
  南翼[大档案室/档案二室/样品库]+井廊）；**挑空中庭**（前厅内腔上方取消 2F 板、双层挑高至 3F 板底，
  3F 屋面板墙封顶）；**v54c 上层楼板不再限 1F 地板正上方**（南向间墙/虚空带上方同样铺板；
  1F 墙在板下止于板底 2.65、仅邻挑空/外墙接到屋面 8.6）；两部 stampStairRun 坡道楼梯——
  A 段东南井廊 1F→2F（落 63,36）、B 段东北楼梯间 2F→3F（base=FLOOR_H，东西向），实心斜扶手
  贴坡两侧（进坡口/落梯口留空）；**v54e 楼梯间清理**——各楼梯间只出现在其连接的两层（A 井 3F 板填回[井道上方封顶=3F 板底，挑空黑洞消除]、两间挑高 ceiling=1 全取消、B 间 1F 改资料室、2F→3F 井道左侧的东北走廊[前厅东门→B 间]整段删除）；出口仅 1F 北部入口（dest='back'）；
  3 名固定 NPC[全 MEG 制服金徽章——**军需官布兰特·科尔**（1F 补给兑换处，**v54 杏仁水计价**
  [currency 新增 'almond'：wikidot 惯例杏仁水是通用等价物，不发天鹰币；交易面板无币互换按钮，
  量词「瓶」]：绷带 1/罐装食品 1/电池 2/撬棍 5）/**后勤官梅·林**（2F 走廊[娱乐室门口]，floor=1）/
  **基地主管哈珀·韦恩**（3F 主管办公室，floor=2，介绍 Gemma 基地与 L3 考察——监督者团队
  2008 首次勘探/高智能实体研究/物资富集）]+ 公共部 2 名随机居民（meg 池）；
  **专属贴图 l106_***（v54 全新下载：PaintedPlaster017 浅色涂装粉刷墙/Tiles006 办公地砖
  [含 2F/3F 楼板顶面]/PaintedPlaster015 涂装粉刷吊顶[兼作上层楼板底面]，
  `scripts/gen-l106-textures.py` 可复现；palette 按贴图微调——地砖带深色圆点胶粒，
  地板/墙面较 Alpha 略提亮半档）；踢脚线白名单含 106。**v54 第七个据点——存储设施**（id 107，
  B.N.T.G.，**Level 3 子层级**；wikidot Level 3 条目：B.N.T.G. 在 Level 3 设有存储设施）：
  单层仓库布局——北迎宾廊 + 存储大厅（货架双排六列/托盘堆/碎料堆[全部装饰非 loot]+黄色安全线
  地面导引）+ 西北仓管办公角（兑换柜台）+ 东北守卫室 + 东/西入口；l107_* 专属贴图
  （CorrugatedSteel003 波纹钢/Concrete028 仓库混凝土/PaintedPlaster016 涂装粉刷吊顶，
  `scripts/gen-l107-textures.py` 可复现）；3 名固定 NPC[**仓管主管多莉安·弗罗斯特**（办公角，
  压印币平价基础物资：杏仁水/罐头 2、绷带 1、电池 2、撬棍 4）/**守卫布鲁诺·冈特**（迎宾廊口岗哨）/
  **盘点员琵帕·洛**（货架巷道）]+ 3 名随机 NPC（bntg 池）。**v54 第八个据点——蓝色救赎**
  （id 108，**杰瑞的信众**，Level 3 子层级）：信众的蓝石圣所——入口廊+前厅+挑高大殿
  （ceiling=1 通高 + tint 17 蓝白圣辉；讲坛/长椅排[deg 朝向讲坛]/烛台 ×7/圣水盆一对/蓝色彩玻窗
  东西墙各三扇）+ 南侧信众居住区三间小室（床/小桌/烛灯）；l108_* 专属贴图（Bricks060 蓝灰石墙/
  PavingStones142 蓝灰石板/PaintedPlaster013 蓝色吊顶，蓝乘色处理同 l274 先例，
  `scripts/gen-l108-textures.py` 可复现）；2 名固定信众[**司事塞隆修士**（讲坛旁）/**艾拉修女**
  （东区长椅静修）——排在注册表最末尾（jerry 系之后），圣所内不主动传教/不显示认同选项
  （引擎按 level 108 拦截，同 L274 规则）]；**准入门槛：jerry 声望 >30**（enterOutpost 拦截：
  「你还不够虔诚。蓝色救赎只向真正的兄弟姐妹敞开。」；DevPanel 据点跳转 dev=true 不受限）。
  **v54 第九个据点——M.E.G. Omega 基地**（id 109，**Level 4 子层级**；wikidot/Fandom Level 4
  条目：Omega 是 M.E.G. 在 Level 4 的主要基地）：单层**多房间**布局（v54c 细化，参照 Alpha 手工分区）——
  走廊网（北横廊+中纵廊+南横廊）串联：档案与数据中心拆为**数据厅A/B**（成排工位 ×36——
  v54c 工位二选一：desk[自带小屏幕]工位不紧邻 bigcomputer，配大机的工位用简桌 table）+
  **机房**（serverrack 阵列双列/switchboard/servercase 排/监控台）+ **档案室**（独立成间：
  libshelf 双列阵列 + 查找台 + megdoc 层级档案）+ **会议室/主管办公室**；居住区拆**宿舍间**与
  **医护盥洗室**（含免费自动售货机）；仓储区独立**库房**（货架排/托盘/碎料堆，全部装饰非 loot）；
  4 格灯网 r5.5 暖白全基地明亮；l109_* 现代办公净白贴图（v54c 两次换料定稿：PaintedPlaster004 平整净白粉刷墙/
  Carpet014 整洁浅灰方块地毯/PaintedPlaster010 粉刷吊顶，`scripts/gen-l109-textures.py` 可复现）。
  **v55 第十个据点——M.E.G. 哨所「家政服务」**（id 110，**Level 5 子层级**；wikidot L5 条目
  Outpost「Housekeeping」）：小型前哨（改造少、单层小布局）——前厅（登记台+休息角+公告板）/
  补给间（货架+工作台）/宿舍（行军床×2）/维修角；固定 NPC ×3（MEG 行政灰蓝制服）：哨所长
  巴克利·奥登（登记簿配饰）/补给员佩特拉·沃斯（杏仁水计价交易 ×5 种）/维修工奥蒂斯·兰格
  （工具腰带+扳手配饰）+随机 MEG 居民 ×1；地标=**走廊告示**（~1.5%/chunk 贴墙海报形 landmark，
  PIL 贴图 l5_notice.png，`scripts/gen-l5-notice.py` 可复现，出生 chunk 跳过）。
  **v55 第十一个据点——家常酒店**（id 111，parent 5；新阵营 **homely**[无 logo/hasRep=false]）：
  现代酒店布局——大堂（前台+沙发休息区+电视+吊灯+盆栽）/餐厅角/客房 201·202；固定 NPC：前台
  维维安·克罗斯/服务员玛戈·林（交易咖啡·罐头·银餐具）/长住客哈罗德·芬奇+随机住客 ×2；
  **入住申请门槛**——首次经地标前往须先在 LandmarkOverlay 提交「流浪者信息申请」（姓名自动取
  玩家形象名，确认即提交），engine.applyHomelyStay() 置 homelyApplied（SaveSnapshot 全链持久），
  未申请 enterOutpost 拦截/申请后永久放行/dev 跳转不受限（outpost-smoke 三态桩测）；
  地标=主厅墙壁标志牌（~30%/厅，l5_homelysign.png）。
  **v55 第十二个据点——原住民**（parent 5；新阵营 **originals**[无 logo/hasRep=false=无法加入]）：
  1930 前风格居所——老式客厅（古董沙发围合/留声机/烛台/红金地毯/夫妇肖像/壁炉感拼件）/藏书角/卧室；
  固定 NPC ×7 历史失踪者（v55 扩）：阿梅莉亚·埃尔哈特（飞行皮帽+护目镜）/多萝西·阿诺德（小礼帽+珍珠项链）/
  约翰·雅各布·阿斯特四世（怀表链，barter×4）/爱德华·史密斯船长（白船长帽）/吉米·霍法（雪茄，barter×3）/
  **约翰·怀特**（罗阿诺克总督，都铎皱领+总督链，barter×2）/**所罗门·诺瑟普**（作家·小提琴手，臂弯笔记本+领巾，
  barter×2）——对外戒备但**以物易物**；**邀请函准入**（v55 改为地标式可交互装饰）：新结构 invitation（非实心，贴地平放奶白信封+烫金边+
  暗红火漆印低模）贝弗莉室 ~30%/厅 散落——交互走地标链路（弹地标卡：邀请函内容+「前往拜访」，
  确认即进入）；**无门槛直达**（物品形式已删除：items/itemsMesh/PIXEL_ICON 清理，enterOutpost 拦截段移除）。
  6 名固定 NPC（注册在 jerry 系之前）[主管惠特克/档案员艾琳/数据技师格罗夫/仓管霍布斯/医护萨伊拉/
  守卫沃斯]+ 4 名随机（meg 池）；出口：北部入口 back + **楼梯间固定 →Level 5（v54c 改古典楼梯 oldstairs：
  井口护栏 + stairrail 碰撞 + 离墙净空；楼梯间已缩小至井道+缓冲）+ 库房旧活板门固定 →Level 6（trapdoor）**；海报形定居点地标 omega_poster.png（鹰徽+档案柜，
  `scripts/gen-l109-poster.py`）由 infiniteL4 按 ~2.5%/chunk 贴墙放置（校验同 bigpainting 规则）。

  - 进入即获完整地图（`LevelDef.fullMap`）；同局反复进入布局恒定（mapSeed 由局种子派生），
    `outpostReturn` 随存档持久，据点出口 `dest: 'back'` 返回来源层
  - **定居点地标**（StructKind `landmark`）：L1 天鹰段（alpha ~4% / **tom ~1.5%**[v38，独立判定，
    暖红布料]）/ 跃金段（bntg）/ 哥特段（ariane，v37 紫环布料）各按 chunk 概率生成，
    **L2 整洁的廊道 tidy 变体（el3a，v46 改为贴墙海报形：data.poster=1 + el3a_poster.png——
    BNTG 绿底「办公区EL3A 存储与分配」仓库/办公楼图案，placeWallHug 贴在廊道墙上，~2%）**；
    **L3 照明/晦暗廊道（v54：三据点地标全部贴墙海报形——gamma 鹰徽「M.E.G. Gemma 基地」~3% /
    storage 绿底天平「存储设施」~3% / bluesalvation 蓝底鹉羽「蓝色救赎」~1% 显著更低，
    data.poster=1 + 对应海报贴图，`scripts/gen-l3-posters.py` 可复现；**L4（omega 鹰徽「Omega 基地」~2.5%，gen-l109-poster.py）**；贴墙校验同 bigpainting 级别：
    挂点即地板+邻侧墙、非一人宽隧道、出生 chunk 与圣所/特征房间 chunk 不放）**；
    （亮色布料+物资+纸条，wikidot 罗经点小队设定；EL3A 为海报形式）；
    交互弹出地标卡（LandmarkOverlay）→「前往」切层；
    小地图/大地图鲜黄三角标注；DevPanel 传送页可传最近地标
- **NPC**：有名有姓的据点居民（`npcs.ts` 注册表：性格/职业/经历/对话树/自言自语/交易）。
  **NPC 不是实体**（不进 m.entities/ENTITIES，dev 面板不可召唤）

  - 建模：`buildPlayerModel(手工定制固定形象)`——每人形象独特、精致、不变（非随机），
    制服上衣/胸口徽章 + 标志配饰（Kat 文件夹 / Justin 咖啡杯 / 夜莺耳机 / River 眼镜+书堆 /
    Faust 眼镜+蓝手套 / 算盘手持算盘；**v40 职业配饰**：Tom 厨师高帽+围裙 / 爱子蝴蝶结发饰+小围裙
    +**金色斧头「幸运」** / 马丁护士帽[白+紫十字] / 杜邦听诊器挂颈 / 勒费弗尔护目镜[推在额头] /
    莫雷尔手术帽+口罩 / 勒孔特对讲耳机+挂绳对讲机 / 穆勒手持捕虫网 / 蓝头巾 / 老账房老花镜+账本 /
    塞德里克放大镜 / 玛戈腰侧算盘串 / 布洛克斜挎肩带+警棍）；岗位附近缓慢游荡，偶尔头顶气泡自言自语。
    配饰通道 v40 抽为共享模块 **`renderer/npcGear.ts`（`applyNpcGear`）**——游戏内 renderer 与
    图鉴「人士」页档案走同一通道；**v41 档案改为静态肖像**（`npcPortrait.ts`：共享单个 WebGLRenderer
    渲染成 dataURL 以  展示）——修复「每卡一个实时上下文，遇见 NPC 一多就爆浏览器 WebGL
    上下文上限、主画面上下文被挤掉（视角变纯色+无法行动）」的崩溃
  - 交谈（DialogOverlay，RPG 式）：预制对话树（未接 API 时玩家只能选预制回复）；
    接入 API 后出现「聊天页面」（聊天软件式气泡流）——聊天记录跨局持久化（`br_npc_chat`）
    并喂回模型上下文（NPC「记住」历史），图鉴「人士」页可展开查看记录
  - 交易：**天鹰币**结算（Alpha 基地专属货币，堆叠 30，与杏仁水 1:1 双向互换，仅限基地内使用；
    图标为像素手绘）：万能钥匙 8 / 皇家口粮 30 / 迁跃浆果 20 / 滋水枪 12 / 福友玉 10；
    **v54：`currency` 新增 'almond'**（直接以杏仁水计价——Gemma 基地军需官；交易面板不显示
    币互换按钮，量词「瓶」，声望八折/银舌头 95 折照常生效）
  - **地图**：小地图/大地图软绿点标 NPC 位置（大地图带姓名）；大地图标注据点区域名
    （GameMap.zones：四行署 + 五居民区 + 三入口）；大地图可拖动平移（回正按钮复位）、
    PC 滚轮以光标为锚点缩放（2~10×，原生 wheel 监听 preventDefault）；
    **v43 多层地图**：大地图默认显示玩家所在层（1F=主层 tiles，2F=up 楼板——灰绿底色区分；
    v54：3F=up2 楼板），floors>1 时出现 1F/2F(/3F) 切换按钮（标注玩家当前层，按楼层数动态生成），
    瓦片/结构/出口/NPC/容器/物品/zones 全部按层过滤（结构读 `floor` 字段、物品读 z 高度带、zones 读 z 字段），
    「当前 XF / 共N层」文本保留；小地图只画玩家当前层（band 过滤，不叠层），
    小地图下方显示当前区域名（无限层=区段/变种房间，据点=所在区域，多层时按层过滤；
    v58：L6 地下层 FloorBand -1 统一显示「地下廊道」，不再跟随地表变体名）
  - **随机 NPC**：空旷居民区概率生成 4 名普通居民（名称/职业/性格/经历随机且不重叠，
    `genRandomNpcs`；定义走 `GameMap.npcDefs`，图鉴「人士」页合并展示 `engine.knownNpcs`）；
    未接 API 时只能闲聊随机内容，接入后可进聊天页面；全新开局清空随机 NPC 图鉴与全部聊天记录
    （「继续游戏」保留，`br_npc_chat` 跨局持久）
  - **LLM 自由对话 prompt（v55，`llm.ts buildNpcPrompt`，与请求解耦可离线断言）**：五段注入——
    ① 角色卡（姓名/职业/性格/经历原样）② 所处环境（据点=名+intro 摘要；层级=层级名+氛围句）
    ③ 所属团体（名+简介）④ 后室常识包（层级/切出/杏仁水/实体/据点，写死摘要）
    ⑤ 说话方式（角色口吻短句不跳戏；**原住民=1300~1940 年代谈吐、不用现代词汇**，
    历史名人注入原型身份——埃尔哈特 1937/阿诺德 1910/阿斯特四世与史密斯船长 1912 泰坦尼克号/霍法 1975/
    怀特 1587 罗阿诺克总督/诺瑟普 为奴十二年的自由作家与小提琴手）；
    聊天记录喂回上下文与失败回退预制对话不变；BRC 员工沉默设定不变（对话窗本就无聊天入口）。
    **v55 长输入修复**：全程长度预算（prompt 各段 ≤700 字、历史按字符窗口装填 ≤1500 字[弃最旧]、用户输入 ≤500 字截断，
    `LLM_LIMITS`/`trimHistory`）——旧 `slice(-8)` 长记录会顶爆本地模型上下文（400）或拉长 prefill 超 15s 超时；
    分错重试：HTTP 400/413 自动裁剪（历史 400/输入 200）重发一次，网络抖动/超时/5xx 原样重试一次，两败才回退「通讯杂音」
  - **存档槽位**（v54，`engine/save.ts`）：3 手动槽 + 1 自动保存槽（localStorage `br_save_slot1/2/3` +
    `br_save_auto`；旧单存档 `br_save`/`br_save_state` 首次读取时迁移为槽 1 并清除旧键）。
    自动槽写入时机 = **切层**（loadLevel 非读档路径）+ **游戏进行中每 60 秒**；手动槽写入 =
    暂停/退回标题落盘（`engine.saveSlot` 绑定槽）与新开局。死亡/通关清空本局
    绑定槽与自动槽（`clearRunSlots`），其余槽位的别的局不受影响。
    **UI（v54 二轮）**：标题屏首屏为「开始游戏」（直接新开、绑定槽 1）/「继续游戏」双主按钮——
    点「继续游戏」才进入槽位页（每槽显示层级/磁带进度/保存时间，空槽标注「空」，自动槽只读仅可继续）；
    暂停菜单「保存游戏」展开手动槽选择（3 手动槽可选、自动槽不可手选），保存到所选槽并绑定为当前槽。
    **UI（v54 三轮）**：槽位页加宽加高（桌面 560px / 面板限高 62dvh 可滚动），**自动保存槽置顶**（只读标注，
    手动槽 1/2/3 随后）；手动槽条目加「删」按钮——
    先弹确认窗（「确定删除槽 N 的存档？此操作不可恢复」）再删除，自动槽不可删除；
    暂停菜单「保存游戏」选已有存档的手动槽时先弹**覆盖确认窗**（显示该槽现有层级/磁带/时间摘要），确认才写入
  - **据点寄存仓库**（v54，`engine/warehouse.ts` + DialogOverlay 仓库模式）：寄存 NPC 由
    `NpcDef.warehouse` 标记——Alpha 军需官「算盘」/ Gemma 军需官布兰特 / Omega 仓管霍布斯（MEG 仓）、
    存储设施仓管主管多莉安 / EL3A 兑换员薇拉（BNTG 仓）；**对应团体声望 ≥10**（=10 即解锁）对话出现
    「寄存物品 / 取回物品」；**BNTG 付费通道**（v54 三轮）：声望不足时可付 5 压印币临时使用
    （`warehouseTempUnlock` 不持久，对话窗卸载即清空恢复锁定），MEG 侧纯声望门槛无付费通道。
    **按阵营互通**（MEG 仓=Alpha/Gemma/Omega 同一库存；
    BNTG 仓=存储设施/EL3A 同一库存），**每阵营 48 栏位**；堆叠并摞规则同背包（同类同 tag 合并）、
    装备位物品需先卸下；库存随槽位快照持久（EFFECTS 注册表 newRun 重置）
  - **皇家口粮**：堆叠 1、非消耗品（使用不消耗，仅 25%「全部吃光」触发时被吃掉）
  - **切入**：进入据点走专属切入动画（'outpost'：鲜黄路标汇拢 + 暖光亮起 + 字幕
    「你跟着鲜黄色地标指示的路线，成功抵达了」），跳过层级卡
- **据点视觉**（v35）：明亮办公风——奶油粉刷墙/白色方砖/亮白吊顶贴图（l101_*，ambientCG），
  民居暖木 tint=8；机柜/转椅/货架/双层床/投影幕精致家具（serverrack/officechair/binshelf/bunkbed/screenboard）；
  墙面装饰（noticeboard 公告栏 / megposter 标语海报 / photo 相片，自制贴图，
  **mountOnWall 强制贴墙**——实心面（砌墙或虚空）皆可，四邻全空则搜 3 格内最近墙面
  整体平移过去，装饰绝不浮空；椅子朝向机制[邻桌朝桌/无桌背墙]；
  **v48 缺省朝向约定**：柜类（cabinet/dresser/libshelf/binshelf/locker）与转椅（officechair）
  缺省走 faceOutward——**背贴最近墙、正面朝房间内部**（officechair「邻桌朝桌」优先，
  L601 阵列书架带 data.row 不转，data.deg 可显式覆盖；**v54：vending 自动售货机纳入同一约定**——
  缺省 faceOutward+flushToWall 贴墙位移，data.deg 显式指定时只旋转不贴墙；碰撞盒同步精确化
  [structColliders 0.95×0.7，贴墙位移与渲染层一致]，消除整瓦片空气墙）；玻璃贴墙窗（glasswin，含 L274 蓝彩玻）
  缺省走 mountOnWall——**贴最近墙、玻璃面朝室内**；黑窗类（windowblack/windowtrap/hotelwindow）
  本就走 wallDir 贴墙朝室内，保持不变；mesh-smoke 已加贴墙场景朝向断言）+
  天花通风口格栅（ventgrate，仅风口无管道）；灯光为紧凑整齐的 4 格网格（r=5 暖白光，~127 盏）；
  据点与 L0 墙面带**踢脚线**（geometry 墙根深色饰条，门洞墙不加）；继续游戏跳过开场坠落动画。
  **希波克拉底 - 1 视觉**（v37）：洁白医药研究所——l103_* 贴图（洁白粉刷/白色方砖/亮白办公吊顶，
  Plaster006/Tiles107/OfficeCeiling003，`scripts/gen-l103-textures.py` 可复现）+ 医疗家具 5 种
  （hospitalbed 病床[床头摇起] / ivstand 输液架[半透明输液袋] / medcabinet 药品柜[玻璃门+紫十字] /
  labbench 实验台[显微镜+试管组+烧杯] / specimentank 标本罐[半透明自发光液体+悬浮样本]）+
  ariane_logo/ariane_poster（PIL 自制：16 个 #8676e2 紫色圆环组成的圆环，
  `scripts/gen-ariane-posters.py` 可复现）；NPC 全员白色制服 + #8676e2 紫徽章；冷白紧凑灯网。
  **v38 改色**（参考图：医院走廊）：palette 乘色改 暖米墙面(#e6ddcb)/蓝灰地面(#cfd6dd)/暖白灯光(#fff2dc)
  ——贴图不重下；墙面**扶手带**（geometry 墙循环内 def.id===103 分支，与踢脚线同处：沿走廊墙两条
  水平饰条——腰高主扶手带 y0.86~0.96 白-蓝(#3a6ab0)-白三层[蓝层 0.06m 微凸出墙面] + y≈0.30 辅助细条，
  门洞墙随踢脚线同路跳过）；医疗家具按坐标奇偶 (s.x+s.y)%3 实例级变色——hospitalbed 毯子
  浅蓝/薄荷/薰衣草（枕头保持白）、ivstand 输液袋 透明/淡黄/淡粉、specimentank 液体 淡紫/淡绿/淡琥珀，
  另有 medcabinet 薄荷白柜体+深色把手边框（紫十字保留）、labbench 石板灰台面（试管彩色保留）——
  不再清一色纯白，保持医院洁净感。
  **Tom 的餐馆视觉**（v38）：暖色家庭餐馆——l104_* 贴图（Plaster005 暖粉刷/WoodFloor043 暖木地板/
  OfficeCeiling001 吊顶，`scripts/gen-l104-textures.py` 可复现）+ 餐馆家具 5 种（stove 灶台[四炉眼+
  锅+防油背板] / kcounter 料理台[橱柜+挂勺刀架] / sink 水槽[双槽+水龙头] / freezer 卧式冷冻柜[非容器] /
  dtable 餐桌[白桌布圆桌+餐盘餐具+小烛台+对侧双餐椅]）+ tom_menu/tom_poster（PIL 自制：粉笔字菜单
  黑板/暖红招牌，`scripts/gen-tom-posters.py` 可复现）；暖白紧凑灯网；踢脚线同其他据点。
- **据点 BGM**（v36）：程序合成的舒缓安全区小曲——C 大调五声音阶随机漫步分解
  （软三角音+回声，melIdx 漫步）+ I→V→vi→IV 暖低音 + 偶发音乐盒泛音 + C/D/E/F 大三和弦
  drone 软垫（101/102/103/104 四色），步长放慢 0.62s；与外部层级的阴冷 drone 形成「到家了」对照。
  **v56：MIDI 曲风下据点播放所属团体独立曲目**——每团体一首 .mid（M.E.G./BNTG/阿丽亚娜/BRC/
  流浪者/杰瑞的信众/家常酒店/原住民八首），进入不同团体的据点即换该团体的曲子；
  **Tom 的餐馆为专属曲 `tom.mid`**（G 大调 6/8 温暖船歌，不走流浪者团体曲）（见 §3.10）。
  已删除出口提示音（原每 2.2s 双音滴滴，据点出口密集处极刺耳）；
  startHum 据点 id≥100 不再乘出 656Hz 高频哼声（固定 56Hz 低频电流嗡）
- **图鉴**：新增「据点」（进入即解锁简介）与「人士」（只显示遇见过的）两个分类
- **出口方向指引**：默认仅 30m 内显示（DevPanel 世界页可 ±10/50m 增大）；附近无出口
  但有定居点地标时改为**蓝色地标指引**（箭头+文案变蓝）

#### 据点与 NPC（v53b~v54）

- 通用真多层机制落地（楼层带 0|1|2、up2/upWall2、2F→3F 坡道 stampStairRun(base=FLOOR_H)、跌井守卫 stairServesBand），并据此建成 Gemma 基地（106，首个三层单图据点）（v54）。
- 新增存储设施（107，B.N.T.G. 物资仓）与蓝色救赎（108，杰瑞的信众蓝石圣所，jerry 声望 >30 准入门槛）两据点，三据点均有海报形地标（gamma/storage/bluesalvation）（v54）。

#### v54 杂项·据点/存档/NPC
- 存档槽位：3 手动槽 + 1 自动保存槽（切层 + 每 60s 写自动槽；暂停/退标题写绑定槽；自动槽只读可继续），标题屏槽位列表（层级/磁带/时间），旧单存档自动迁移为槽 1——见 §3.9（v54）。
- 据点寄存仓库：5 据点各设寄存 NPC（算盘/布兰特/霍布斯=meg，薇拉/多莉安=bntg），声望 >10 开放，阵营互通每阵营 48 栏，随存档持久——见 §3.9（v54 二轮）。
- M.E.G. Omega 基地（id 109，L4 子层级）——见 §3.9/§4。
- 蓝色救赎（108）烛光贴附修复：烛光点全部落在烛台瓦片（fixZ 烛火高 + noFix，灯具=烛台模型——此前悬空错格）。
- Gemma 基地 2F 新增电视娱乐室（彩色 cubicle 隔断小间 ×3 + 挂墙电视 walltv + 新结构 loungechair 弧形休闲椅
  [data.color 配色]；公共休息角改造；v54d 电视由立式 tvset 改挂墙版，tvset 结构保留备用）。
- 蓝色救赎（108）灯光坐标缩放修复：灯光网格循环误把地图坐标再过 X() 缩放（整体偏向右下 ×1.25）——
  网格灯改直推地图坐标；outpost-smoke 断言全部灯光落在地板瓦片。

#### v54c 批次·三（Omega 踢脚线/2F 顶板碰撞）

- 踢脚线白名单加入 Omega 基地（id 109，主层墙循环与多层高层饰条两处；107/108 不动）。
- 2F→3F 顶板碰撞修复：根因非跳跃拦截缺失（ceilingHeightAt band1 上方有 3F 板时已正确取 5.65），
  而是**带界误吸**——band 随 z 即时翻转，z 滞留带界区间（4.5..5.65）时 band=2 的「地面」被取成
  3F 板面 6.0，贴地跟随把人直接吸穿 3F 板（同构 1F→2F：1.5..2.65 区间吸上 3.0）。
  movement.ts 新增 gBand 降带：本格有上层板且 z 未达板底时，地面/顶板夹取一律按下一层带算
  （坡道格豁免）；engine-smoke 新增 2F 跳跃顶点 ≈4.10 拦截 + 板下滞留落回 2F 断言，
  outpost-smoke 新增 band1 天花 5.65 多格抽样断言；EL3A 与 1F 既有断言不回归。

#### v55 批次·六（L5 前哨与小型团体）

- M.E.G. 哨所「家政服务」（id 110，meg）：小型前哨（登记台/补给间/宿舍/维修角），3 固定 NPC
  （哨所长奥登/补给员沃斯[交易]/维修工兰格）+随机居民；走廊告示地标 ~1.5%/chunk（PIL l5_notice.png）。
- 家常酒店（id 111，新阵营 homely 无 logo）：现代酒店布局（前台大堂/餐厅角/客房）；入住申请门槛
  （LandmarkOverlay 提交申请 → homelyApplied 存档持久；未申请拦截、dev 不受限）；主厅墙壁标志牌地标。
- 原住民（id 112，新阵营 originals 无法加入）：1930 前居所；5 名历史失踪者（埃尔哈特/阿诺德/
  阿斯特四世/史密斯船长/霍法）barter 以物易物；邀请函准入（新物品 invitation 贝弗莉室散落，
  持有即解锁拜访）。
- 注册链：l110/l111/l112 + outposts.ts + factions.ts ×2 + npcs.ts 11 名（jerry 系保持注册表末尾）+
  mapgenOutpost 三 gen + infiniteL5 地标/邀请函 + itemsMesh 邀请函低模 + npcGear 配饰 11 件；
  outpost-smoke 三态准入桩测 + 地标/邀请函生成率区间断言。踩坑：门廊未达连通回填、容器铁律按
  CONTAINER_KINDS 判定（装饰柜换非容器件）、床朝向墙距校验。

#### v55 批次·七（原住民扩员/据点贴图/NPC 名称规范）

- 原住民固定 NPC 扩为 7 人：补约翰·怀特（罗阿诺克总督，都铎皱领+总督链）与所罗门·诺瑟普
  （作家·小提琴手，笔记本+领巾），对话树/自言自语按历史人物气质；barter 表扩至 11 条。
- L5 三据点（110/111/112）沿用主层级贴图：shared.ts 新增 LEVEL_TEX_ALIAS 别名映射（l5_wall/floor/ceil），
  geometry/structures 全部 `l${id}_*` 拼接点走 texLevelId()；SOURCES.md 注明沿用。
- 据点贴墙装饰浮空修复（112 肖像/烛台避门洞门廊格，三据点复检浮空 0）。
- NPC 名称规范：名称不含职位、真名统一「名·姓」——改名 10 名（id 不动，引用点全同步）：
  浮士德·格雷/艾略特·惠特克/艾琳·福斯特/德温·格罗夫/厄尔·霍布斯/萨伊拉·昆恩/迪特·沃斯/
  塞德里克·科尔曼/玛戈·坦恩/布洛克·奎；代号（夜莺/算盘/糖佬）与纯拉丁/CJK 姓名豁免；
  outpost-smoke 新增名称规范断言。

#### v55 批次·七（邀请函地标化）

- invitation 从物品改为可交互装饰结构（非实心、烫金信封低模沿用物品建模元素）：贝弗莉室 ~30%/厅 散落，
  交互走地标链路（scanInteract 'landmark' → LandmarkOverlay 地标卡[邀请函文案+前往拜访] → enterOutpost）；
  物品形式全删（items/itemsMesh/PIXEL_ICON 清理）、enterOutpost 的 hasItem 拦截段移除——无门槛直达。
- 注册随迁：decorRegistry（nonsolid+交互标记）/DECORATIONS.md/mesh-smoke KINDS（176 种）；
  outpost-smoke 断言改写（结构生成率/非实心/data.outpost/只出贝弗莉/物品零残留/无门槛放行）。

#### v55 批次·八（L5 据点配色墙饰统一）

- 三据点（110/111/112）palette 对齐 L5 主层级（floor #5e2f33/wall #5a2e30/wallTop #402224/light #ffd9a0 等），
  点缀色保留辨识（110 MEG 黄/111 酒店青灰/112 L5 金）。
- 墙壁装饰统一：踢脚线白名单（主层+SKIRT 两处）加 110/111/112；L5 墙裙分色（奶白下板+金色腰线）
  判定由 def.id===5 改为 texLevelId(def.id)===5——与贴图别名共用同一映射表，三据点自动同享。

#### v55 批次·九（邀请函地标待遇修复）

- 地标判定通用化：content/outposts.ts 新增 `isLandmarkStruct(s)`（kind==='landmark' || data.outpost 存在），
  替换全部 5 处按 kind 过滤的判定（nearestLandmark 蓝色地标指引 / dev.ts 最近地标传送与 landmarks 列表 /
  HUD 小地图三角 / InventoryOverlay 大地图标注）——invitation 享全部定居点地标待遇；下一种带
  data.outpost 的地标形态自动全路径生效。
- 弹卡解析链加固：outpost-smoke 新增桩测断言（doInteract(invitation) → 事件必须 landmark/originals，
  兜底到 alpha 即红）——锁定 scanInteract → doInteract → emit → LandmarkOverlay 全链。

### 3.10 音频系统与音乐（v56：BGM 双曲风 + MIDI 文件播放）

- **音频架构**（`core/audio.ts`，WebAudio 全程序合成）：主总线 `master` → 水下低通 `uwFilter` → destination；
  四条分路总线——`ambient`（荧光灯嗡鸣 `startHum` + L4 雨声 `startRain`）/ `sfx`（全部单发音效）/
  `bgmBus`（BGM，经 `bgmFilter` 低通——低理智闷化 `setSanityDistort`）/ 留声机 `phonoGain`
  （并入 bgmBus，近场闪避 BGM 75%，`setPhono`）；L3 配电箱电流嗡鸣 `setElecHum` 按距离逐帧调音量。
- **BGM 双曲风**（设置 → 音频「BGM 曲风」，`settings.bgmStyle`，默认 `procedural`；
  切换即重开当前层级 BGM，经 `audio.setBgmStyle`）：
  - **程序化 procedural**（既有梦核 BGM）：持续 drone 声部（`buildDrones` 每层不同低音组合，
    L0 荧光灯嗡鸣 / L3 电压嗡鸣 / L7 水压低频 / 据点大三和弦软垫等）+ 按层 16 步随机旋律 tick
    （`tickLayer`：L0 走调钢琴 / L2 蒸汽嘶声 / L3 电流琶音 / L5 酒店爵士 / 据点五声音阶随机漫步）；
  - **MIDI**：直接加载播放 `public/music/` 下的**标准 MIDI 文件（.mid）**——13 个层级
    （`l0`~`l11`、`l601`）+ 8 个团体（`meg/bntg/ariane/brc/wanderer/jerry/homely/originals`）
    + Tom 的餐馆专属曲 `tom.mid`。
    曲目为梦核电台风格长曲（和弦循环 pad + 钢琴琶音 + 音乐盒旋律回声 + 人性化抖动，
    40~48 小节 / 3000+ 音符级），与程序化的 drone 氛围曲明显不同。
- **MIDI 管线**：
  - **文件来源**：层级曲目由外部作曲工作区 `generate_levels.py` 生成（每层差异化曲风：
    L0 C 利底亚五和弦循环 / L1 Dm 六和弦+金属敲击 / L2 C# 弗里几亚 / L3 E 小调 5/4 机械脉冲 /
    L4 F 大调 AABA 曲式 / L5 Dm 3/4 华尔兹+三声中部 / L6 不规则极简 / L7 Bm 鲸歌滑音 pitch bend /
    L8 Dm 多利亚不规则节奏 / L9 G 大调 6/8 摇摆 / L10 五声琶音 / L11 鼓组+切分贝斯 vaporwave /
    L601 沿用「梦中的海」）；团体曲目由 `generate_factions.py` 生成（**每团体一首独立曲**：
    M.E.G. C 大调弦乐主旋「灯塔」 / BNTG F 大调电钢 comp+轻鼓「集市」 / 阿丽亚娜 D 大调 3/4 洁净弦乐 /
    BRC E 小调机械脉冲+捶打鼓 / 流浪者 D 小调 3/4 钢琴民谣 / 杰瑞的信众 B 小调合唱+催眠八音盒 /
    家常酒店 E 大调电钢 muzak / 原住民 G 大调摇摆狐步+小号线 / **Tom 的餐馆 G 大调 6/8 温暖船歌
    「后室最像家的一张餐桌」**）。
  - **解析**（`core/midi.ts`）：SMF0/1 解析（VLQ / 运行状态 / 多轨 / tempo map / meta / 打击乐轨）→
    扁平化音符事件列表（绝对秒 + 时长），`loadMidi` fetch + 模块级 Promise 缓存；
  - **合成器**（audio.ts `midiVoice`/`drum`）：GM 音色号 → 10 种 WebAudio 合成音色族
    （钢琴 prog≤3 / 电钢琴 4-7 / 钟琴类 8-15 / 贝斯 32-39 / 弦乐 48-51 / 合唱 52-55 / 铜管 56-63 /
    长笛 72-79 / 主音 80-87 / pad 88-103）+ 打击乐轨（ch9：底鼓 35/36、军鼓 38/40、踩镲 42/44/46）；
    lookahead 调度（80ms interval + 0.6s 窗口）按 `song.duration` 无缝循环，层 gain 交叉淡入淡出 +
    空间回声总线；低理智时音高漂移（`drift ∝ distort`）。
  - **音色分级**（`HARSH_LEVELS`）：危险层级（L2/L3/L6/L7/L8/L9，Class 3+ / 高实体密度 / 极端环境）
    保留原锯齿波锐利音色；其余层级与据点改用三角波 + 更低通滤波的舒缓音色
    （lead/brass/strings 三族按 `midiLayer.harsh` 分叉——L3 电站的电流琶音保持锐利，
    L11 与各团体曲目变柔）。
  - **据点 = 团体曲**（`midiUrlFor`）：进入据点按 `OUTPOSTS.faction` 播放对应团体 .mid——
    进入不同团体的据点换不同 BGM。对照：M.E.G. Alpha/Gemma/Omega/家政服务 → `meg.mid`；
    商人之家/办公区EL3A/存储设施 → `bntg.mid`；希波克拉底 - 1 → `ariane.mid`；
    蓝色救赎/杰瑞的房间 → `jerry.mid`；家常酒店 → `homely.mid`；原住民 → `originals.mid`；
    **Tom 的餐馆（104，不属于任何团体的独立餐馆）→ 专属 `tom.mid`**（不走 wanderer 团体曲，
    `midiUrlFor` 特判）；BRC 无据点，`brc.mid` 备用。
  - **加载失败回退**：`.mid` 加载失败自动回退程序化 BGM（console.warn + `startProcedural`），
    保持可玩；曲目有模块级缓存，重复进出同层不重复请求。
- **电台（v56，暂停页「电台管理」按钮，仅 MIDI 曲风显示）**：
  - **音乐库**（`midi.ts MUSIC_LIBRARY`）：层级 13 + 团体 8 + Tom 专属 1 + 乐手摇滚 7 = 29 首；
  - **收听解锁**：曲目只有被收听过才可选（`engine.heardSongs`，随存档持久）——层级曲目随到访解锁、
    团体曲目随据点解锁、乐手摇滚曲目经 Tom 餐馆乐手演奏解锁（`audio.onSongPlayed` → `markSongHeard`）；
  - **电台配置**（`engine.radio`，随存档持久）：模式「随层级变化」（默认）/「固定音乐」（全局固定一首）；
    随层级变化模式下可**为每一层单独指定曲目**（`perLevel`，选「默认」恢复该层本来的曲目）；
    配置即 `engine.setRadio` → `setRadioCfg` 同步解析器 + 立即重开当前 BGM + 落盘；
    解析顺序：固定曲目 > 单层覆盖 > 层级默认（`resolveMidiSong`）；
  - **电台试听**（v56 四轮）：电台管理页可**直接播放音乐**——已收听曲目行内 ▶ 循环试听
    （`audio.previewSong`：rock_* 走渲染音频、其余走合成器，试听期间压低 BGM，再点 ■ 或关页面
    `stopPreview` 恢复 BGM）；随层级变化模式每层行的 ▶ 试听该层当前曲目（覆盖或默认）；
    电台页不再挂起音频（暂停联动豁免，它是播放器）。
  - **电台播放器**（v56 六轮）：电台管理页底部内嵌真实音乐播放器——▶/⏸ 暂停恢复
    （`previewPause`/`previewResume` 按已播秒数续播）、⏮/⏭ 切曲、顺序播放/单曲循环/随机播放
    三种模式（非循环自然播完经 `audio.onPreviewEnd` 自动切下一首）、进度条与时间显示
    （`previewInfo` 500ms 轮询）、■ 停止恢复 BGM；播放列表=已收听曲目（按音乐库顺序）。
    **v56 八轮：电台播放时暂停原 BGM**——`pauseBgmForRadio` 缓冲层记位停止（`bufLayer.paused`，
    合成层静音），停止试听/关页面 `resumeBgmForRadio` 从暂停处续播；`stopBGM` 补全
    渲染音频层/乐手演奏/电台试听的全量清理（退回标题不再有残留音乐）。
  - **留声机 MIDI 版**（v56 六轮）：L5 留声机新增 MIDI 曲目 `phono.mid`（A 小调 3/4 诡异圆舞曲，
    八音盒+弦乐+低音，FluidR3 渲染 `phono.mp3`，音乐库 cat「世界」）——**MIDI 曲风下留声机播放
    渲染版**（`setPhonoBuf` 循环 + 距离衰减 + 唱片底噪与 BGM 闪避不变），近场开始播放即
    `onSongPlayed('phono')` 记收听 → 电台解锁；程序化曲风下留声机仍播原合成圆舞曲。
  - **乐手摇滚曲目**（`public/music/rock_*.mid`，`generate_rock.py` 生成）：滚石风格（A 小调布鲁斯 riff）/
    披头士风格（G 大调流行）/ 平克·弗洛伊德风格（E 小调迷幻）/ 蓝调摇滚（12 小节摇摆）/ 地下丝绒风格
    （双和弦 drone）/ 车库摇滚（双和弦 fuzz 140 BPM）/ 后朋克（角状贝斯）/ 通用摇滚（程序化曲风专用）；
    配器=鼓组+电贝斯+失真吉他（GM30 映射 lead 音色族；`progVoice` 已补吉他 24-31→lead、风琴 16-23→pad）。
  - **v56 五轮：全部曲目改用 FluidR3_GM 渲染音频**——`public/music/*.mp3` 30 首
    （层级 13 + 团体 8 + Tom 1 + 摇滚 8；FluidR3_GM [MIT] 经 FluidSynth 2.6.0 离线渲染 →
    ffmpeg MP3 128kbps，按各曲末音符取整到小节边界的循环长度裁剪 + 尾 50ms 淡出，
    `render_all.py` 可复现；原 .mid 备份在 `app/music-backup-v56/`）。
    MIDI 曲风下全部曲目（层级 BGM/据点团体曲/乐手摇滚/电台固定音乐/电台试听）直接播放渲染音频
    （AudioBufferSourceNode 循环，经 bgmBus 尊重音量与理智低通）；
    WebAudio 合成器（含 Karplus-Strong 吉他）保留为 MP3 缺失时的回退路径。
    程序化曲风不变（drone 随机合成）。
- **乐手 NPC「乔伊·巴蒂斯塔」**（v56，Tom 的餐馆固定 NPC，餐厅东墙边）：
  对话「弹一首吧」→ `engine.musicianPlay`——**MIDI 曲风下随机演奏一首不同风格的摇滚乐**
  （池 `ROCK_SONG_IDS`，避开当前正在播的曲目；收听后自动加入电台并播报），
  **程序化曲风下只演奏一首普通摇滚乐**（`audio.playProceduralRock`：130 BPM 鼓+贝斯+强力和弦步进序列 ~20s）；
  演奏为一次性播放（`audio.oneshot`/`rockLayer`，播完自动恢复 BGM；乐手摇滚用锐利音色，
  不受层级音色分级影响）；演奏期间 BGM 淡出、播完淡回。
  **特色建模**（npcGear 'joey'）：背后斜挎樱桃红电吉他（琴身+白色护板+琴颈探出左肩+琴头弦钮+
  胸前斜挎背带，整琴装在有 `userData.joeyGuitar` 标记的组里）+ 黑色墨镜 + 右手金色拨片；
  顺手补上糖佬希德的糖果罐配饰（玻璃罐+彩色糖果，修复 mesh-smoke 的 candyman 无配饰失败项）。
  **弹奏动画**（renderer updateNpcs）：演奏时吉他由背后插值挪到身前（guitarK lerp），
  右臂 8 分扫弦 + 左手按弦微动 + 身体摇摆 + 点头踩拍 + 右脚打拍；`engine.joeyPlaying` 驱动
  （播完/叫停/切层经 `audio.onOneshotEnd` 自动清除）。
  **对话叫停**：演奏中与乐手对话出现「先停一下，别弹了」——`engine.musicianStop` 淡出演奏并恢复 BGM。
  **暂停联动**：暂停菜单（含设置/操作说明/电台子页）打开时 `audio.suspendAll` 挂起 AudioContext——
  乐手演奏/BGM/环境音一起暂停，恢复时接着播。
  **摇滚音色**（v56 二轮，Karplus-Strong 物理建模）：吉他类 GM 音色（24-31，含 30 失真吉他）改走
  `ksPluck`——噪声激励 → 延迟线反馈弦振动（阻尼低通按弦长、高音弦衰减更快）→ tanh 软削波失真 +
  音色低通，接近真实电吉他；程序化摇滚的强力和弦改为三弦依次拨响的扫弦；
  贝斯补二次谐波、底鼓补鼓皮冲击高频、军鼓补鼓身音、踩镲补 11kHz 金属共鸣带。

#### v56 批次（MIDI BGM 曲风与团体曲目）

- BGM 双曲风上线：设置 → 音频「BGM 曲风」在程序化（既有随机合成梦核 BGM）与 MIDI
  （直接播放 `public/music/` 下 .mid 文件）间切换——详见 §3.10。
- 新增 `core/midi.ts`：标准 MIDI 文件（SMF0/1）解析 + fetch 缓存 + 层级/据点曲目映射
  （`midiUrlFor`：13 层级 + 8 团体）。
- audio.ts 新增 MIDI 播放器：GM 音色号 → 10 种 WebAudio 合成音色 + 打击乐轨合成，
  lookahead 调度无缝循环，加载失败回退程序化。
- 音色分级：危险层级（L2/L3/L6/L7/L8/L9）保留锯齿波锐利音色，其余改三角波舒缓音色。
- 层级曲目 13 首（外部作曲工作区 generate_levels.py：L0 利底亚/L2 弗里几亚/L3 5/4 机械脉冲/
  L5 3/4 华尔兹/L7 鲸歌滑音/L9 6/8 摇摆/L11 vaporwave 鼓组等）+ 团体曲目 8 首
  （generate_factions.py：每团体独立曲——进入不同团体的据点换对应团体 BGM）+
  **Tom 的餐馆专属曲 tom.mid**（G 大调 6/8 温暖船歌，midiUrlFor 对 104 特判）。
- **电台管理（v56）**：暂停页「电台管理」按钮（仅 MIDI 曲风）——随层级变化/固定音乐 + 单层曲目配置；
  音乐库 29 首收听解锁（层级/团体/乐手摇滚），配置随存档持久——见 §3.10。
- **乐手摇滚曲目 ×7**（generate_rock.py：滚石/披头士/平克·弗洛伊德/蓝调/地下丝绒/车库/后朋克风格，
  鼓+贝斯+失真吉他）。
- **Tom 的餐馆新增驻店乐手 NPC「乔伊·巴蒂斯塔」**：对话演奏——MIDI 曲风随机摇滚风格
  （收听解锁电台），程序化曲风普通摇滚；一次性播放播完恢复 BGM——见 §3.10。
- **v56 二轮**：乐手摇滚音色改 Karplus-Strong 物理建模吉他（拨弦+软削波失真）+ 贝斯/鼓组细化；
  乐手弹奏动画（吉他挪到身前+扫弦+摇摆）与对话叫停；暂停菜单打开时挂起全部音频（乐手演奏/BGM/环境音）——见 §3.10。
- **v56 三轮**：摇滚曲目改用 FluidR3_GM（MIT）离线渲染的 MP3 音频（FluidSynth 2.6.0 + ffmpeg，
  `render_rock.py` 可复现；8 首 rock_*.mp3，SOURCES.md 登记）——乐手演奏与程序化普通摇滚不再使用
  刺耳的 WebAudio 合成吉他，改为真实失真吉他/贝斯/鼓组音色；rock_* 电台固定音乐同走渲染音频循环——见 §3.10。
- **v56 四轮**：电台管理页支持试听播放（已收听曲目 ▶ 循环试听/■ 停止/关页面自动恢复 BGM，
  试听期间压低背景音乐；电台页豁免暂停挂起——它是播放器）——见 §3.10。
- **v56 五轮**：全部 MIDI 曲目重制为 FluidR3_GM（MIT）渲染音频（30 首 *.mp3，`render_all.py` 可复现，
  原 .mid 备份 app/music-backup-v56/）——层级/团体/Tom/摇滚全部用真实 GM 音色播放，
  WebAudio 合成器降级为回退路径——见 §3.10。
- **v56 六轮**：L5 留声机新增 MIDI 版圆舞曲（phono.mid/phono.mp3，MIDI 曲风下留声机播渲染版、
  近场收听解锁电台「世界」曲目）；电台管理页升级为真实音乐播放器（▶/⏸ 暂停续播、⏮/⏭ 切曲、
  顺序/单曲循环/随机、进度条时间显示）；DevPanel「图鉴全开」同步解锁全部电台音乐——见 §3.10。
- **v56 七轮**：单层天花板碰撞修复——站家具起跳越过 1.5m 带界被幻想上层带吸到 3.0m 卡在天花板上方；
  新增 `bandOfPlayerZ` 按实际楼层钳制玩家带，movement/interact/combat/entityAI 玩家路径统一改用；
  engine-smoke 新增 L1/L5/L9 站家具起跳拦截回归断言——见 §6。
- **v56 八轮**：电台播放时暂停原背景音乐（缓冲 BGM 记位停止、停止试听/关页面从暂停处续播）；
  `stopBGM` 补全渲染音频层/乐手演奏/电台试听全量清理（退回标题无残留音乐）——见 §3.10。

## 4. 层级一览

| 层   | 名称              | 生成                                                            | 关键机制                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0   | 教学关卡/黄迷宫   | 无限 chunk                                                      | 孤立效应、9 变体、马尼拉室、红室蔓延、出生物资（仅首访）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| L1   | 宜居地带          | 无限 chunk                                                      | 7 区段、植殖癌、闪烁停电（笑魇/手臂出没）、限定 6 实体、维护通廊墨黑门、灰色阶梯返程 L0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L2   | 废弃公共带        | 无限 chunk                                                      | 4 廊道变体（整洁/晦暗/肮脏/扭曲）、平行窄廊道网、锁死的门、消防出口（back/L3）、办公走廊（→L4）、尸鼠猎蛾、窃皮者绝迹                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| L3   | 发电站            | 无限 chunk（v51 重制）                                          | 不规则廊道网（1~4 宽逐区块变化/长短不一）、铁栅栏封死段+可交互栅栏门、配电箱（可搜索+电流噪声）/电缆走线、双灯光变体（照明/晦暗）、四特征房间变种区段（装配线/发电室/锅炉房/圣所）、物资刷新全后室最富、出口仅电梯（2 保险丝，随机 L4/L5，嵌墙双向链路）                                                                                                                                                                                                                                                                                                                      |
| L4   | 废弃办公室        | 无限 chunk（v54 重制）                                          | 走廊网+四区段群系（办公间/空旷/窗景[雨痕玻璃+真虚空+虚空雨雾]/小房间）、杏仁水权重全后室最高、实体几乎绝迹（仅猎犬/钝人 ~1.2%/chunk）、常驻程序合成雨声、古典楼梯→L5（8×8 超区域 ~40% 宿主，小概率；v54b 假楼梯已删）、活板门→L6（~1.5%/小房间，落地式）、电梯→L3 免费回程（8×8 超区域槽位+出生保底，西/东门洞雕壁龛嵌墙，双向链路）                                                                                                                                                                                                                                     |
| L5   | 恐怖酒店          | 无限 chunk（v54 重制）                                          | 九变体街区（四类大厅[主厅挑高/贝弗莉室/维修大厅/餐厅]+五类房间[锅炉房/休息室/健身房/游泳池/客房]）、红地毯走廊网、房门锁/撬保留、电梯嵌主厅墙↔L3、古典楼梯↔L4（抵达落点离梯 2~4 格）、锅炉房暗门→L6、深色木门 ~2%→L9、实体低密度（死亡飞蛾主巢）
| L6   | 熄灯              | 无限 chunk（地表/地下双层）                                     | 地表黑天苔原（连续微起伏、大型枯林/宽幅恶臭草原/巨石/晶簇/塌陷深坑/方尖碑）+ 地下 PBR 发霉破败廊网与锈蚀管道；`FloorBand=-1/0` 统一碰撞高度；黑门出生地下，L4/Omega 出生地表楼梯井；楼梯井双向切层，稀有且按区域保底的出口→L7/L8；禁电子照明、无实体、远处鸟鸣/风声幻听                                                                                                                                                                                                                                                                                    |
| L7   | 深海恐惧          | 无限 chunk（入口房间 + 四深度带水平投影）                        | 入口房间固定出生（书橱/咖啡桌/椅/荧光吊灯/湿毯浅积水，南门廊外即深海）；无限 open water 全 liquid=1，径向深度场=有光带/微光带/午夜带/深渊（tint 29–32，海床内容与自然光逐带变化），确定性岩石岛；seacave 固定入口正下方→L8，pipering 固定西 150m→L9（需绳索），区域宿主保底 abyss 出口；tiny/thething 按深度带分布，出生安全区无实体                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L8   | 洞穴系统          | 有限                                                            | 光削弱 0.12、熵效应 ×2.2、岩刺/焦油之手、福友玉产地                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| L9   | 郊区              | 有限                                                            | Pockets 禁带（邻里守望）、卡模房                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| L10  | 丰收              | 有限                                                            | 麦田/树篱、油菜地块是门                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L11  | 不夜城            | 有限                                                            | Level 11 Effect（实体被动化，挑衅解除）、压印币交易、集齐磁带→Base Beta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| L601 | 终点              | 有限                                                            | 假门（伪现实，假结局）/ 真门（通关）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 101  | M.E.G. Alpha 基地 | 据点（L1 天鹰段子层级）                                         | 手工布局城镇（v54 经设计模式重制：玩家设计 JSON 落地，零差异校验）、6 名固定+6 名随机人士、天鹰币交易、完整地图、返程三入口                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 102  | 商人之家          | 据点（L1 跃金段子层级）                                         | 商场布局（交易保险库+市场街）、6 名固定+4 名随机人士、压印币交易、返程三入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 103  | 希波克拉底 - 1    | 据点（L1 哥特段子层级）                                         | 医药研究所布局（病房/手术室/实验室/药房）、6 名固定+4 名随机人士、以物易物+异常样本征集、返程三入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 104  | Tom 的餐馆        | 据点（L1 天鹰段子层级）                                         | 独立餐馆（不属于任何团体）：前台/餐厅/厨房/冷库、2 名固定+5 名混合团体食客、barter 食材换菜+来料加工、返程三入口                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 105  | 办公区EL3A        | 据点（L2 整洁的廊道子层级）                                     | 真多层双层据点（v48 南侧重排）：挑高中庭仓库+南侧整片夹楼办公区（手工 up/upWall/stair，x13..68 × y41..60 约 40%）、真阶梯（踏步+**实心斜扶手**[v49 h0/h1 随坡道倾斜]+落地斜面）、灯具全贴附（壁灯 walllamp/楼板底/上层天花 + **v49 挑高顶高顶灯 ×15**[hanglight 贴 5.6 顶 + fixZ r9 暖白大半径]）、**v49 低顶上方填墙**（ceilingSteps 檐口薄墙封廊口虚空 + wallBaseTopAt 外墙顶=挑高顶）、l105_* 专属贴图（**v49 墙面定制款**：波纹钢+BNTG 绿饰条+黄黑安全标识带）、6 名固定 NPC（含 2F 运营主任/老会计）+el3a 专属随机池、物流任务三路径、免费救济 |
| 106  | Gemma 基地        | 据点（L3 子层级，v54 真三层单图）                               | 首个三层据点（楼层带 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 107  | 存储设施          | 据点（L3 子层级，v54）                                          | B.N.T.G. Level 3 物资仓：存储大厅（货架排/托盘/安全线导引）+ 仓管办公角（压印币平价兑换）+ 守卫室、3 名固定 NPC（仓管主管/守卫/盘点员）+3 随机、l107_* 贴图、返程三入口                                                                                                                                                                                                                                                                                                                                                                                                       |
| 108  | 蓝色救赎          | 据点（L3 子层级，v54；杰瑞的信众）                              | 蓝石圣所：前厅+挑高大殿（讲坛/长椅排/烛台/圣水盆/蓝彩玻/tint 17 圣辉）+居住区三小室、2 名固定信众（注册表末尾）、**准入门槛 jerry 声望 >30**（DevPanel 跳转不受限）、l108_* 蓝乘色贴图、出口仅北门 back                                                                                                                                                                                                                                                                                                                                                                 |
| 109  | M.E.G. Omega 基地 | 据点（L4 子层级，v54） | M.E.G. Level 4 主要基地：单层多房间——数据厅A/B（成排工位，二选一规则）/机房/档案室/会议室/主管办公室/宿舍间/医护盥洗室/库房（非 loot），走廊网串联、4 格灯网全亮、6 名固定 NPC（主管/档案员/数据技师/仓管/医护/守卫，注册在 jerry 系之前）+4 随机、l109_* 全新贴图、出口 back + 固定 →L5（楼梯间）+ 固定 →L6（旧活板门）、海报地标 omega_poster ~2.5%（infiniteL4） |
| 110  | M.E.G. 哨所「家政服务」 | 前哨（L5 子层级，v55）                                             | 小型前哨：前厅登记台/补给间/宿舍/维修角；3 固定 NPC（补给员交易）+随机居民；L5 走廊告示地标 ~1.5%/chunk |
| 111  | 家常酒店          | 据点（L5 子层级，v55；小型团体 homely 无 logo）                    | 现代酒店：前台大堂/餐厅角/客房；**入住申请门槛**（地标提交申请永久解锁，随存档持久）；主厅墙壁标志牌地标 |
| 112  | 原住民            | 据点（L5 子层级，v55；小型团体 originals 无法加入）                | 1930 前居所：老式客厅/藏书角/卧室；7 名历史失踪者 NPC（埃尔哈特/阿诺德/阿斯特四世/史密斯船长/霍法/怀特/诺瑟普）barter 以物易物；**邀请函准入**（贝弗莉室散落 invitation 可交互装饰，地标卡直达） |
| 274  | 杰瑞的房间        | 独立层级（走据点 id 空间；层级+据点双图鉴显示；杰瑞的信众圣地） | 前厅+教堂风穹顶主间（ceiling=1 挑高+domering+tint 17）+西翼告解室+东翼祭衣间·圣器室+南侧信徒居住区（v47）、讲坛/烛台/圣水盆/长椅排/蓝色彩玻窗、灯光贴挑高顶与穹顶圣辉盘真实高度（v47）、**l274_* 蓝色教堂专属贴图（v48：蓝白石墙/蓝灰石板/蓝色吊顶，蓝乘色处理）**、鹉主杰瑞栖木（perch）、仅经信众引路进入（声望 ≥10）、教化系统（接触+5+教化25+冷却20s+诵咏/满100拦出口/驯服/传教委托化≥30三选一/伤害杰瑞-50·杀死-100/教化攻击约束）、4 名固定信众（zeph/polly/青鸟神父/辛克莱）+3 名随机信众                                                                       |

## 5. 开发者工具

- **开发者模式**：设置 → 游戏 → 开发者模式（HUD 水印 + DevPanel）
- **L7 室外开放海洋与严格中性悬浮（v57s）**：除入口舱体以外全部水域标记 outdoor=1——无天花板、
  使用室外天空与自然光；无输入时垂直速度直接清零，彻底消除自动上浮。
- **L7 中性悬浮与海床衔接修复（v57r）**：取消被动浮力——无输入时保持当前深度；蹲伏立即清零上浮
  速度并下潜；下潜/上浮/快速游泳可同时生效；出生点浅海安全区用 smoothstep + 3×3 低通与外界海床平滑连接。
- **L7 纯深度照明与快速游泳（v57q）**：取消水平 chunk 光带与区域生成——全部内容按落点海床深度生成；
  日光带→深渊带为连续自然光衰减；快速游泳朝准星方向冲刺并忽略浮力；水面增加双层分界膜。
- **细化游泳系统（v57p）**：深水中无输入会浮回水面；按住蹲伏下潜、跳跃上浮、冲刺快速游
  （L7 消耗体力并制造噪音）；HUD 增加水深/氧气与操作提示；L7 基础屏息 35s，潜水面罩 +25s。
- **L7 真实垂直深度轴（v57o）**：`GameMap.seaFloor` 记录每瓦片海床深度；深度带改为
  按海床深度垂直划分（<24/90/230m），玩家可实际下潜并受水下雾、光衰减与水压伤害；
  水生实体获得水体寻路与垂直游动；tiny 噪音敏感、thething 手电激怒；同时修复绳模
  不可见、舱门朝向、舱体屋顶虚空、水面分界与手电阴影掉帧。
- **L7 舱体 2F 化与海面提亮（v57n）**：入口舱体改用多层结构写入 `up/upWall`——一层保持
  完整海洋（水面/水底），舱体房间与门廊位于 2F（出生 `spawnFloor=1`）；尼龙绳建模为
  「门廊入口 → 门廊出口 → 出口外一格海面」两段折线；海面材质提亮并增强自然光。
- **L7 入口舱体扩展（v57m）**：入口房间与增长门廊改为抬升金属舱体（原创锈蚀钢板贴图
  `l7_cabin_metal.jpg`，地板/墙/顶三组独立金属材质，平台下方不生成侧壁保持镂空）；
  门廊尽头增加钢灰舱门（hoteldoor `data.l7porch`，开门瞬间把门边玩家强制抛入深海）；
  门廊入口新增系缆桩 `ropeanchor`——使用尼龙绳后从门廊出口垂绳至海面，可靠近绳底攀回门廊。
  家具改为金属书橱/钢桌/钢椅/低垂荧光吊灯，并加舱室通风口。
- **开始游戏加载界面（v57l）**：点击「开始游戏 / 继续游戏」后先进入 LoadingScreen——
  按资源粒度预载目标层级与下一层级的墙/地/顶贴图、通用物件/装备补给贴图、MIDI 曲风的 BGM 音频，
  实时显示百分比进度、当前资源与最近加载内容；任一资源失败自动跳过（程序化兜底），
  加载界面最短显示约 1.1s，随后生成初始地图并进入开场坠落/存档层级。
- **沉浸模式（F1/F2，v54）**：F1 全沉浸隐藏整个 HUD 层与手部建模/准星，F2 半沉浸只隐藏 HUD 铬件保留手部与准星
  （互斥切换；`engine.hudHidden`/`handsHidden`，UI 状态不入存档，新一局重置）；
  键位可自定义（`hidehud`/`hidehud2`，默认 F1 已 preventDefault 浏览器「帮助」）。
  **存档槽位页（v54）**：自动保存槽排最上方（只读），手动槽 1/2/3 随后；
  「继续」按钮不用 `.menu-btn`（该类 block w-full，flex 行内会撑出面板），
  改行内 `shrink-0` 小按钮；槽位面板限高可滚动、行 `overflow-hidden` 兜底，窄屏/移动端不溢出
- **设计模式**（v54；开发者模式开启时标题屏出现「设计模式」按钮，App 屏幕状态机 'design' 分支，
  `src/components/DesignMode.tsx`）：查看/编辑布局与图鉴文案并导出设计 JSON（DESIGN-GUIDE.md 的导出端）。
  数据来自 `src/game/design/`（extractLayouts/extractCodex，固定种子 424242）。
  左栏条目树（据点×7 / L0–L4 变体×30 / 预制件×11 / 图鉴 8 类，含搜索过滤）；
  中栏 2D 俯视画布（瓦片/结构按 decorRegistry 分类着色/NPC/实体/灯/出口/物品/zones，多层据点 1F/2F/3F 切换，
  拖拽平移 + 滚轮缩放 + 点选/拖拽移动对象，墙壁编辑模式可切换墙/楼板）；
  右栏属性面板（结构 x/y/w/h/deg/solid/floor/data JSON 校验编辑、新增结构/NPC/实体放置、
  spawnRules 概率数值、出口 name/dest、区域名）；图鉴字段编辑器按点号路径逐字段文本域（改动标「已修改」）。
  **全部编辑只改内存状态、不回写游戏**；「导出 JSON」只打包被修改布局（完整 LayoutEntry）与被修改图鉴条目
  （仅改动 fields），buildDesignFile 组装后 Blob 下载 `backroom-design-<时间戳>.json`（无修改时置灰）。
  第二批（v54）：随机/新建 NPC 槽（id 'random'+flavor 池 / 'new:<名字>'+newNpc 设定）· 灯具增删移与 r/color 编辑 ·
  随机生成物 random/chance 标记（画布「随」角标+虚线框，chance 可编辑）· 变体 randomized 随机样例（换种子经
  resampleVariant 浏览器内重采样）· 地面物品编辑 · 区域矩形范围（zones x0/y0/x1/y1，仅选中叠加显示+边缘拖拽；
  mapgen GameMap zones 加可选矩形，HUD 区域名矩形内优先；Gamma/EL3A 已写入实际房间矩形）。
  第三批（v54）：楼梯编辑（画布方向箭头指向坡上行方向、悬停 lo/hi、新增/移动/删除/坡向循环）·
  同位多对象循环点选（再点同一切换，右栏显示 n/m 序号）· 随机样例可加固定对象（导出带 onRandomSample，
  删除落 remove 墓碑）+ customNote 自由文本修改要求 · 评分并入所属条目（entity 内嵌 CECS 区/level 内嵌三维评分/
  item 内嵌 IOTS，CodexWidgets LevelClassBanner/CecsBox 加 override 实时预览，外观与原图鉴一致）·
  新建图鉴条目（左栏「+ 新建」，三模式：玩家自定义 / generate:fromDescription / generate:auto，导出带 new:true）·
  多选（Shift+点选加选 / Shift+空处框选 / 整体拖拽 / Ctrl+C·Ctrl+V +1 格连续偏移粘贴 / Delete 批量删除；
  随机样例上粘贴自动带 onRandomSample）。
  落地工具链：玩家导出 JSON → `.check/gen-patches.mts` 生成数据表 → mapgenOutpost 各 gen 函数末尾
  `applyDesignPatch`（v54：tiles/结构/NPC/灯/出口/zones 精确落地，随机槽可增补）→ `.check/diff-verify.mts` 零差异校验。
  ⚠ tiles 编码实况：'#'=地板 '.'=墙（早期 DESIGN-GUIDE 误写反，v54 已修正文档）。
  实机验证脚本 `.check/v54-design.py`（playwright：进界面/三层切换/拖拽结构/改概率/改文案/导出校验）与
  `.check/v54-design2.py`（楼梯/循环点选/灯具/重采样/onRandomSample/customNote/chance/区域矩形/NPC 标记/
  评分预览编辑/新建条目/框选复制粘贴，35 项断言）。
- **DevPanel 5 页签**：召唤（**子页切换：实体 / 物品 / 装饰物**[v54 四轮，切换按钮排在召唤页顶部；
  实体与装饰物分页末尾各有一个「全部层」页——一页列出全部可召唤条目（实体含事件生成与无生成路径的，
  装饰物为全部层级分组合并）]——
  实体按层分页[默认当前层，含事件生成归属；末页=无生成路径实体] / 物品翻页[16/页] /
  **装饰物分页**[v54 三轮：decorRegistry 结构类条目按生成层级分组 L0–L11/据点/L274，■实心 □非实心，
  点击面前 1 格落位——无限层同步写回所属 LiveChunk + redo 重建，decal:/prop: 渲染侧贴花道具不可放置]）/
  状态（属性控制、团体声望调整）/ 传送（出口/实体/容器/**最近地标**/变体房间/固定结构/**本层已生成 NPC 列表**——v54 修复：
  传送到多层据点 NPC 按 `NpcState.floor` 设置玩家 z=floor×3.0+0.05 并同步楼层带，不再落到 1F；
  v54 三轮：**召唤出口已存在则不再重复生成、点击直接传送**[devGotoExitKind，按钮 ⇢ 传送 / 🚪 生成区分]）/
  世界（层级跳转、**据点跳转**[NPC 不可召唤；v54 三轮按钮优化：去 emoji，左侧小框显示所属主层级
  [parent=自身 levelId 的独立层如杰瑞的房间显示「–」]，按钮应用所属团体主题色=边框+底色叠乘，与图鉴据点卡一致]、开关[穿墙/加速/一击必杀/隐形/冻结AI/无敌/一键照明/**图鉴全开**——开启时备份
  图鉴进度，关闭后原样恢复；v41 全开范围扩展到**全部据点与全部固定 NPC**（团体页本不设限；随机 NPC 仅显示已遇见的）]、**现象开关**、层级事件、⬜ 测试场地[仅 L0]）/ 信息（位置/实体列表/FPS）
- **设置 → 音频（分项音量，v54）**：主音量 / **音乐（BGM，`bgmBus` 总线）** / 环境音（荧光灯嗡鸣+L4 雨声，
  `ambient` 总线）/ 音效（攻击/拾取/UI/实体叫声/电流嗡鸣/低语等全部单发，`sfx` 总线）四个滑杆（0-100，
  100=既有默认响度），`br_settings` 浅合并持久（新增 `bgm` 默认 100；`ambient`/`sfx` 滑杆此前存在但未接线，v54 起真正生效）
- **设置 → 音频：BGM 曲风（v56，`bgmStyle`）**：「程序化 / MIDI」双选——程序化为既有随机合成梦核 BGM；
  MIDI 直接播放 `public/music/` 下 .mid 文件（每层与每团体独立曲目，见 §3.10）；切换立即重开当前层级 BGM
  （`audio.setBgmStyle` → `startBGM` 重入）
- **设置 → 画面：真实视角摇晃（v54，`headBob`，默认关闭）**：关闭=既有基础 bob（仅小幅垂直浮动，行为不变）；
  开启后行走=垂直起伏（2 倍步频）+ 水平侧摆（沿视线右向）+ 轻微 roll 侧倾，冲刺幅度 ×1.5、蹲行 ×0.45，
  静止时幅度平滑归零（不跳变）；落地/跳跃落地按下落末速触发小段下沉回弹（~0.3s 单峰）；
  与震屏（camShake）/低理智侧倾/开场爬起动画叠加共存。
  **v55 调校**：整体烈度调低 ~35%（垂直 0.026/侧摆 0.021/roll 0.009，长时间游玩不晕为准）；
  空中（|vz|>0.25 离地/抛物）暂停水平侧摆与 roll、仅留极轻微垂直浮动（airK 平滑过渡）；
  抛物手感——起跳瞬间 ~60ms 蓄力微沉随即上提（0.14s 单峰），上升段相机滞后微沉 + 视线微仰，
  下坠段随下落速度下沉 + 视野微前倾（vz 缩放、封顶克制，顶点偏移自然消退），落地回弹与既有 landing dip 衔接
- **测试场地**（仅 L0）：80×80 无墙空旷区 + 8 格网格补灯，写入底层 chunk（窗口平移不还原）
- **离线校验**（`.check/`，`npx tsx --tsconfig .check/tsconfig.run.json .check/<name>.mts`）：

| 脚本                                    | 覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| smoke.mts                               | 14 层（含据点）× 5 种子地图生成合法性                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| mesh-smoke.mts                          | 35 实体 + 79 物品（含**零 fallback 断言**，v40）+ 151 结构（v43 新增 pallet/handrail/machinewall；v45 新增 domering/perch 穹顶结构件与栖木 + 鹉主杰瑞蓝色鹦鹉模型；v46 新增 walllamp 壁挂斜照灯；v47 新增 pulpit/candlestand/holyfont 教堂件；v51 新增 elecbox/cables/barfence/bargate/statue/conveyor/angelstatue/fallencolumn/busbar/warningsign/worktable/factlamp/sphboiler/floordrain/turbinegen/switchboard/transformer/pressmachine/feedpump/manifold/piperack/cabletray 电站件 + column data.pale 浅色大理石变体）+ 玩家模型（**6144 组形象配置**（v54b：性别2×发型16×上衣8×裤子6×表情4；含眼镜/胡须/鞋款抽样与 face 标记计数、默认配置无眼镜胡须断言） + **女性体型节点断言**）+ **NPC 配饰全量附加**（v40）建模 + **v48 朝向断言**（贴墙场景：柜类/转椅背贴最近墙正面朝室内、邻桌朝桌优先、data.deg 覆盖、glasswin/蓝彩玻贴墙面朝室内；v54：vending 售货机纳入[含 flushToWall 贴墙位移与 deg 例外]）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ng-orient.mts / ng-vis.mts              | v50 全实体朝向审计（face 标记件质心=+X，含 facesZ 包装后；nguithr 复眼偏航 0°）+ nguithr 双形态显隐断言（spiderBody 58 节点子树；网囊阶段仅 4 件网囊 mesh 可见）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| engine-smoke.mts                        | 逐层 400 帧循环 + 五据点 300/400 帧（含 EL3A 双层）+**EL3A 真多层行为（楼梯行走上 2F/2F 固定 NPC/2F 跳跃/夹楼下跳跃被楼板底拦截，v46/v48 南侧坐标随迁）** + **EL3A 物流任务三路径（接取得包裹/交付得币+声望/丢失认栽 -3）与免费救济** + **BRC 行为链（生成同步/模仿+冷却/攻击不停手/坦白转敌对/反击杀死）** + **v45/v47/v48/v49 杰瑞的信众/教化系统行为链（信众 approach+传教+敌意阈值 / 认同+10 **每局仅首次**[v49：之后任何信众处选项不再出现 canAgreeJerry=false 且引擎拦截、声望不涨]且**仅野外可选·L274 引擎拦截** / 门槛拒入与引路 / 接触+5+教化25+**冷却 20s**+诵咏 / 教化满100拦出口 / 未满离开-5 / 驯服清零+见证-10 / **传教委托化：<30 无委托+三选一+布道+交付+借任务离开免罚** / **伤害杰瑞 -50 / 杀死 -100 / 教化攻击约束+驯服解除 / L274 信众不主动传教**）** + L601 真假结局链 + **v44 杂项（尸体击退墙体校验/被动漫游撞墙偏转/笑魇关灯听觉察觉）** + **v54 口渴值（与饥饿同率流失/体力耗尽 ×2/据点 ×1/3 减缓/归零扣血致死「渴死了」/7 种物品口渴效果[含市政自来水不恢复饥饿]/人制品效应）与存档槽位（新开局双槽写入/60s 周期与切层自动槽/四槽读写/读档恢复口渴持久/旧档迁移/死亡清槽，内存 localStorage mock 仅末段启用）** + **v54 二轮：据点寄存仓库（声望门槛 >10/存取并摞/阵营互通[Alpha 寄存 Gemma 取回]/存档持久/48 栏上限/装备位拦截）与 DevPanel 多层 NPC 传送（EL3A 2F 运营主任 z≈3.0 / Gemma 3F 主管 z≈6.0 不落 1F）** + **v54 三轮：寄存门槛 ≥10[=10 解锁] + BNTG 付费通道[5 压印币临时放行/离开对话恢复锁定/MEG 无付费通道] + 装饰物召唤[落位 m.structures 并写回 LiveChunk] + 出口已存在则传送[不重复生成/落点 ≤5m/未生成回退 false] + 手动保存覆盖写入[同槽摘要更新]** + **v54 四轮：图鉴遭遇按个体去重（同一只重复看见只计 1 次/同层两只各计/索敌[肢团噪音引动]计数/攻击命中计数/换层新个体再计）** + **v55 疫疾感染系统（湿地 +1/s·水中不算·L0 锅炉旁不积累·L3 锅炉房积累/升阶遭遇计数[退阶重升再计]/一阶体力 -10%·三阶治疗减半与移速 ×0.8/物品分阶规则[消毒液一阶清·二阶退 50·三阶无效·杏仁水幸运豆奶 -30·皇家口粮清除]/医生求治[非医疗拦截·未满三阶拦截]/四阶扣血致死「疫疾恶化而亡」）** + **v54e Gemma 跳跃顶板回归（站家具起跳 z 过带界 1.5 后 band 翻转仍被 2F 板底拦截在 ≈1.10——movement.ts 非坡道格按层带收 maxZ）**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| outpost-smoke.mts                       | 十三据点（含**v54 Gemma 基地真三层单图**：106 floors=3/楼板墙板关系[upWall⊆up、upWall2⊆up2；v54c 解耦——上层板不限下层轮廓]+挑空中庭[前厅 2F 无板、3F 屋面板墙]/bfs3D 跨三层全连通/出口仅 1F back/两部坡道楼梯 ×3 轨迹 canOccupy 行走无卡死[1F→2F→3F]/跌井守卫[3F 踩不进 A 段井 · 1F 走不进 B 段悬梯]/NPC 楼层[brandt 1F · meilin 2F 站 up 楼板 · harper 3F 站 up2 楼板]/层高契约[1F 2.65 · 2F 5.65 · 3F 8.6 · 外墙接到三层天花]/zones 三层区域名；与 **v54 两新据点**：107 存储设施[3 back 出口/全连通/无 loot/3 固定+3 随机 NPC 落位] · 108 蓝色救赎[1 back/全连通/圣所结构件/tint 17 圣辉/挑高大殿/**声望门槛：jerry 声望 30 拦截 · 31 放行 · DevPanel 跳转不受限**] · 109 Omega 基地[back+固定→L5 楼梯间+固定→L6 活板门/全连通/无 loot/6 固定+4 随机 NPC/数据中心密度[工位 61·阵列 10·档案架 22]/L4 海报地标率 ~2.5% 贴墙校验]；v54c 坡道起点/落点净空 ≥1 格 + 按服务楼层带互不串层断言[EL3A/Gamma]） + **Level 274（杰瑞的房间：1 back 出口/全连通/4 固定信众+3 随机信众落位/zones 七区/鹉主实体/domering+perch+教堂细化结构件/挑高/tint 17/海报/灯光贴穹顶真实高度/双图鉴无重复计数，v47）**：生成确定/设计出口均 back/全连通（**EL3A 走 bfs3D 跨层 BFS：主层+楼梯+夹楼**）/无 loot 物品/NPC 落位与注册表（含 barter/give2 校验）/天鹰段（alpha+tom 双地标概率）·跃金·哥特段地标 + **L2 整洁的廊道 EL3A 海报形地标（data.poster+el3a_poster.png）** + **EL3A 真多层断言（v48：夹楼南侧单侧整片 ~40%[块外零楼板+片内零空洞]/**实心斜扶手**[v49：×20 全带 h0/h1、坡度 0.6/格贴坡道、朝向匹配 deg、相邻格绝对高度连续无断茬]+碰撞盒 FULL_BLOCK/售货机长椅朝向 deg 180/值班床不嵌墙/灯具全贴附+壁灯贴墙+**挑高顶高顶灯**[v49：hanglight 贴挑高顶非实心+fixZ≥5 r≥8 noFix 配套光源]/柱子只在夹楼下/挑高顶=夹楼天花 5.6/**低顶上方填墙**[v49：低顶房间挑高侧外墙顶=5.6（wallBaseTopAt）+迎宾廊口/东西门廊口檐口 ceilingSteps 3.0→5.6]/两部阶梯 ×3 轨迹 canOccupy 行走无卡死/2F NPC/el3a 随机池）** + **BRC 团体与员工定义合法性** + **jerry 团体与信众生成器/固定信众合法性（含无括号舞台指示+注册表末尾，v47；v48 对话规则：特殊选项追加式[树选项在前]+认同仅野外 level!==274 门槛）** + **v49 斜扶手（h0/h1 含负值下探段）与挑高顶 hanglight 建模可构建** + **v54 L3 三据点海报地标（多 seed 统计：Gemma 3.11% / 存储设施 3.36% / 蓝色救赎 0.94% 显著更低、落点皆地板且贴墙、data.poster=1+对应 tex、圣所与出生 chunk 跳过）** + **v54e 五批断言：全据点堵门/浮空装饰审计（门洞/墙线扼流格[一对侧为墙、另一对侧为地板]正前方第一格无实心结构[可交互门+bargate/wallwindow 视窗豁免]；贴墙装饰[megposter/photo/noticeboard/walltv/screenboard——显式 deg 与 flat 地面贴花除外]落本层带地板且有本层带墙邻，违例已修：Alpha walltv/海报、商人之家 screenboard、EL3A 夹楼 ×3、Gamma 3F 墙行 ×3+堵门 ×2）· Gemma 灯贴真实顶（各层灯落本层带地板；中庭灯瓦片 up=0+upWall2=1 → 贴 3F 板底 5.65）· Gemma 楼梯间清理（东北走廊已拆/A 井 3F 板填回/挑高清零/1F 资料室南门+书架）· 三层连通同口径（不服务本层带的坡道格不计入可走格）** |
| l1inf-smoke.mts                         | L1：7 区段覆盖、出生 chunk 恒天鹰段、keep 灯、无缝衔接、维护通廊单门、出生物资、**衔尾段 BRC 员工确定性生成（1~2 名/家用物品名/faction/workLoop）**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| l2inf-smoke.mts                         | L2（v41）：4 廊道变体覆盖与群系聚集、跨 chunk BFS 全连通、廊道净空 ≤3 占比、门规则与锁死门 data 标记（v44 未上锁占比上调后锁死实测 ~55% 仍 ≥50%）、消防出口 back/3 与办公走廊 dest 4（多 seed）、实体确定性与窃皮者移除、生成确定性（**含 chunk NPC**）、飞蛾 calm+scale 0.6、**尸鼠猎蛾/反击/飞蛾反击尸鼠/群体激怒/锁死门不可开（引擎行为）** + **v45 信众宣传间（多 seed 出现率 ~8% 卧室 / 恰 1 名 jerry 信众 NPC / 满墙海报 ≥6 / 领地矩形内外判定）**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| l4inf-smoke.mts                         | L4（v54 无限化重制）：生成确定性（两构一致）、跨 chunk BFS 全连通、四区段覆盖与比例（办公间/空旷/窗景/小房间 + 出生街区恒办公间）、假楼梯零生成（v54b 已删）、古典楼梯全部 dest=5 且梯位合法（邻墙+走向 4 格畅通）+ 区域宿主率 ~40%、电梯逐槽位断言（l4ElevSlot 存在且被所属 chunk 推出、dest=3、**嵌墙：壁龛恰 1 地板邻格、背面格皆墙**）+ 出生保底、活板门仅小房间区且 ~1.5%/室、杏仁水权重全池最高、实体密度 <2%/chunk（仅猎犬/钝人、出生安全区为零）、门规则自保证（沿墙皆墙/穿墙皆地板）、窗景区 outdoor 虚空条带 + glasswin（雨痕/显式朝向）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| l5inf-smoke.mts                         | L5（v54 无限化重制；v55 扩 24+ 项）：生成确定性、跨 chunk BFS 全连通、九变体覆盖（出生格恒主厅）、**大厅矩形 ≥30×30 跨 chunk + 每侧 2 门洞共 8 个（多门多走廊口）**、电梯逐槽位断言（主厅大厅格 W/E 门洞嵌墙壁龛、dest=3、出生保底）、古典楼梯 dest=4 + 抵达落点（楼梯 2~4 格环空旷地板）、锅炉房暗门 dest=6（5 格内无灯）、深色木门 dest=9 概率 0.1%~2% + **背面墙化 + darkdoorblock 碰撞**、无户外无多层、主厅挑高、泳池 liquid/扶梯/跳台、实体密度低且死亡飞蛾占比最高、门规则自保证、**走廊 tint 21 地毯/灯带、rug 地毯归属、主厅内饰（redpillar/ceilingbeam/吊灯细化/照片墙）、客房床床头靠墙（181 张）；v55 二轮：三厅挑高、挑高灯具贴顶、 sconce 贴附光源、金色房号牌/肖像画/贝弗莉标牌、黑门 0.3% 区间、锅炉房缩小、furnace/健身三器械/oddtable/wallsign 新结构** |
| manila-smoke.mts                        | 马尼拉室复刻（桌椅/文件夹/墙纸/无实体）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| light-smoke.mts                         | L0 保底照明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| testfield-smoke.mts                     | 测试场地生成 + stitch 不还原 + 补灯                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| stairs-smoke.mts                        | 灰色阶梯保底/返程/初始物资仅首访                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| attack-smoke / chalk-smoke / mech-smoke | 攻击投掷 / 粉笔记号 / v23 新机制                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| l1entity-smoke.mts                      | v33 L1 实体特性：肢团循声/蹲行规避、猎犬威慑、笑魇停电生灭与趋光、手臂蛰伏伸出、钝人穿墙                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| l3art-smoke.mts                         | v53 L3 大幅画作放置校验：挂点即地板+邻侧墙、跨度内背后皆墙/前方皆地板、画前 ≥2 格净空、跨度无结构、尺寸范围、画布比例=贴图宽高比（v53b）；v53b 圣所彩窗（强制 sanct 变体逐扇同规则断言）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

#### 设计模式（v54）

- 设计模式全功能上线（布局/图鉴查看编辑、楼梯编辑、多选复制粘贴、随机样例重采样、新建条目、评分预览、导出 JSON），配套 DESIGN-GUIDE.md。
- 玩家设计 JSON 回灌工具链（gen-patches → applyDesignPatch → diff-verify），4 据点零差异验收通过（v54）。

#### v54 杂项·开发者工具
- DevPanel 多层 NPC 传送修复（按 NpcState.floor 设 z 与楼层带）；设置音频分项音量四滑杆（主/BGM/环境/音效，ambient/sfx 滑杆接通）；存档 UI 调整（标题屏「开始游戏/继续游戏」双主按钮 + 继续进槽位页；暂停菜单「保存游戏」选槽绑定）——见 §5/§3.9（v54 二轮）。
- 寄存门槛放宽为 ≥10 + BNTG 付费通道（5 压印币临时使用，仅本次对话）；存档槽位页删除手动槽（确认窗）+ 窗口扩大 + 暂停保存覆盖确认；DevPanel 三项优化（装饰物召唤分页[decorRegistry 层级分组+LiveChunk 写回]、召唤出口已存在则传送、据点跳转按钮去 emoji + 主层级小框 + 团体主题色）——见 §3.9/§5（v54 三轮）。

## 6. 已知约定与坑

- **v54c 多层解耦**：上层楼板/墙体独立于下层轮廓——up/up2 楼板格不要求正下方有下层地板或楼板
  （wallBaseTopAt：1F 墙在正上方有上层板/墙时止于板底，不再被邻格上层板牵着升高穿过上层地板；
  主层天花由任意上层板/屋面板墙兜底）；canOccupy/bfs3D/几何本就按各层数组独立工作。Gemma 基地
  挑空中庭为实证：前厅内腔无 2F 板、3F 屋面板墙（upWall2）封顶，up2⊄up。
- **v54 通用多层机制（楼层带 0|1|2）**：`bandOfZ` z≥1.5→1、z≥4.5→2；3F 楼板/墙体走
  `up2`/`upWall2`（读取一律经 `upAt/upWallAt(m, f)` 泛化访问，勿直读数组——band≥1 语义才正确）；
  2F→3F 坡道 `stampStairRun(..., base=FLOOR_H)`（可站标记按坡道面高度带分段：下段 up/上段 up2/
  交界格两带皆可站）；**跌井守卫 `stairServesBand`**——坡道只服务其到达的楼层带：从楼板踏入
  不到达本层的坡道段即拦截（中心已在坡道上则放行，否则 3F 下不了 2F→3F 坡道中段）；
  canOccupy 用严格容差 STEP_UP，bfs3D/entityWalkH 用宽松容差 JUMP_REACH（保 EL3A 旧行为）；
  **2D 孤岛回填跳过坡道格**（2F→3F 坡道在主层 BFS 必然不可达，回填会毁梯）；
  坡道下段邻格不得有上一层楼板（井口留空，否则上层直踩下段会跌落）；
  本层天花在更上层楼板存在时不另画（上层板底担当），坡道格不穿破本层顶才画本层天花。
- **v54e 多层修缮**：跳跃顶板（movement.ts——band 随 z 即时翻转，站家具起跳 z 过 1.5/4.5 后
  天花判定曾跳到更上层、人穿进楼板；修正：非坡道格上 band≥1 且 z 未达本层地面时 maxZ 收
  到本层板底 2.65/5.65−头高）；踢脚线层带规则（geometry.ts——高层饰条要求本格墙真延伸到
  本层[upWall 格饰条由上层墙循环负责、跳过防重；或墙顶 ≥本层标高]且邻格有本层楼板，
  1F 墙饰条不再串到挑空/无墙的高层）；上层墙格的下层天花面（upWall 墙盒底面是墙贴图，
  低层天花显墙位异色斑——盖吊顶贴图薄片[slabBotGeos，板底下沿 −4mm]；薄片必须
  toNonIndexed——splitSlabBottom 产物无索引，索引混并 mergeGeometries 返 null 整层渲染崩）；
  灯具贴真实顶（renderer.ts 灯具 fixY 与点光源 ptY 两处——无 z 灯在 up2/upWall2 格
  [挑空中庭]贴 3F 板底 5.65，不再误贴 1F 顶）；主层 2D BFS/孤岛回填只看 floor=0 结构
  （mapgen.ts passFloor/openableAt 改 solidStructAtFloor——上层家具曾把 1F 地板围成
  「不可达孤岛」被回填成墙洞[Gamma 食堂 3 格]，灯具随之落在墙格上）
- **v56 七轮：单层天花板碰撞修复**——单层图站家具（补给箱/桌等）起跳越过 1.5m（BAND_MID）时
  `bandOfZ` 翻到不存在的「上层带」：`groundHeightAt(band=1)` 返回 FLOOR_H，贴地跟随/天花板钳制
  把玩家吸到 3.0m 并卡在天花板上方。新增 `bandOfPlayerZ(m, z)` 按 `m.floors` 钳制玩家高度带
  （单层恒 0、双层 ≤1、三层 ≤2），movement 主段/梯子攀爬/interact 交互与隔层过滤/combat 挥击
  隔层过滤/entityAI 实体击退玩家落点一律改用；engine-smoke 新增 L1/L5/L9 站家具起跳天花板拦截
  回归断言（跳顶不穿顶、落回结构顶）。
- **v54e 容器动画约定**：容器开启态由 `s.data.opened=1`（interact 搜刮完成）驱动——renderer
  updateStructs 按 `CONTAINER_ANIM[kind]` 速率 lerp `g.userData.open` 0→1，每种容器自己的动画分支；
  可动件在建模时经 `movable()` 登记基准位姿（part/idx + bx/by/bz/brx/brz），逐帧「基准+f(k)」绝对赋值
  （不做增量累加，确定性：同结构重开同动画）；**构建时 s.looted 直接置 `grp.userData.open=1`（即终态），
  不再写 if(looted) 静态摆位分支**；flushToWall 内层组包裹后动画遍历须用 g.traverse（g.children 摸不到内层可动件）。
- **v54e 挑空封边扩展**：ceilingSteps 除「低顶格邻挑高（ceiling=1）」外，新增「低顶格邻仅 3F 板
  （up=0 且 up2=1）」边界——填 wallH→2×FLOOR_H−0.35 薄墙（Gamma 前厅中庭门洞/窗格上方的镂空带）；
  三层图坡道格井道上空（up2=0、坡顶破 2F 顶）由 geometry 坡道分支补顶板（uwTop 随 ceiling=1 取屋面 8.6）。
- **v55 性能约定**：updateStructs 只处理 ANIM_STRUCT 预登记的可动结构（门类/容器/lift/留声机等）；
  结构碰撞查询（structBlocksPoint/structStandTopAt/solidStructAtFloor）在无限层走瓦片桶空间索引
  （rev 随窗口平移失效重建）——**有限层禁用**（生成期增删结构使索引失效）。
- **v54e 结构碰撞精度约定**：structColliders 按模型实际轮廓收盒（boiler 罐体盒 ±1.2/top2.6、
  sphboiler 基座盒 ±0.85/top2.2，钳制不超出 s.w/s.h 占地）——消除整瓦 FULL_BLOCK 空气墙；
  BFS 连通仍走整瓦 solidStructAtFloor，不动。
- **据点布局铁律**：每个房间至少一扇门接到走廊网——genOnce 的 BFS 连通回填会把
  「不可达房间内部」填成墙；实心家具下的地板不算不可达（outpost-smoke 已排除该误判）；
  **门线正前方不得放实心家具**（门后第一格被堵 = 房间入口被堵，同样触发孤岛回填——
  希波克拉底实验室一曾因 labbench 正对门洞整间被填成墙）
- **NPC ≠ 实体**：NPC 在 `engine.npcs`（据点由 `GameMap.npcs` 落位实例化；无限层级由
  `LiveChunk.npcs` 活体持有、`engine.syncInfNpcs()` 重收集——v39 BRC 员工打通的链路），
  不进 m.entities/ENTITIES，dev 召唤/实体 AI/实体渲染池都管不到；
  对话/交易只走 scanInteract 的 `kind: 'npc'` 分支（敌对/死亡 NPC 不可交谈）
- 据点走**独立 id 空间（100+）**，不占 LEVELS 数字下标（视为入口层级的子层级）：
  `levels/index.ts` 的 `OUTPOST_LEVEL_DEFS` + `levelDefOf` 统一解析；`NORMAL_LEVELS=12`/`END_LEVEL=12`
  不受影响，'random' 出口永不落入；返程走 `ExitDef.dest: 'back'` → `engine.outpostReturn`
- **chunk 生成器必须保持纯函数**；任何"生成后修改"必须同步写底层 LiveChunk（参考 devTestField）
- **无限层跨 chunk 特征**（L2 的房间/门/连廊）：一律用世界坐标哈希决定 + 世界矩形雕刻
  （`carveRectW` 裁剪到本 chunk），结构/实体按**锚点瓦片归属 chunk** 推送防重复；
  矩形雕刻注意 x0≤x1（西侧特征 `dx+sgn` 需 min/max——否则整段不雕刻，门/壁龛凭空消失）
- **GenChunk 对象一律世界坐标**（结构/物品/灯/出口/实体/NPC——instantiate 统一减窗口原点）：
  L2 曾把售货机/网囊/旱虾/火盐按 chunk 局部坐标推送（且 solidAtL 也传局部坐标），
  实体被偏进墙外虚空、火盐只在原点 chunk 掉落（v51 修复；L0/L1 的 pushItem 助手吃局部坐标
  内部加 WX/WY，L2/L3 的助手吃世界坐标带 inChunk 守卫——混用即此 bug）
- **无限层门规则自保证**：`validateDoors` 只在有限层跑——无限层的门必须在生成器内保证
  「一对侧为墙、另一对侧为地板」（双开门另一扇视作墙）；l2inf-smoke 按同规则断言
- `engine.on()` 返回取消函数，React effect 必须用作清理（播报重复事故的根因）
- **玩家 facing 唯一写入点**：`update()` 顶按视角 yaw 每帧赋值（v50）；任何移动/积分路径再覆写
  （v51 前 integrateMove 后按输入方向覆写）都会让 inView 视锥在移动中错位——表现为交互提示一会有一会无；
  **离线 smoke 设定玩家朝向时必须同步 `look.yaw = facing - π`**（facing=yaw+π），否则 update 后 facing 被覆写回视角方向（engine-smoke 攻击/接触类断言曾因缺少同步而误红）
- **新容器种类双登记**：containers.ts 之外还必须进 engine doInteract 的容器 case 列表，
  否则显示可交互但按键无响应（v51 elecbox 事故）
- **无限层实心结构放置**：一人宽廊道（东西或南北对侧同为墙）永远不放实心结构；
  「至少一个四邻是地板」不是有效判据（廊道内恒真）
- **贴墙结构渲染**：faceOutward 只旋转；要贴墙用 flushToWall（旋正 + 内容整体移向墙面）。
  mountOnWall/wallDir 类贴墙装饰注意别「组平移 + 件偏移」双重偏移（v51 cables 横缆嵌进墙内、
  只剩顶缆垂直穿出墙面的事故）；wallDir 用 Math.random 选墙，重建会换墙——要确定性就按瓦片哈希选
- **交互统一准星评分**（v57）：出口/物品/结构/容器/NPC/杰瑞/人制品售货机不再按类别提前返回，统一按
  「准星覆盖目标轮廓 → 3D 角误差（yaw+pitch）→ 距离 → 可执行性」选取；目标视角半径按物体体积折算，
  正对的稍远目标可压过贴身但偏离准星的出口。v57 严格化后，普通距离硬偏差上限 15°，1.2m 内放宽至 20°、
  0.75m 内放宽至 28°；近距离只放宽方向，任何距离都不再跳过遮挡。距离统一为普通物体 2.2m、拾取物 2.0m、
  NPC/杰瑞 2.5m；大型结构按玩家到占地矩形的最近表面而非中心计距，容器持续搜索/战利品面板也沿用表面距离。
  交互 LOS 从玩家眼高向目标高度作三维射线采样，按 `FloorBand` 分别读取地表 `tiles`、上层 `up/upWall`、
  地下 `dn/dnWall`，并叠加带真实高度的 `structColliders`（可越过低桌，不能穿过柜体/门/墙）；杰瑞和人制品
  售货机同样必须与玩家处于同一高度带。`doInteract` 在执行前重新运行完整扫描并校验对象身份，距离、准星、楼层或
  LOS 任一变化都会使本次按键作废，不再由文件/NPC/拉杆/售货机/前台等分支各自维护不一致的二次判断。
  **v57b 结构交互体积**：不再把所有结构压成离地约 0.73m 的单一目标点；`structureInteractionProfile`
  按真实模型给出水平半径与垂直区间（区分落地/桌上文档、邀请函、布面/海报形地标、2–2.6m 路牌、门、墙画、
  高柜、矮箱、尸体等），水平和俯仰分别扣除模型角半径。准星落在可见表面任意高度即可交互，同时模型边界之外仍保留
  15°/20°/28° 硬门槛与完整三维 LOS；修复高大地标必须贴进占地内部才出现提示的问题。
  **v57c 准星射线交互重构**：目标统一提供世界空间 AABB 交互体积，扫描从屏幕中央发出与渲染/战斗同约定的三维
  `crosshairRay`；射线直接命中可见体积时优先于角度辅助，未命中才回退到 15°/20°/28° 的近距离宽容判定。
  结构水平体积复用 `structColliders` 的精确轮廓、垂直体积复用 `structureInteractionProfile` 的真实高度，出口、
  拾取物、NPC、杰瑞和人制品售货机也接入同一探针；眼高同时纳入蹲伏。距离仍按最近表面计算且所有路径必须通过当前
  `FloorBand` 的三维 LOS，因而修复准星贴在木箱顶板/柜体边缘却无提示的问题，同时不恢复贴身穿墙或余光交互。
  **v57d 真实网格命中桥接**：AABB 仅保留为无渲染帧/小目标的辅助回退；渲染器每帧用 Three.js 相机从屏幕中心
  对玩家附近、同 `FloorBand` 的结构与地面物品网格作递归射线检测，并把实际命中的目标引用、世界命中点和视角快照交给引擎。
  引擎仅接受 250ms 内且玩家位置/视角未明显变化的命中，再复核 2.2m 最近表面距离与三维 LOS；因此箱盖、柜门、
  大型结构边缘、旋转/扁平的地面物品等“准星实际看见的像素”与 HUD/按 E 的目标一致，同时避免使用过期渲染结果或隔墙命中；
  地面物品仍严格执行 2.0m 距离与当前高度带过滤。
  **v57e 手持手电细化**：`renderer/flashlightMesh.ts` 统一构建第一人称与地面/投掷手电模型，轮廓由 20–32 边
  筒身、可拆尾盖、尾/侧按键、橡胶握把、金属止滑环、抱夹、灯颈、三道散热环、外扩灯头、防滚环、内凹反光杯、
  玻璃镜片、LED 芯与挂绳环组成。`flashlight_uv_atlas.png` 为生成式双区真实材质图集（左：磨损黑色阳极氧化铝；
  右：菱形滚花黑橡胶），内建几何 UV 被实际重映射到对应半区并留 mipmap 防串色边距；颜色/凹凸、金属度与粗糙度
  分层生效。手持点亮版仅镜片/LED 发亮，地面版不再使用旧八边形自发光灯头，二者共用同一模型避免视觉断层。
  **v57g 罐装食品/绷带细化**：`renderer/supplyMesh.ts` 统一供地面掉落与第一人称手持复用。罐装食品由 20–24 边
  金属罐身、open-ended 纸标签套筒、标签搭接缝、上下卷边、端盖压槽、易拉环/铆钉组成；生成式做旧食品标签 UV
  沿 U 轴重复三次环绕罐身，避免方图绕圆柱后的图案横向拉扁。绷带由 24 边卷体、正反同心卷层、暗色纸芯、
  自定义顶点/UV 的弯曲垂带和两根散纱组成，卷体、端面与垂带共同采样生成式米白棉纱织纹。两类模型均改用
  项目统一的 classic/realistic 材质工厂，罐体分离金属度/纸张粗糙度，绷带保持高粗糙棉纱观感；纸标签与纱布
  复用颜色图作为低强度 `emissiveMap`，仅补偿低环境光下竖向表面接近纯黑的问题，不改变场景灯光；贴图加载失败时有 DataTexture 兜底。
  **v57h DataTexture 图片换入修复**：`levelTexture` 若以 `DataTexture` 作为同步兜底，异步 PNG/JPG 加载成功后除替换
  `image` 外还会清除 `isDataTexture` 上传分支并同步 `flipY`、像素格式、类型、对齐及 mipmap 参数。Three.js 对
  `DataTexture` 固定读取 `image.data`，旧逻辑换入 `HTMLImageElement` 后因其没有 `data` 字段而静默上传全黑纹理；
  此修复覆盖罐头、绷带和同样使用 DataTexture 兜底的手电筒图集，加载失败时仍保持原程序化像素兜底。
  **v57i 复古光栅与阴影管线**：画面设置新增原生、720P、480P 真实锯齿和 320P PS1 四档。后三档通过 WebGL
  drawing buffer DPR 直接降低 3D 光栅化分辨率；480P/320P 使用最近邻放大，320P 再叠加 5-bit 色阶与 4×4 Bayer
  有序抖动。固定档位与动态分辨率互斥。手电阴影开关改为只控制手电，不再误关真实模式的太阳/场景灯阴影；
  阴影质量分别缩放手电、太阳、点光源 shadow map，点光源阴影远平面按实际射程收紧，透明玻璃/液体只接收而不投出
  整块不透明黑影，从而改善阴影层次、边缘稳定性与 GPU 开销。
  **v57j 电池与瓶装水模型**：物品显示名「手电筒电池」统一改为「电池」，说明覆盖手电与夜视眼镜。电池模型改为
  32 边 AA 电芯，拆分钢壳、热缩包装、接缝、上下压边、绝缘环、凸起正极和内凹负极，侧壁使用做旧黑金包装 UV。
  杏仁水与腰果水统一改为参考老式不锈钢保温杯的模型：32 边拉丝杯身、卷边底座、收肩、颈口、密封圈、锥形旋盖、
  带真实镂空的提环及金属挂绳；二者分别使用「杏仁水 / ALMOND WATER」正常标签和只含错版乱码/损坏条码的腰果水标签。
  地面、投掷与第一人称手持共用同一组模型和 UV，贴图失败时保留 DataTexture 颜色兜底。
- **容器碰撞盒与模型一致**：structColliders(s, m?) 带图查询——柜类按模型轮廓 +
  镜像渲染层 flushToWall 的贴墙侧与偏移量（0.5−depth/2−0.02，东西墙换轴；data.deg/row 不贴），
  不再整瓦片空气墙
- 灯光 `keep: 1` = 停电/闪烁豁免（维护通廊/花园/衔尾/玩家追加灯）
- `levelTexture` 在离线环境自动回退程序化纹理（try/catch 包裹 TextureLoader）
- 可交互门（inkdoor/hoteldoor 等）：`data.open` + `solid` 联动，instantiate 恢复时同步 solid
- **`<label>` 不得包裹 `<button>`**：浏览器会把点击转发给 label 的控件再触发一次——
  一次点击 onClick 双发，开关翻转两次=没变（设置面板开关「要点好几次」的根因①；
  外壳一律用 `<div>`，全项目仅此一处，已扫描排除）；
  **组件不得在组件体内定义**（如 SettingsModal 内嵌 Toggle/Slider）：父级每次渲染都生成
  新组件类型，React 反复卸载重挂——本游戏 HUD 每 0.12s 一跳，按钮常在 mousedown/mouseup
  之间被销毁导致 click 丢失（根因②；一律提升为模块级组件并显式传 props）
- 关门（hoteldoor）若玩家站在门洞：把玩家推到最近可走一侧，否则嵌进实心门体卡死
- 口袋栏同类道具去重（equipItem 与 moveSlot 双路径拦截）
- 噪音判定：普通实体按 `max(响度半径, 听觉)`；**blind 实体（肢团）只按响度半径**——蹲行/慢走因此真正无声
- `hidden` 实体（管道蠕虫/通风管手臂）未现身时渲染层不绘制（renderer.ts `grp.visible = !e.hidden`）
- 停电生成的实体打标 `blackoutSpawn`，`endBlackout` 统一消散；它们不挂 chunk，窗口卸载过滤管不到——靠复电清理兜底
- 无限窗口平移（`updateInfinite`）：实体必须先**归属重定**（改挂当前所在 chunk）再卸载旧 chunk，
  否则追击中的实体会随其出生 chunk 一起被卸载（“凭空消失”）；窗口平移须同步偏移实体的
  `x/y` **和** `targetX/targetY`（含无 chunk 归属实体），漏掉即“瞬移一个 chunk”
- **实体模型朝向约定（v50 事故）**：建造约定正面=+X（渲染层 `rotation.y=-e.facing` 对齐）；
  buildEntityMesh 末尾对**不在 facesX 白名单**的类型统一包 π/2 内层组（默认按 +Z 建造处理）——
  **原生 +X 建模的新实体必须登记进 facesX 白名单**，否则反被旋 90° 变成侧向移动
  （nguithr/dryshrimp 侧向追逐事故）。验收：face 标记件质心应偏 +X（`.check/ng-orient.mts` 全实体审计）
- **tag() 只挂无父节点的对象**（entitiesMesh.ts）：要把子组纳入某个父组做整体显隐/动画，
  **必须先 `parent.add(child)` 再 `tag(child, ...)`**——否则子组直接挂到根组、父组是空壳，
  显隐切换与整体旋转全部落空（nguithr spiderBody 空组导致爆开前蜘蛛可见的事故）；
  +X 模型的俯仰动画绕**本地 z 轴**（rotation.x 是翻滚轴），左右侧附肢抬升方向符号相反

## 7. v50 之后变更（主题 / 图鉴组件 / 真实光影 / 新实体与物品 / 版本纪要）

### 7.1 UI 主题系统

- **8 套主题**（`SettingsModal.tsx` THEMES，设定来源为后室 wikidot 同名 theme 页）：
  经典琥珀 amber（默认）/ 阈限 liminal / 玄武岩 basalt / 暗色阈限 dark-liminal /
  灰色阈限 greyspace / 数据库 database / Fandom 阈限 fandom / M.E.G. meg。
  每主题定义配色（index.css 按 `[data-theme='…']`）与字体槽 `fonts: { title, titleWeight, body, mono }`
  （版头与标题同槽），可改动画/形状/字体/位置。
- 设置面板新增**「主题」标签页**（位于 操作 与 API 之间）；主题卡片**用各主题自身字体**渲染预览。
- **本地字体**：Google Fonts 不可得者存 `public/fonts/`（woff2：Fantasque Sans Mono /
  未来荧黑 Extended / Metropolis / 字魂扁桃体[免费商用] / ChillGSans；
  **v53b：Zhi Mang Xing 志莽行**[SIL OFL，TTF]——L3 大幅画作笔记残页手书字体），
  `@font-face` 写在 `index.html`，打开网站即加载。

### 7.2 阵营字体（`codexScores.ts` FACTION_FONTS，槽位 header/title/body/mono）

- **后室装修公司**：版头 Share Tech Mono + 字魂扁桃体；标题/正文 Anonymous Pro + 未来荧黑 Extended；等宽 PT Mono
- **BNTG**：版头/标题 Staatliches + ChillGSans（中文）；正文 PT Serif
- **杰瑞的信众**：版头/标题 Fantasque Sans Mono；正文 Metropolis（Proxima Nova 为商业字体，以免费可商用的 Metropolis 代替）
- 应用：图鉴团体页头、阵营卡片（标题=title / 版头=header / 正文=body）与人士卡；
  实体页按 `ENTITY_FACTION` 套用——**鹉主杰瑞→jerry、Ferren→bntg**，两者实体卡片带阵营字体。

### 7.3 图鉴组件（wikidot 组件复刻，`CodexWidgets.tsx`）

- **层级等级组件** `LevelClassBanner`（参考 component:nulevelclass）：排版与其完全一致——
  逃离/环境/实体三维 0–5 评分，等级=均值四舍五入；右侧**随分数变化的动态 SVG 图标**；
  数据 `codexScores.ts` LEVEL_SCORES。
- **CECS 统合实体分类系统** `CecsBox`（参考 component:cecs）：左列实体编号+栖息地，
  **IETS 威胁评分放大置于栖息地/实体编号右方**（威胁数字+智能字母，按 `IETS_CLASS_COLORS`
  绿→黄→橙→红分色）；形态分类改**中文+图标**横幅（`CECS_CLASS_INFO`）；19 个性质标签矩阵
  （危害类 RAD/NRO/TXC/PYR 红色）；实体图鉴右上角旧 IETS 组件已删除。
- **IOTS 统合物品分类**（参考 component:iots）：物品详情四行——罕见度/实用性/产地来源/IOTS 等级；
  筛选器 fFreq/fUtil/fOrigin 与旧筛选（异常/用途）并存不重叠；
  产地选**「层级限定」后出现具体层级二级筛选**（fUnique）。
- **物品显示稀有度由 IOTS 罕见度取代**（非常常见/常见/偶尔出现/通常少见/少见/非常少见/唯一/未知，
  `IOTS_FREQ_COLORS` 配色）；旧四档字段（common/uncommon/rare/epic）保留为内部映射来源，不再直接展示。
- 实体图鉴按 **Entity N 编号升序**，未编号排最后；内部形态 vmad 不进图鉴。

### 7.4 真实光影（参考 three.js 物理光照/阴影/GI 实践）

- ACESFilmicToneMapping；阴影默认 PCFShadowMap，真实模式 PCFSoftShadowMap；
  物理光照 = **环境反射探针**（PMREM IBL，`renderer/envProbe.ts`——室外反射真实天空盒、
  室内按层级调色生成渐变 equirect）+ **自然光投影**（sunDir 1024/2048/4096 阴影相机跟随玩家并按纹素对齐）+
  **场景灯投影** + **泛光后处理**（EffectComposer）；灯光池 decay=1.6 近似漫反射回弹。
- 画面设置：**光影模式 经典/真实（可随时退回经典）**、阴影质量、自然光投影开关、
  **场景灯投影盏数 0/1/2/4**、反射强度、**泛光开关+程度滑条**、曝光。
- 阴影质量同步控制手电 512/1024/2048、太阳 1024/2048/4096、点光源 256/512/1024；场景点光源阴影相机
  far 按灯的实际射程动态收紧，减少无效立方阴影体积。手电阴影、自然光阴影和场景灯阴影独立开关；透明材质默认
  接收阴影但不投出不透明块状阴影。
- **L0 灯光改为大范围柔光**：位置对齐 4 格网整齐排列（r=9，衰减覆盖约 23m）+ 8 格保底灯阵；
  L0 地板/天花板自发光提亮（**v53 已应要求删除**）、**踢脚线明度 0.45→0.62**（纹理均不变）；
  潮湿地板改为地板色 ×0.62 暗化，**收敛湿干色差**。

### 7.5 新实体（注册 36 种 = critters 9 + humanoid 7 + deep 13 + special 7，图鉴可见 35；v53 删除绝缘猎手，v55 新增疫疾 malady）

- **旱虾 dryshrimp**（Entity 20，critters.ts）：hp10/speed0.8/damage0，善意无害不反击、缓慢游荡；
  **仅 L1–L5 潮湿地面生成**（L1/L2 各 chunk ~25% 生成 1–2 只；有限层 L3–L5 60% 湿地生成，
  L3/L4 额外补 1–2 块湿地；**L0 不生成**）；玩家击杀必掉物品「旱虾」（可生吃，
  爱子处加工 → **酥炸旱虾**）；死亡飞蛾与钝人 `hunts:['dryshrimp']` 主动捕食——
  **被敌方实体击杀不掉落**。
- **人制品售货机 vendingmachine**（Entity 36，special.ts）：hp200 休眠；**L2 ~10% chunk
  走廊尽头**（恰好三面墙的死胡同）生成，正面朝走廊；**背面交互**显示标语
  「人制品售货机 · 艾里克家族出品……2019，亚利桑那」；**正面交互**白骨人手推出「人制品 ×1」；
  看过背面后玩家**背对它**（视线锥外 >1.7rad 且 ≤10m）**或受到攻击**即活化为 **vmad**
  （hp200/speed1.4/damage14，底部长出**骷髅手作腿**追逐攻击玩家；vmad 为内部形态不进图鉴）。
  - **人制品**（消耗品，5 分钟）：①无法使用其他食物 ②治疗减半 ③恒显饥饿画面特效
    ④体力恢复 ×0.5 消耗 ×2 ⑤受伤 -10%。
- **Nguithr'xurh nguithr**（Entity 16，special.ts）：hp30/speed1.2/damage8；
  **L1/L2 各 ~4% chunk 天花板结球状网囊**；玩家走到正下方（d<1.3）爆开——
  **webbedT 4s 视野模糊+移速 ×0.5**；麻痹期结束玩家**仍同格则垂降追击**，否则回巢重新结囊；
  地面态慢速逼近，**玩家逃出 8m 回陷阱点结囊**；攻击**前摇后仰蓄力→下扑**，
  命中 8 伤并附加**麻痹 1s**。
  - **建模**（entitiesMesh.ts case 'nguithr'）：**12 条双节附肢**（每侧 6——股节上挑环带相间+
    胫节下垂）+ 头胸部（6 颗暗红复眼 + 下钩螯牙）+ 四节分节花腹 + 背斑亮点；
    **双形态显隐**——部件分属 `spiderBody`（蜘蛛本体）与 `sacGrp`（网囊球+悬丝），
    **hidden 时只渲染网囊，爆开后只渲染蜘蛛**；节肢动画：交替三步态（左右腿交替抬落+
    腹部侧摆起伏）/ 闲置高频肢抖 + 腹部呼吸脉动 + 头胸张望 / 前摇后仰→下扑
    （+X 模型俯仰绕本地 z 轴）。

#### 7.8 v50 修复（Nguithr'xurh 朝向与显隐）

- **spiderBody 空组**：蜘蛛各部件（头胸/腹/12 腿）原直接挂根组、spiderBody 是空壳——
  hidden 显隐与整体动画全部落空（**爆开前蜘蛛本体可见的根因**）；已改为先挂进 spider 组再 tag。
- **facesX 未登记**：nguithr/dryshrimp 原生 +X 建模却不在 facesX 白名单，
  被末尾统一包 π/2 内层组 → **侧向追逐/侧向游走**；已补登记（二者现正面=+X，
  ng-orient 全实体审计通过）。
- **前摇动画轴错误**：误用 rotation.x（+X 模型的翻滚轴）→ 改 rotation.z（+后仰/-下扑），
  非前摇分支归零；抬腿方向按左右侧分符号（-z 侧抬高=+rotation.x）；
  行走动画以 `baseRy` 保留腿部展开角不被覆盖。

### 7.6 新物品与物品机制（注册 80 件）

- **旱虾 / 酥炸旱虾**（可食）。
- **火盐晶体 firesalt**（Object 15，`throw:'explode'`）：**前五层角落**（四邻 ≥2 面墙）产出——
  L0 ~6% chunk（罕见）、L1/L2 ~18%、L3/L4 35%；投掷小型爆炸（共用爆炸分支：
  半径 3.2m，<2.2m 伤 45 / 否则 20，眩晕 0.6s，噪引 18m）。
  **汽油桶更名「火油桶」**（key 仍 gas），rarity 提为 rare，生成比火盐晶体更稀有。
- **液态痛苦 liquidpain**（Object 48，epic，通用掉落权重 0.25 **极其稀有**）：
  自饮 **HP -35（保底 1）/ 理智 -55**；**装滋水枪命中 60 伤**（腐蚀性）；
  装液按钮仅背包存在该液体时显示，芯片显示已优化。
- **消毒液 disinfectant**：加入 `UNIVERSAL_ITEMS` 通用掉落池，权重 **5**；因此有限层与 L0–L5
  各无限生成器复用通用池时均可自然生成，同时保留原有疫疾治疗、交易与专属配给来源。
- **七种糖果**（Object 5，均 stack 8、统一饥饿+5 理智+5、**糖瘾：60s 内未再吃 → 理智 -10**）：
  银舌头（交易 95 折 5 分钟）/ 咀嚼子弹（脚滑 10s，强度已调弱）/
  枪糖（右手变枪 10s，左键射巧克力子弹直线 12m 1 伤）/ 纸片人斯坦利（瞬移到最近无阻挡开阔墙面）/
  危害废料（-5 HP）/ 天才糖（播一条简单但常被人认错的知识）/ 杏仁薄荷糖（仅口气清新）。
  - **贴图随堆叠变化**：堆叠 ≥4 袋装 `item_*_bag.png`、<4 散装单颗（快捷栏同规则；
    糖果贩/图鉴等无数量场景默认袋装）；3D 低模始终为散装单颗造型。
  - **糖果贩 NPC「糖佬」希德**（candyman，BNTG）：商人之家市场街东三（**替换原随机 NPC 摊位**，
    房间与市场街连通），**5 压印币换一组（8 颗）**任一种糖果。
- **瓶装闪电**（原「电容器」更名，key 仍 capacitor，Object 42，**归为后室物品** anomalous，
  L3 限定 unique:3）：像素贴图重绘 + 低模重做（玻璃烧瓶+软木塞+蓝色电荷），`throw:'shock'` 不变。
- **物流包裹**补原创像素贴图 `item_parcel.png`。
- **迁跃浆果标签化**：获得时记录发现层级 tag，**仅同 tag 可堆叠（不混堆）**，
  旧档无标签浆果回退 warpBerryLevel；描述芯片改为**「使用后传送：{层级名}」**。
- **拖拽堆叠合并**：同类同 tag 可堆叠物品拖到同一格且合计不超上限时合并为一摞
  （`moveSlot`，优先于交换；装备位不合摞）。

- **幸运豆奶 luckymilk**（v54，wikidot Object 28）：理智 +40 + 饥饿 +20 + 口渴 +30（use sanityeat 双恢复分支
  + value3 口渴效果量）；像素图标/专属低模/售货机小概率产出；rarity rare、anomalous。

### 7.7 机制与体验调整

- **据点生存加成**：饥饿下降 ×1/3；体力恢复 ×2（与咖啡 ×2、人制品 ×0.5 叠乘）；
  **玩家不动时饥饿下降再 ×1/2**（可与据点叠加）。（v54：口渴流失沿用同一套减缓规则）
- **滋水枪**：新增**清空储罐按钮**（`clearSquirt`，仅储罐非空显示）；装液 UI 仅背包有该液体时显示
  （装清水常显）；**水线从右手 viewmodel 枪口射出、指向准星所指点**（含俯仰），
  命中判定为独立射线（4.5m 撞墙即停）。
- **玩家朝向每帧随视角更新**（`p.facing = atan2(-sin yaw, -cos yaw)`）——修复原地转身后
  攻击判定锥/投掷物/水线仍朝旧移动方向的问题。
- 定居点地标生成率上调。
- DevPanel 传送页**「出口与地标方位」**：本层出口/地标名称+实时距离（已发现绿色高亮）。
- **L0 假门装饰**：每区块 45% 概率生成 1–2 扇（概率下调），不透明度 0.68（降低）。
- **形象编辑移动端**：底部弹出面板、竖屏上下排布/横屏左右分栏、预览尺寸移动端缩小（110）。


### 7.8 联机模式（P2P，v58 末批次）

- **架构**：PeerJS（`peerjs@1.5.5`）公共云信令（0.peerjs.com），WebRTC DataChannel 直连；
  **星型拓扑**——房主聚合所有消息再转发（客人之间不直连）。房间码 4 位，
  PeerID = `backroom-v1-XXXX`。**4 人上限**。
  v59 跨设备修复：显式 ICE 配置（Google/小米/腾讯 STUN + PeerJS TURN + Open Relay 443/TCP TURN
  兜底）——peerjs 默认仅 Google STUN + 欧美 TURN，国内/受限网络跨设备打洞常失败；
  加入失败原因分类提示（房间不存在/信令不可达/NAT 穿透失败），加入超时放宽到 25s。
- **文件**：`src/game/net/` 四件——`protocol.ts`（消息类型）、`peer.ts`（PeerJS 封装）、
  `session.ts`（MpSession 大厅状态机 + 12Hz 状态同步 + 事件转发）、`apply.ts`
  （applyMpEvent 应用远端事件）；UI `components/LobbyOverlay.tsx`；
  渲染 `renderer/remotePlayers.ts`（`RemotePlayerViews`，含 `nearby` 碰撞查询）。
  调试点 `window.__mpSession`。
- **大厅流程**：标题页进「联机模式」→ 建房（显示房间码）或输入房间号加入；
  准备前每人可改**显示名称与形象**（hello 幂等更新）；**全员准备后房主才能开始**；
  开局广播携带各玩家槽位。LobbyOverlay 卸载清理仅在未开局时 leave（否则误杀会话）。
- **开局**：每人播入场动画（复用 FallIntro）后出生在 **L0 不同槽位**
  （`mpSpawnSlot`，偏移 [0,40,-40,40]×[0,-32,32,32]），每槽位周围散射**确定性初始物资**
  （id=700000000+slot*1000+k，写入 LiveChunk.items，全端一致、先到先得）。
- **同步模型（折中）**：玩家状态 12Hz 广播（**世界坐标**——各端 chunk 窗口原点不同；
  含层级/位置/朝向/动作/持物/形象，名牌挂在 3D 形象上）；**关键事件广播**
  （拾取三处分支/容器搜空/门开关——门事件转世界坐标/切层 exit）；
  实体同步见 v59（房主权威快照）。
- **层级布局一致**：`eng.mpMapSeed?.(id)` 覆盖默认含 `eng.time` 的种子算法——
  **由最早进入该层级的玩家决定生成**，后来者进入不改变布局；允许玩家同时处于不同层级。
- **孤立效应**：现象激活时远端玩家互不可见（渲染 `visible=False`，实测 L0 隔离/L1 互见 ✓）。
- **玩家间软碰撞**：半径 0.64m（movement.ts 查 `RemotePlayerViews.nearby`），不能重叠。
- **远端玩家第三人称**：形象编辑器的皮肤/装扮 + 更多动作（走/跑/游/ idle 等姿态）+
  手持物品第三人称展示 + 头顶名牌。
- **v1 明确不做**：聊天、断线重连、房主迁移（房主掉线=房间解散）。（实体位置同步已于 v59 补上）
- **验证**：`.check/mp-smoke.mts`（mock 直连：加入/槽位/准备门禁/开局广播/状态聚合/
  事件应用/物资一致性全绿）；`.check/mp-dual.py`（双 tab 实测：建房→加入→双准备→开局→
  状态互通→孤立效应可见性规则，全通）。

#### v59 联机修正与同步扩展

- **「房主看不见其他人」根因与修复**：状态同步原先由渲染循环（rAF）里的 `tick` 节流驱动——
  客人标签页失焦后 rAF 停摆 → 状态停发 → 房主 3s 陈旧清扫把客人删掉；而客人端无清扫，
  房主的最后状态一直挂着，故只有房主侧「看不见人」。修复：发送改由 **setInterval(90ms)**
  驱动（后台标签仍约 1Hz 心跳），`tick` 只缓存 engine 引用；房主清扫放宽到 10s，
  渲染侧 >8s 未刷新的远端视图对称隐藏（两端行为一致）。
- **孤立效应改双向判定**：`MpPlayerState.iso` 由各端自算（L0 非马尼拉室）随状态广播，
  任一端孤立即互不可见、互不碰撞（`nearby` 同步过滤）——修复此前只看本端 tint 的
  「单向镜」（马尼拉室里的人能看见外面，外面看不见里面）。
- **实体位置/行为同步（房主权威）**：房主给本层实体分配 `netId`，~5.5Hz 广播快照
  （`{k:'ents'}`，世界坐标，限最近 60 只，含位置/朝向/AI 状态/hp/死亡/hidden/disguised）；
  同层客人按 netId 匹配→就近（6 格内）同型收养→窗口内新建（`applyMpEnts`），木偶实体
  本地插值趋近快照并挂起本地 AI（entityAI 木偶分支），>8s 未刷新即移除；
  木偶的 chase/attack 状态对本地玩家就近结算接触伤害（各端本地扣血）。
  未被快照覆盖的实体（房主视野外）仍走各端本地模拟。
- **联机战斗结算**：客人挥击/投射物/爆炸命中木偶 → `mpHurtEntity` 改发 `entHit` 事件，
  仅房主扣血/killCheck（快照回同步）；房主击杀掉落经 `dropItem` 事件广播（同 id 落地，
  后续 takeItem 按 id 同步拾取）。客人端对木偶不做本地 killCheck，防掉落/状态分叉。
- **全局事件同步**：L1「闪烁」停电链（warn/start/end）由房主掷骰并广播
  （ambient.ts `bcast`，`eng.applyingNet` 防回环）；同层客人跳过本地随机，
  跟随房主节奏（warn 后本地 3.5s 自动 apply，房主 start 事件幂等兜底）；
  房主不在本层时客人维持本地随机（单人体验不变）。停电笑魇客人端不本地生成，
  经实体快照同步。
- **远端玩家第三人称修正**：手持物品不再渲染地面掉落物的稀有度光圈
  （`buildItemMesh(type, { halo:false })`）；**朝向反转修复**——模型正面为 +Z，
  facing 为地图平面角，正确换算 `rotation.y = π/2 - facing`（原 `-yaw+π` 错误）；
  **先转头再转身子**——headYaw 快速（dt·13）追随视角、身体慢速（dt·5）追随头部，
  头部局部偏转钳 ±1.15rad，并附随俯仰点头（±0.6）。
- **验证**：`.check/mp-v59.py`（双端 15 项：双向可见/朝向关系/手持无光圈/木偶建立与
  位置跟随/hp 同步/停电预警-进入-恢复全链）；`.check/mp-bg.py`（客人标签停摆 12s
  房主仍可见，旧实现 3s 即删）；mp-smoke 全绿（注意 engine 须先于 session 导入——
  apply→infinite↔infiniteL2 既有循环依赖对 node 直跑求值顺序敏感）。
- **仍未做**：实体索敌目标不含远端玩家（房主侧 AI 只以房主玩家为目标）；
  聊天；断线重连；房主迁移。
