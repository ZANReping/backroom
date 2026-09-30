# v23 更新说明

本次扩充的全部设定均以 **The Backrooms Wiki（Wikidot，`backrooms-wiki.wikidot.com`）** 为正典基准，
Fandom（`backrooms.fandom.com`）仅在 Wikidot 缺少视觉描述时作为补充，并在代码注释与图鉴文本中逐条标注来源。

> 注：常被引用的 `backrooms.wikidot.com` 域名并不存在，官方 Wikidot 站的真实地址是 `backrooms-wiki.wikidot.com`。

---

## 一、新增层级 Level 6 – Level 11 + 结局层 Level 601

最终目标已从 Level 5 移走。新的推进链是 **L0 → L1 → … → L5 →（锅炉房深处）→ L6 → L7 → L8 → L9 → L10/L11 → Level 601**。

| 层级 | 名称 | 生成器 | 官方分级 | 核心机制 |
|---|---|---|---|---|
| Level 6 | Lights Out（熄灯） | `darkhall` | Class Pending · 零确认实体 | **外带光源完全失效**（`lightMul: 0` + `noFlashlight`）——手电亮着、灯头发烫，视野却毫无变化；消音室般的寂静；沿墙的加热液体管道是唯一的触觉导航；绊线会把你切出到 Level 6.1 |
| Level 7 | Thalassophobia（深海恐惧） | `ocean` | Class 4 · 实体 2 | 入口房间**侧向嵌在海洋天花板里**——走到门口重力被强制切换，直接坠入水面；四个深度带；无源的昏暗自然光；通往 Level 9 的木门在水下 150 米，**没有绳索下得去也上不来** |
| Level 8 | Cave Systems（洞穴系统） | `caves` | Class 4 · 4/4/4 | **光被主动削弱到 12%**（100 流明手电只剩烛光）；**熵效应**电池 2.2× 速度耗尽、食物迅速腐败；Handyland 的手形岩刺、Rottnest Jungle 的发光蘑菇、Hyperspace Lane 的引路者、焦油之手、第九之路路标 |
| Level 9 | The Suburbs（郊区） | `suburb` | Class 5 · 无任何基地 | 午夜郊区、湿沥青、闪烁路灯、有家具但没有电的房子、**两栋房子卡模嵌套**；⚠ **携带 Pockets 进入本层会立刻引来 Entity 96** |
| Level 10 | Bumper Crop（丰收） | `field` | Class 1 · 敌对实体 0/5 | 全 wiki 少见的安全层，做成 L8/L9 高压之后的喘息层；铅灰阴天、双车辙土路、谷仓、湖泊；刺眼的油菜地块是一扇门；**挖到一米以下会涌出蠕虫** |
| Level 11 | The City That Never Sleeps（不夜城） | `city` | Class 2 · Safe | **Level 11 Effect**：敌对实体主动攻击倾向大幅下降（追击率 45% vs 常规层 89%），但**主动挑衅会永久解除**；约 1/3 建筑不可进入；黑色镀膜镜面窗；街机柜碰一下就送你走 |
| Level 601 | The End（终末） | `library` | Class 3 · 陷阱层 | 结局层。近乎无限的现代图书馆，中央金属字母拼着 *the end is near*；栖息 Partygoers |

### 结局设计（假结局反转）

- 在 **Level 11** 把 6 盘磁带交给 **M.E.G. Base Beta 的档案员** → 进入 Level 601。
- Level 601 **强制生成两扇门**（`allExits: true`）：
  - **「你家的前门」**——灯开着、鞋摆得整整齐齐、钥匙在门口的小碟子里。走进去，你会「回家」，然后在图书馆的地板上醒来。每次触发的文案不同，第二次起会提示真门的位置。
  - **「金属字母底下的门」**——没有装饰，也没有灯。这是真结局。
- 依据：Wikidot FAQ 明确「离开后室是一个敏感话题……本站并不以某一种唯一的正典解释来运作」，《Basics of the Backrooms; A Guide》的口径是「从未有过任何有记录的逃脱」。据此把「回家」处理成假结局，把「看穿它」处理成真结局。
- `random` 出口永远不会把玩家丢进结局层（`NORMAL_LEVELS` 上界约束）。

---

## 二、实体：按 wiki 修正 + 新增 14 种

### 编号勘误（原代码沿用的是非官方衍生 wiki 的编号）

| 实体 | 原编号 | 官方编号 |
|---|---|---|
| 钝人 Dullers | Entity 8 | **Entity 6** |
| 猎犬 Hound | Entity 17 | **Entity 8** |
| 无面灵 Facelings | Entity 30 | **Entity 9** |
| 团块 Clump | Entity 25 | **Entity 5** |
| 死亡飞蛾 Deathmoths | Entity 28 | **Entity 4** |

### 模型按 wiki 原文重做

- **猎犬（Entity 8）——原模型完全错了**。wiki 原文：「A hound appears to be a **human** with long black hair growing on the head… they walk on all fours… despite appearing sickly skinny.」它是**人类**，不是犬。已重做为病态消瘦的人形四足爬行者：前肢加长至与后肢等长、肩胛高耸、脊柱前倾、一大团垂落的黑发遮住整张脸、发帘之下是极大的嘴与尖牙、手部是利爪。
- **钝人（Entity 6）**：2 米高、接近黑的深灰、**无面无耳**（原模型给了眼睛，已去掉）、手臂过膝、皮肤破口露出**紫红色肌肉**。
- **团块（Entity 5）**：改为 12 条放射状异色肢体束 + **一条远超其余长度的主臂** + 缝隙中散落的眼睛与耳朵 + 利齿之口。
- **窃皮者（Entity 10）**：苍黄色、**深凹眼窝 + 纯白眼球**、体表章鱼吸盘状颗粒。
- **笑魇（Entity 3）**：躯体改为**纯黑火焰状剪影**（Fandom：*Nigrum ignem*，形态最像火焰），更宽更弯的上翘笑弧，关节非自然反折。
- **死亡飞蛾（Entity 4）**：锯齿状翅缘、灰色硬毛、**极小的头**、外凸的深黑复眼、注射器状口器、4 节肥大分节腹部、尾须、三对带刺短腿。
- **无面灵（Entity 9）**：略鼓的光滑空白脸 +完整头发体积。

### 新增实体

`mimicry` 模仿者（L6）· `tiny` 小不点 Entity 720 / `thething` 7 层之物（L7）· `wrangler` 缠斗者 / `camocrawler` 迷彩爬行者 / `lightguide` 引路者 Entity 35（友善）/ `deathrat` 死亡鼠 / `wretch` 可怜虫 Entity 15（L8）· `watcher` 观察者 / `strider` 阔步者（Entity 96）/ `mangled` 残破者 Entity 63（L9）· `soilworm` 土壤蠕虫（L10）· `partygoer` 派对客 Entity 67（L601）· `windowent` 窗户 Entity 2（跨层）

每个都带完整的 M.E.G. 档案式图鉴（编号 / 危害等级 / 栖息地 / 行为 / 应对 / ≥3 段档案 / 目击记录）。

---

## 三、马尼拉房间（The Manila Room）复刻细化

严格按 Wikidot `manila-room` 条目重建：

- **正方形**房间、**厚墙**（房间外再包一圈两格厚的实墙）
- **独特的米黄色壁纸**（tint=1 → 渲染走无纹理纯色 `#e5c88f`，马尼拉纸文件夹的暖米色）
- **1 到 4 个入口**，数量与朝向每次生成都不同
- 陈设极少：**通常不超过一张桌子和一把椅子**（新增了椅子的渲染分支）
- 桌上放着**盖有 M.E.G. 徽记的文件夹**（新物品 `megfolder`：剪辑说明 / 实体图鉴 / 重要层级指南；wiki 记载约 36% 的新流浪者靠它离开了 Level 0），且**会随房间的正常变化偶尔消失**
- **它并不安静**：灯发出与 Level 0 相同的恼人嗡鸣；**墙内传出敲击声与砰砰声，灯灭期间最响**（引擎按 tint 区域播报，全黑时额外掉理智）
- 图鉴文案重写：它是「孤立效应」唯一的例外，全层唯一能看见彼此的房间，对所有人出现在同一位置，因此是约定的会合点；他人进入时会「淡入现形」，故须避免多人同时从同一入口进入
- Survival Difficulty 0，无敌对实体（已用测试断言房内实体数为 0）

---

## 四、物品生成方式改造：容器化

补给不再只躺在地上。新增 `containerBias`（每层可配，0.35–0.75），生成时把该比例的补给**预先塞进容器**，需要搜索才能拿到。

容器体系从 6 种扩到 **16 种**，各自有独立掉落池与搜索时长：

`crate` 补给箱 · `corpse` 尸体 · `car` 后备箱（需车钥匙）· `cabinet` 配电柜 · `dresser` 柜子 · `megcrate` M.E.G. 补给箱
· **`locker` 储物柜 · `toolbox` 工具箱 · `suitcase` 行李箱 · `fridge` 冰箱 · `safebox` 保险箱（需撬棍撬铰链）· `mailbox` 信箱 · `barrel` 木桶 · `bookcase` 书柜 · `bonepile` 骨堆 · `campstall` 营地摊位**

掉落池会自动混入**当前层级的独有物品**，所以深层容器能开出深层补给。

### 新物品（20 件，均有 wiki 依据）

`chalkstub` 粉笔头 · `megfolder` M.E.G. 文件夹 · `rope` 尼龙绳 · `divemask` 潜水面罩 · `thingmeat` 巨兽之肉（必须生食——加热会唤醒寄生虫）· `oddbook` 来源不明的书 · `cavingsuit` 洞穴保温服 · `xenonmarble` 氙气玻璃珠（引路者的筑巢材料）· `driedfruit` 干果与干菜 · `uvlamp` 人工紫外灯 · `stonekazoo` 石卡祖笛 · **`pockets` Object 51（背包 +4，但带进 Level 9 会立刻引来邻里守望）** · `housekey` 门廊钥匙 · `wheatgrain` 割下的小麦 · `nails` 钉子 · `timber` 木板 · `presses` 压印币 · `pamphlet` 宣传册 · `citywater` 市政自来水 · `endnote` 烧焦的字条

---

## 五、切入切出（过场演出）

新组件 `src/components/Cutscene.tsx` 取代了原来的简易 `TransitionOverlay`。

**切出（9 种）**：`bloom` 白场绽开 · `shutter` 快门合拢 · `iris` 光圈收缩 · `glitch` 信号撕裂 · `fall` 坠落拉黑 · **`noclip` 剪辑穿透**（画面被切成十几条水平带横向抽出 + 强 RGB 分离 + 空间对折）· **`collapse` 地面坍塌**（剧烈震动 + 黑色裂缝自下吞没 + 尘土）· **`sink` 沉没**（水面线上涨 + 蓝绿偏移 + 波纹扭曲 + 气泡）· **`dawn` 破晓**（冷白光自下升起）

**切入（7 种）**：`fall` 失重坠入 · `collapse` 坍塌坠入 · `wade` 涉水而入 · `crawl` 匍匐钻入（横向窄缝张开）· `step` 走入 · `surface` 破水而出 · `dark` 陷入黑暗（Level 6 专用，**不淡开**）

两段之间夹一张**等宽字距的黑场字幕卡**，显示目标层级与一句氛围文案。切入类型优先取出口自带的 `cutIn`，否则取目标层级的 `entryAnim`；`random` 出口在创建过场时就解析目标，所以字幕卡能显示正确的层级名。过场播放期间引擎冻结操作，播完再交还控制权并弹出层级卡。

---

## 六、开场动画重做

`src/components/FallIntro.tsx` 从 6.8 秒扩到 **13 秒的七段式**：

1. **黑场打字机**（M.E.G. 档案口吻）：「如果你不小心，在错误的地方剪辑出了现实……」「你会落进后室。」
2. **现实场景**：深夜办公楼层，荧光灯走廊向后掠过，脚步声，色调冷白
3. **异常渗入**：墙纸从画面边缘泛黄剥落，荧光灯嗡鸣拔高，走廊透视被拉长扭曲
4. **剪辑撕裂**：RGB 色差分离 + 扫描线跳动 + 空间按水平带反向平移对折
5. **无限坠落**：穿过一层又一层黄色房间（黄墙纸 + 荧光灯 + 潮湿地毯边缘），速度线，远处低语
6. **落地**：黄白闪光 + 强烈震屏 + 潮湿的 Berber 地毯
7. **标题卡**：`L E V E L   0` / `T H R E S H O L D`，然后淡出

全程叠加胶片颗粒与渐晕，右下角常驻「点击或按任意键跳过」。

---

## 七、Level 1 – Level 5 细化

- **Level 5**：Wikidot 正典连接——出口改为**锅炉房深处 → Level 6**，不再在本层通关；大堂旋转门推不动（「它从来就不通向外面」）
- L0–L5 全部补上官方 **Survival Difficulty 卡片**（在层级进入时播报）
- L1–L5 补入新容器：工具箱 / 储物柜 / 行李箱 / 冰箱 / 保险箱，并配置 `containerBias`
- 层级氛围事件从 6 层扩到 13 层，共 60+ 条，每条都对应 wiki 正文的具体细节
- 音频：`startBGM` 补齐 Level 6–601 的 drone 层（L6 近乎消音、L7 水压低频、L8 洞穴回响、L9 风与电流、L10 阴天静默、L11 城市空转、L601 纸与灰尘的静电）

---

## 八、验证

依赖装不上的环境里也能跑——测试用 `tsx` 直接跑 TS 源码，`three` 走桩实现。

```bash
npm run smoke        # 13 层 × 5 seed 生成校验
npm run smoke:mesh   # 29 实体 + 44 物品 + 86 结构 建模校验
npm run smoke:engine # 逐层 400 帧模拟 + 结局链（假门→真门）
npm run smoke:mech   # 熵效应 / Level 11 Effect / Pockets / 容器 / 绊线 / L7 落水
npm run smoke:manila # 马尼拉室复刻校验
npm run smoke:all    # 全部
```

最近一次全绿结果：

```
Level   0 教学关卡  gen=rooms     地面物品 61.8 · 容器  6.4 · 实体  0.0
Level   1 停车场   gen=garage    地面物品  9.0 · 容器 22.0 · 实体  7.8 · 出口 1.2
Level   2 管道走廊  gen=pipes     地面物品  8.6 · 容器  6.8 · 实体  8.4 · 出口 1.4
Level   3 电站    gen=grid      地面物品 15.6 · 容器  8.4 · 实体 11.4 · 出口 1.6
Level   4 废弃办公室 gen=office    地面物品 15.6 · 容器 15.6 · 实体  3.6 · 出口 1.8
Level   5 恐怖酒店  gen=hotel     地面物品 10.6 · 容器 29.8 · 实体 13.4 · 出口 1.4
Level   6 熄灯    gen=darkhall  地面物品  2.4 · 容器  7.0 · 实体  2.8 · 出口 1.0
Level   7 深海恐惧  gen=ocean     地面物品  5.4 · 容器 25.0 · 实体  2.4 · 出口 1.4
Level   8 洞穴系统  gen=caves     地面物品  9.2 · 容器 25.0 · 实体 14.6 · 出口 1.4
Level   9 郊区    gen=suburb    地面物品  7.0 · 容器 88.2 · 实体 13.6 · 出口 1.6
Level  10 丰收    gen=field     地面物品  5.2 · 容器 10.8 · 实体  2.8 · 出口 1.2
Level  11 不夜城   gen=city      地面物品  8.0 · 容器 39.0 · 实体  9.0 · 出口 1.2
Level 601 终末    gen=library   地面物品  7.2 · 容器 19.0 · 实体  4.0 · 出口 2.0

✓ Level 8 熵效应：电池耗尽 2.20× 于常规层
✓ Level 11 Effect：实体追击率 45% < 常规层 89%
✓ Pockets：背包 16 → 20；3/3 个邻里守望被引来
✓ Level 7：走出入口房间 → 高度 0.00 → -1.70，已在深水中
✓ 马尼拉室：桌 ✓ 椅 ✓ M.E.G. 文件夹 2 份/间 · 米黄墙纸 144 格/间 · 房内实体 0
✓ 假结局触发 → 仍在 Level 601；真结局 → 通关
✓ 实体 29/29 · 物品 44/44 · 结构 86 种 全部建模成功
```

> ⚠ 本次交付**未包含 `node_modules`**，也未能在本机跑通 `npm run build`——沙箱到各 npm 源的出口被限流/拦截（`403 Forbidden`），依赖装到 2.4 MB 就停住了。
> 请在你自己的环境里先 `npm install` 再 `npm run dev` / `npm run build`。
> 类型层面已用项目同款严格选项（`strict` + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax` + `erasableSyntaxOnly` + `noFallthroughCasesInSwitch`）全量检查过，`src/game/**` 与新增/改动的组件均无类型错误（残留报错全部来自校验用的 React/three 类型桩，见 `.check/`）。

---

## 九、改动清单

**新增**

```
src/game/levels/l6.ts  l7.ts  l8.ts  l9.ts  l10.ts  l11.ts  l601.ts
src/game/entities/deep.ts          15 个新实体定义 + 完整图鉴
src/game/mapgenDeep.ts             7 个新地形生成器
src/components/Cutscene.tsx        切入切出过场演出
.check/                            冒烟测试与类型校验桩
CHANGELOG-v23.md
```

**改动**

```
src/game/types.ts                  40 个新 StructKind、7 个新 gen、11 个新 LevelDef 字段、CutInKind
src/game/items.ts                  +20 件物品
src/game/mapgen.ts                 接入 genDeep、容器化掉落、allExits、CONTAINER_KINDS
src/game/engine.ts                 容器统一表、熵效应、Level 11 Effect、Pockets、绊线、
                                   马尼拉室墙内声、假结局、新交互（电灯开关/路标/刻痕/街机/金属字母/卡模屋/手形岩刺）
src/game/infinite.ts               马尼拉室按 Wikidot 重建
src/game/audio.ts                  Level 6–601 的 drone 层
src/game/levels/index.ts           13 层清单 + levelNo/levelLabel/NORMAL_LEVELS
src/game/levels/shared.ts          氛围事件扩到 13 层
src/game/levels/l0–l5.ts           SD 卡片、containerBias、新容器；L5 出口改指 L6
src/game/entities/humanoid.ts      钝人/窃皮者/无面灵：编号勘误 + 外观按 wiki 重写
src/game/entities/critters.ts      猎犬/团块/死亡飞蛾：编号勘误
src/game/entities/special.ts       笑魇：编号勘误
src/game/entities/types.ts         10 个新行为标记
src/game/renderer/entitiesMesh.ts  7 个模型重做 + 14 个新实体 + 20 个新物品
src/game/renderer/structures.ts    40 个新结构 + 马尼拉室的椅子与文件夹
src/game/renderer/decorations.ts   7 个新层级的装饰
src/game/renderer/shared.ts        WALL_H / SKY / OUTDOOR_FLOOR 三张表扩容
src/game/renderer/renderer.ts      lightMul（L6 光源禁用 / L8 削弱到 12%）
src/App.tsx                        接线 Cutscene、层级编号显示
src/components/FallIntro.tsx       开场动画重做
src/components/HUD.tsx             层级编号显示
src/components/InventoryOverlay.tsx 层级编号显示
src/components/HowToPlay.tsx       目标文案更新
package.json                       smoke 脚本
```
