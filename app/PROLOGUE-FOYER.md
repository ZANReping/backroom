> v2 已合并至当前原项目；本轮额外修正、真实游戏验收与复现见 [前厅 v2 接入记录](PROLOGUE-FOYER-V2-IMPORT.md)。

> 以下为附件原始设计与开发记录；本项目合并修正与实际验收见 [接入记录](FERREN-RELIC-FOYER-IMPORT.md)。附件自己的旧验收结果不代表当前项目。

# 前厅（Prologue / Foyer）— P1 · M1 + M2 · P2 · M3 · P3 · M4 · 写实化（已合并）

新游戏的开场关卡「前厅」：玩家深夜在自己家中（23:40）。前厅替换旧的 `FallIntro` 坠落动画。

## 关卡结构
- 独立 id `900`（`world/foyerLayout.ts` `FOYER_ID`），定义见 `levels/lfoyer.ts`，只经 `levelDefOf` 解析，不进入 `ALL_LEVEL_DEFS`（图鉴/路线审计不列出）。
- 生成：复用 `gen:'outpost'` 管线入口，`mapgenOutpost.ts` 分派到 `genFoyer`（手工布局：房间、隔墙、门、家具、灯、临时出口）；`mapgen.ts` 对 900 跳过通用预制/BFS 管线。
  - 方案原定 `gen:'prologue'`；M1 为减少对通用生成代码的改动，暂复用 outpost 分派。如需独立 gen 类型，后续可在 `LevelDef.gen` 联合类型中新增。
- 有限地图 30×24 m；房间：卧室、卫生间、开放厨房、客厅、玄关、楼道（P2 扩展为楼道 → 街道）。
- 渲染：`renderer/foyerHome.ts` 统一构建地面/墙面/吊顶/踢脚线/窗与窗外夜景、全部家具与可动部件；材质与光照见下文「写实化美术」（`foyerPbr.ts` / `foyerBake.ts`），`renderer/foyerTextures.ts` 为少量程序化贴图（屏幕、窗外夜景等）。`foyerprop` 结构仅作碰撞代理（`structColliders` → `foyerColliders`）。
- 夜间光照：室内吸顶灯/台灯/吊灯/落地灯为暖白点光，楼道冷白声控灯；窗外为夜间城市灯火贴图；`darkness 0.02`。
- 交互（`engine/foyer.ts`）：卧室门、卫生间门、防盗门开关（碰撞随门移动）；衣柜、书桌抽屉、床头柜抽屉、冰箱开关；电脑 → 网页文档（先新闻 `foyer_news`，再论坛 `foyer_forum`，DocOverlay `web` 样式）。

## 存档与开局
- `player.prologue = { step, flags }` 随存档；缺省（旧存档）视为已完成。`player.hudUnlocks` 见下文 M2。
- 全局标记 `localStorage br_foyer_done`（`core/foyerFlag.ts`，不随存档槽）。
- 新游戏：未完成过前厅 → 进入前厅；完成后默认直接进 Level 0；设置「游戏」页「启用前厅」开启 → 再次从前厅开始。联机局不进前厅（多人冻结，未改联机逻辑）。
- ~~临时出口~~（M1/M2）：楼道东端「楼梯间（临时出口）」→ Level 0。**M3 起移除**：楼道东墙改为安全通道门（下楼进入街区），回程异常终点直接调用 `levelDef.exits[0]`（Cutscene `fall`）→ Level 0，离开时写入完成标记。M4 由 RealityBreak 过场替换。
- 旧 `FallIntro` 不再渲染（组件文件保留未删）。

## 素材来源
- M1 未使用外部模型或贴图（几何代码建模、贴图运行时 Canvas 绘制）。写实化美术专项起，墙/地/木作/织物改用 Poly Haven **CC0** PBR 贴图，来源、作者、许可与处理见 `public/textures/foyer/FOYER-ASSET-SOURCES.md`（处理脚本 `scripts/prepare-foyer-textures.py`）。几何仍全部为代码建模。
- 招牌/网站/品牌均为虚构中性名称（如 `24H MART`、`citymorning.example`、`borderline-forum.example`）。

## 写实化美术（prologue-visual）
- 材质：`renderer/foyerPbr.ts`，前厅一律 `MeshStandardMaterial`（颜色图 sRGB、法线/ORM 线性；UV 按贴图真实尺寸世界平铺），自带夜间室内 equirect 环境反射（暖灯斑 + 窗外冷色城市光带）。其余层级材质不受影响。
- 光照烘焙：`renderer/foyerBake.ts` 在关卡构建时分帧计算（swiftshader 约 3–5 s）：墙/地/顶 → HalfFloat 光照贴图图集（6 cm 纹素，软阴影 + AO + 按房间一次反弹 + 墙脚踢蹭/积灰/地面磨损），家具 → 逐顶点辐照度（大面盒体 ≈0.3 m 细分）。吸顶灯/吊灯漫反射完全烘焙、运行时只保留高光（不穿墙漏光）；台灯为实时聚光灯（软阴影），落地灯为实时点光（阴影）；窗为冷色面光源，显示器/电视为冷白屏光。
- 间接光（第二轮）：按房间估算一次反弹（反照率 + 主材染色：木地板房间偏暖、楼道偏冷），写入 0.25 m 探针网格，沿开放边界（客厅↔厨房/玄关、门洞）做受墙体约束的扩散（24 次 5 点平均，过渡带半宽 ≈0.8 m），烘焙时双线性插值、跨墙的探针不参与——开放空间交界不再有台阶状明暗突变。
- 楼道声控灯：直接光实时（玩法控制开关），冷白 ≈6500K；楼道水磨石为冷灰（贴图预处理去棕调）。其**间接光单独烘焙**到一个标量通道（壳体光照贴图 alpha、家具 `foyerIrr.w − 2`），着色器中乘 uniform `foyerCorridorIrr`（= 灯色 × 亮度乘子），可随灯亮度整体缩放：
  - 接口：`renderer.foyer?.setCorridorLightLevel(level)`（`FoyerScene`，level 0..1，1 = 烘焙基准亮度，允许到 1.5）。同时把该灯 `intensityMul` 写为 `基准(0.3) × level`（实时直接光）并同步间接光。
  - 自动同步：`FoyerScene.update()` 每帧按 `灯.intensityMul / 基准` 重算间接光，所以若 M2 直接改写楼道灯的 `intensityMul` 也会生效（注意 M2 的乘子须以 `foyerCorridor.baseMul`=0.3 为 1 档）。
  - **合并 M2 时**：M2 声控灯若有自己的 `intensityMul`/亮度曲线（0..1），在其每帧更新处调用 `renderer.foyer?.setCorridorLightLevel(m2Level)` 即可；不要再把 M2 的 0..1 直接写进 `L.intensityMul`（否则会被当成 3.3 倍亮度，被钳到 1.5）。灯熄灭（level=0）时楼道只剩最低环境量（夜间城市漫射）。楼道灯可通过 `foyerCorridor.light` 取得（`foyerBake.ts`）。
- 色调：ACES Filmic，前厅曝光 ×1.3（第二轮由 1.12 提高；吸顶灯 0.34→0.4、反弹 ×1.08 近似多次反弹、墙漆提亮）；环境光/半球光压到极低（漫反射来自烘焙）。
- 性能：前厅点光池固定 8 盏（地图 9 盏，台灯零强度灯排在末尾；其余层级仍按设置 8–48 盏）；粗糙表面（roughness>0.9：乳胶漆墙、吊顶、织物）上烘焙灯整盏跳过（漫反射本就来自烘焙，只剩极弱宽高光），连同阴影采样一起省掉。
- 楼道灯具：M1 地图楼道灯没有灯具模型，第二轮在 `FoyerScene.buildCorridorLamp` 补了乳白圆形吸顶灯（灯罩亮度随 `corridorLevel`）。若 M2 另建声控灯模型，合并时删掉其一。
- 预热修复（全局，`sceneWarmup.ts`）：投影灯阴影图尚未创建时，预热空绘制会让 Three.js 用普通 emptyCubeTexture 顶替 `samplerCubeShadow` → 约 200 条 `GL_INVALID_OPERATION: Mismatch between texture format and sampler type`。现在在同一次（空）阴影 pass 中先分配阴影图，下一真实帧再重绘。
- 阴影：前厅灯与几何静止，点光/聚光阴影只在门/抽屉/冰箱移动时重绘（`FoyerScene.shadowEpoch`），不做周期刷新。
- 细节：`renderer/foyerDetails.ts` 开关插座、门套线；顶角线避开开放式边界；窗帘为带垂坠褶皱的连续布面。

## 合并说明（prologue-visual → 主线）
- 写实化光照**只作用于家中（含楼道）**：渲染层每帧按 `foyerRoomAt(玩家)` 计算 `foyerIndoor`。家中：曝光 ×1.3、点光池 8 盏（家中实时灯优先）、环境/半球光压低（漫反射来自烘焙）、不叠加通用近灯反弹、阴影按 `shadowEpoch` 事件刷新；街区（门厅/小区/街道/便利店/后巷）沿用 M3 的通用夜景设置（曝光 ×1、点光池按设置、通用环境光与反弹、阴影周期刷新）。家 ↔ 街区只经楼梯黑场切换，点光池盏数变化带来的着色器重编译落在黑场里。
- 烘焙只处理家中：`prepareFoyerLights` 跳过不在家中房间内的灯（街区路灯/门厅灯/店灯不被改参数、不进 `foyerBakedLights`），`FoyerBaker` 的遮挡体与探针网格只覆盖家中外接框（地图扩到 160×160 后不再扫描整个街区）。
- 楼道声控灯：`engine/foyer.ts` 只维护 `corridor.level/timer/flick`，不再写 `intensityMul`；渲染层每帧 `FoyerScene.update(..., foyerVisual)` → `setCorridorLightLevel(corridorLightLevel(eng))`（0..1，含起辉闪烁；1 = 基准 0.3）。`foyerCorridor.baseMul` 固定 0.3（M2 地图里该灯初始 `intensityMul = 0`，不能拿来当基准）。
- 灯具模型只保留一份：写实化的 `buildCorridorLamp`（乳白圆形吸顶灯，灯罩随亮度）；M2 的 `stairlamp` 道具只留作布局数据，渲染为空、烘焙不遮挡。
- 前厅不再预加载不存在的 `l900_wall/floor/ceil` 通用贴图（`core/preload.ts`，原先静态服务下 3 条 404）。

## 验证（M1）
- `npx tsc -p tsconfig.app.json --noEmit`、`npm run build` 通过。
- 无头 Playwright（chromium headless + swiftshader，1280×720，dev server 端口 5200）实跑：标题 → 设置开关 → 开始游戏进入前厅（level 900，prologue.step=act0）→ 各房间截图 → 电脑网页 → 楼道临时出口 E 交互 → Level 0；完成后 `shouldStartInFoyer(false)=false / (true)=true`。控制台 error 0。
- 截图与日志：`app/reports/prologue-m1/`。

## M2：HUD 权限 · 教程 · 手机 · 拾取物 · 声控灯

### HUD 权限系统（`engine/hud.ts`）
- 键：`hotbar / inventory / battery / clock / quest / minimap / log / status / hp`，存于 `player.hudUnlocks`（随存档）。
- `hudUnlocks` 缺省（undefined）= 全部解锁：旧存档、直接进 Level 0 的新游戏、离开前厅（`completeFoyer → unlockAllHud`）都走这条路径。
- 前厅开局写入 `{}`：只有准星、交互提示与教程纸带。区域名标签随 `minimap` 显示。
- 解锁：`unlockHud(eng, keys)` 记录 `engine.hudRevealAt[key]`（不入存档），HUD 对该区块加 `.hud-reveal` 播放「胶片刻度」浮现动画（`index.css`：分步 clip-path 揭开 + 琥珀刻度线扫过，约 1.2–1.9 s）。
- 设置「始终显示全部 HUD」→ `engine.hudShowAll`（App 同步），只影响显示与界面入口，不改写存档里的解锁记录；开启时不播放浮现动画。
- 界面入口同样受权限约束：背包/图鉴需 `inventory`，地图需 `minimap`，任务/日志需 `quest/log`，状态需 `status`（前厅内不解锁，P3 在 L0 解锁）。
- 拾取 → 解锁：手机 → clock、quest、log、minimap、battery；背包 → hotbar、inventory；手电 → battery；status/hp 留给 P3（L0）。

### TutorialDirector（`engine/tutorial.ts` + `content/tutorialFoyer.ts`）
- 数据驱动步骤 `{ id, trigger, hint, complete, optional?, repeatable? }`；完成记录写 `prologue.flags['tut:<id>']`，事件型条件用 `engine.markTutorial(id)` 写 `flags['ev:<id>']`。
- 提示模板中的 `{interact}` `{crouch}` `{phone}` 等按 `core/keybinds.ts` 的自定义键位显示（如 `[E]`）；`{move}` `{look}` 为组合说明。移动端改写为触控控件名，并通过 `body[data-tut-touch]` + `[data-touch-id]` 高亮对应按钮（触屏扇形按钮已补 `data-touch-id`）。
- 显示位置：快捷栏上方的「纸带」（不弹窗），带步骤序号。
- 前厅步骤（主线 12 步）：环顾 → 看新闻 → 看论坛 → 拿手机 → 打开手机 → 衣柜背包 → 手电（床底蹲下 / 床头柜抽屉，按种子二选一）→ 开关光源 → 冰箱水与零食 → 出门 → 楼道声控灯 → 楼梯间。
- 旁支提示（`optional` 步骤）：不进主线序号、不阻塞、不占纸带，满足条件时在纸带上方以独立小提示（`.hud-tutorial-side`，`data-tutorial-side`）显示，可与主线纸带同时出现。目前只有「手机电量 < 20% 且不在充电座 → 回卧室充电」（`repeatable`，不持久化）。`TutorialDirector.side` / `sideViews()`。
- 「准备出门」任务清单在 `quest` 解锁后显示在右上（`foyerQuest`）。

### 手机（`engine/phone.ts`、`components/PhoneOverlay.tsx`）
- 物品 `phone`（`content/items.ts`，装备位 offhand）。状态 `player.phone = { battery, torch, docked, notes, photos }` 随存档；开局放在书桌充电座上（38%）。
- 新键位「手机」默认 `P`（可在设置里改绑）；移动端右上出现手机按钮。
- **打开手机界面不暂停游戏**（App 的暂停判定排除 `overlay === 'phone'`）：世界照常运行，手电/相机实时生效，前厅时钟照走，亮屏额外耗电。界面打开期间移动/视角输入不接收（鼠标用于点按 App），但 `F`（手电键）照常开关副手光源；相机取景模式下界面已关闭，可正常移动与转视角。
- 功能：手电（副手为手机时 `F` 也开关手机手电；比手电筒弱、光束更宽；耗电 0.32%/s）、笔记（拿手机时自动写入论坛帖摘要与待办；照片条目带缩略图）、时钟（前厅时钟 23:40 起按游戏秒推进，含秒）、相机（取景模式，`E`/攻击键拍照，渲染后同一任务截取 240px 缩略图，闪白，耗电 0.8%）。
- 充电：卧室书桌充电座 `E` 放上/取回（约 1.1%/s，游戏化加速）；电量显示在 HUD 电量行（⚡=充电中，☀=手电开）与手机状态栏。电量耗尽时屏幕黑掉、手电关闭。
- 第一人称：副手手机竖握、亮屏（`viewmodel.ts buildPhoneViewMesh`），与手电筒互斥（副手只有一件）。

### 可拾取物（`engine/foyer.ts` FOYER_PICKUPS；位置 `world/foyerLayout.ts` FOYER_PICKUP_POS；模型 `renderer/foyerHome.ts buildPickups`）
- 拾取优先级：家具内的可拾取物带 `priority`（`FoyerTarget.priority`，从命中角度分扣除），准星落在物品上或其附近时压过所在家具的开关（如「关上 冰箱」不再抢走能量棒）；水/能量棒交互体适当放大。
- 手机（充电座）、背包（衣柜底层，打开柜门才能看到/拿）、手电（床底——须蹲下才出现交互；或床头柜抽屉里随抽屉滑出）、瓶装水与能量棒（冰箱，开门可见）。新物品：`bottledwater`、`snackbar`（含地面/手持模型与图标）。
- 背包是剧情拾取（不是物品）：解锁快捷栏与背包界面。拿手电时副手若被手机占用，手电进背包，可在背包里换到副手。

### 楼道声控灯
- 楼道灯初始熄灭；玩家在楼道里产生声响（脚步、跳跃、冲刺，`engine.noise > 0.08`）或打开防盗门时亮起（起辉闪一下），静止约 14 s 后渐灭。实现（合并写实化后）：渲染层每帧调用 `renderer.foyer.setCorridorLightLevel(level)`，同时驱动实时直接光、烘焙的楼道间接光与灯罩发光（见「合并说明」）。

### 验证（M2）
- `npx tsc -p tsconfig.app.json --noEmit`、`vite build` 通过。无头 Playwright（chromium headless + swiftshader，1280×720，`dist` + 静态服务端口 5200）实跑截图见 `reports/prologue-m2/`（脚本 `m2_flow.py`），从开局一路跑到楼梯间 → Level 0。
- M2 收尾修复（实测确认）：手机界面打开时 `engine.paused=false`；手机界面「手电」按钮开关生效；相机取景按 `E` 存照片（笔记数 +1、带缩略图、闪白）；冰箱瞄准能量棒得到「拿 能量棒」；低电量提示为独立小提示，主线纸带同时保留当前步骤。
- 测试说明：该无头环境下 CDP 鼠标事件（`page.click` / `page.mouse`）到不了游戏页面（简单测试页正常），QA 脚本对手机 App 按钮改用 DOM `element.click()` 触发 React `onClick`；真机鼠标/触屏点按未在此环境验证。

## M3：楼道 → 小区 → 第六大街 → 旧仓路后巷 → 回程异常（第 2–4 幕）

### 地图与布局（`world/foyerStreetLayout.ts`）
- 家与街区同一张有限地图：`FOYER_MAP_SIZE = 160`（`levels/lfoyer.ts size`）。街区位于家的东侧（x ≥ 28），西侧整排高楼立面（`west_block`）遮住家的方向。
- 区域（`STREET_AREAS`，同时写入 `m.zones` 供 HUD 区域名）：单元门厅、小区、小区门口、第六大街、十字路口、24H 便利店（可进入）、旧仓路后巷。
- 楼梯：楼道东墙安全通道门 `E` → 黑场「三楼 → 二楼 → 一楼」（按真实时间约 2.8 s）→ 站在门厅西侧最后半跑楼梯的平台上（elev 2 = +1.2 m），沿两格 `m.stair` 坡道（7 级踏步渲染）走下到门厅，单元门出去是小区。平台西侧 `E`「上楼 回家」可返回楼道（第 4 幕前）。
- 小区：楼栋立面、庭院灯、花坛与树、长椅、单车棚、秋千、停车位、垃圾桶、门岗；南侧围墙中间是「小区门口」门洞（门楼 LUMEN COURT）。
- 第六大街：双向两车道 + 人行道与路缘、双黄线/车道虚线/斑马线/停止线、路灯（错位排列）、四角红绿灯（22 s 循环）、公交站（广告灯箱 + 寻人启事）、电线杆寻人启事、路边停车（含出租车/面包车）、自动售货机、消防栓、施工围挡封住街道两端与路口南北（有限地图的自然边界）。
- 南侧底商（虚构中性招牌）：NOODLE HOUSE（打烊卷帘）、+ PHARMACY、BUBBLE WASH 自助洗衣、24H MART（玻璃自动门，按距离滑开；店内货架/冷柜/收银台/小电视）、FOR LEASE、PHONE REPAIR。
- 旧仓路后巷：巷口过街楼门洞（与小区门口为**同一门洞模块**，用于回程无缝循环）、砖墙、垃圾箱、空调外机、水管、积水、壁灯；巷底死路。

### 剧情与交互（`engine/foyerStreet.ts`）
- 剧情记录写 `player.prologue.flags`（随存档）：`went_down / outside / on_street / read_poster / visit_mart / reached_alley / clue_graffiti / clue_boxes / clue_cctv / photo_any / act4 / dup1 / loop1 / loop2`；`prologue.step`：`act2`（下楼）→ `act3`（进巷）→ `act4`（回程）。演出状态（黑场、路灯明灭、坠落计时）在 `engine.foyer.street`，不入存档。
- 交互目标经 `foyerTargets` 统一进入 `scanInteract`：安全通道门、寻人启事（DocOverlay `foyer_missing` + 每张不同的消息）、公告栏、电梯、收银台、售货机、门岗、三个调查点。
- 调查点：墙上的涂鸦（黄色歪门 + NOCLIP HERE →）、湿纸箱、巷底被黄胶带缠住的旧监控。`E` 调查 → 消息 + 手机笔记（调查记录 x/3）。
- 手机相机：`takePhoto` 末尾调用 `onStreetPhoto`——视线夹角 < 22°、距离 < 9 m 内的调查点/寻人启事记为拍到，照片条目补充「拍到：…」说明；拍到调查点写 `photo_any`。
- 三处调查 + 至少一张调查照片 → 2.5 s 后手机震动：论坛新回帖（笔记「论坛 · 新回帖」：嘲讽 +「回家的路上别回头」）→ 第 4 幕「回家」。
- 回程异常（`updateReturn` / `streetVisual`）：行人全部消失、红绿灯只剩黄闪、门洞吸顶灯熄灭、靠近玩家的路灯频闪；走到路口以西，洗衣店灯箱变成「24H MART」（同一家便利店出现两次）；向北穿过小区门口门洞中线时**无缝传送**到巷口门洞（同一模块、同一朝向，位移 `ARCH_LOOP_DELTA`），第 1 次循环后药房也变成 24H MART、更多路灯熄灭；第 2 次循环后放行，小区所有窗灯全灭、庭院灯几乎全灭，走进小区深处 → 镜头震动「地砖发出脆响，裂缝里透出昏黄的光」→ 1.6 s 后调用 `levelDef.exits[0]`（Cutscene `fall`）→ Level 0（`completeFoyer` 写完成标记、恢复全部 HUD）。
- 黑场字幕：HUD `data-foyer-fade` 层（`foyerFadeView`）。

### 教程与任务清单
- `content/tutorialFoyer.ts` 新增主线步骤：安全通道下楼 → 走下楼梯出单元门 → 小地图导航到第六大街 → 冲刺 → 看寻人启事 → 找到旧仓路后巷 → 调查一处 → 手机拍照 → 调查剩余 → 等手机震动 → 回家。旁支小提示：路过便利店「还亮着灯，可以进去看看」。
- 下楼之后，家中未完成的主线步骤自动视为完成（不阻塞街区教程）；冲刺/寻人启事在进入后巷后自动视为完成。
- 任务清单：下楼前「准备出门」（最后一项改为「出门，去那条巷子」= 已下楼）；下楼后「旧仓路后巷」（下楼出小区/寻人启事/找到后巷/三个调查点/拍照）；第 4 幕「回家」（随异常追加条目）。
- 小地图：M2 已随手机解锁（出门前即有），M3 无需额外解锁；地图为家 + 街区全图。

### 渲染（`renderer/foyerStreet.ts`、`renderer/foyerStreetTextures.ts`）
- `FoyerStreetScene` 与 `FoyerScene` 并列构建（`renderer.ts` 仅加入构建/更新/释放/动态根四处钩子）；静态几何按 32 m 区块 × 材质合批。
- 地面/路缘/墙体/砖墙/草地/金属/玻璃复用 L11 的 PBR 材质工厂 `l11Material`（ambientCG CC0：Asphalt012、PavingStones035、Concrete034、Bricks097、Plaster、Grass、Metal、Ceramic 等，来源与许可已登记于 `public/textures/L11-ASSET-SOURCES.md`；本里程碑未新增任何外部图像文件）。
- 立面窗格（亮窗发光图）、招牌灯箱、店内背景、卷帘门、寻人启事、广告、涂鸦、货架商品、冷柜、售货机、施工围挡、纸箱、夜空等为运行时 Canvas 程序化贴图。
- 动态：路灯灯头亮度跟随 `streetVisual.lamps`（与地图光源 `intensityMul` 同步）、红绿灯、行人（6 个简模，第 4 幕隐藏）、便利店自动门、监控红灯、跟随相机的夜空球、招牌替换、窗灯全灭。
- 改动既有文件尽量少：`foyerHome.ts` 只在外墙构建里跳过非家中瓦片（1 行）；`renderer.ts` 中前厅街区路灯不画默认灯杆（`noFix`）。

### 验证（M3）
- `npx tsc -p tsconfig.app.json --noEmit`、`npm run build` 通过。无头 Playwright（chromium headless + swiftshader，1280×720，`dist` + 静态服务端口 5200）脚本 `reports/prologue-m3/m3_flow.py`：开局 → 拿手机 → 安全通道下楼 → 门厅/小区/街道/便利店/路口/后巷 → 三处调查 + 相机拍照 → 论坛回帖 → 回程异常（空街/便利店两次/两次门洞循环/窗灯全灭）→ 坠落 → Level 0。截图与日志见 `reports/prologue-m3/`。

## M4（P3）：RealityBreak 过场 · Level 0 着陆

### RealityBreak（`components/RealityBreak.tsx`，音效 `core/realityBreakAudio.ts`）
- 前厅出口 `anim: 'realitybreak'`（`ExitAnim` 新增该值；`levels/lfoyer.ts`，`fallDamage: 6`）；App 遇到该过场时渲染 `RealityBreak`，其余过场仍走 `Cutscene`。阶段约定与 Cutscene 相同（`onStageChange` out → loading → in），App 的冻结/换图逻辑不变。
- 起手画面：回程终点地面碎裂计时最后 0.2 s 内经 `engine.pendingPhoto` 截取最后一帧 3D 画面（`foyerLanding.requestBreakShot`，≤1280 px），过场从这张真实画面开始；截取失败时退回暗色夜景渐变。
- 阶段（`data-rb-stage`，过场内部时间 `data-rb-t`）：`crack` 0–1.6 s 放射+环形裂纹生长、裂缝透黄光、震动与横向错位 → `shatter` 1.6–3.5 s 画面褪向后室黄（`color`/`multiply` 合成），沿同一裂纹结构切出的碎片向上剥落飞散 → `fall` 3.5–5.9 s 穿过一层层黄房间（天花板灯管 / 墙纸 / 地毯，嵌套矩形透视 + 速度线 + 缓慢翻滚）→ `impact` 闪白 → `card` 黑场 + 荧光灯嗡鸣 + 字幕「你穿过了地面 / Level 0」（≥2.2 s，等附近场景就绪）→ `in` 眼皮两次开合、backdrop 模糊消退。
- 声音：碎裂（高通噪声脆响 + 低频闷响，4 次）、现实失真低鸣（失谐锯齿 → 波形整形，音高下坠）、坠落风声（带通噪声）、撞击、黑场嗡鸣（60/120/180 Hz + 嘶声，走环境总线）；挂在 GameAudio 音效/环境总线上（`audio.fxNodes()` 新增访问器），受静音与分项音量控制。
- 跳过：桌面 空格/回车（右下角提示 `[空格] 跳过`）；粗指针/小屏显示「跳过 ▸」按钮。跳过直接进入黑场（仍等待场景就绪）；醒来阶段再按跳过立即结束。
- 移动端/粗指针：碎片 8×4（桌面 12×6）、关闭横向错位；`prefers-reduced-motion`：关闭震动、画面错位、闪白与频闪。

### Level 0 着陆（`engine/foyerLanding.ts`）
- `completeFoyer` 末尾调用 `prepareFoyerLanding`：取出快捷栏/背包/副手的全部物品（手机、手电、水、能量棒、背包里其他物品），背包本身变为地面物品 `foyerpack`「你的背包」（`content/items.ts` + `renderer/itemsMesh.ts` 新增）；手机标记 `cracked / noSignal`；`hudUnlocks = {}`。
- `engine.ts` 在 `loadLevel` 后调用 `applyFoyerLanding`：物品散落在出生点 1.5–5 m 环带（可站立、互相 ≥0.9 m、与出生点之间无阻挡）；去掉通用开局物资中 8 m 内重复的手电筒（绷带/杏仁水/随机消耗品保留）；复用新游戏开局「贴地侧躺 → 爬起」镜头（`introT = 3.2`）。落地扣 6 HP（出口 `fallDamage`）。
- `updateFoyerLanding`（L0、着陆未完成时每帧，按真实时间）：醒来 0.9 s → 解锁 `status / hp / quest`（首次出现，胶片刻度浮现动画 + toast）；1.8 s → 主线写入「收集六张磁带并送往 Level 11 档案馆」（toast + 日志）。拾取手机 → 自动装副手、解锁 `clock / log / minimap / battery`、写入手机笔记「主线」；拾取背包 → 解锁 `hotbar / inventory`（背包物品消耗）；拾取手电 → `battery`（副手空时自动装备）。全部找回后 2.2 s `hudUnlocks` 回到缺省（全开）。
- 剧情记录（随存档）：`prologue.flags` `landing / l0_hud / main_quest / l0_phone / l0_pack / l0_flash / l0_water / l0_snack / l0_done`。
- 任务追踪：HUD 右上与前厅任务清单同一面板（`landingQuest`）：「主线 · 六张磁带」——找回手机/背包/手电/水和能量棒（找回后收起）、收集六张磁带（读 `player.tapes`）、送往 Level 11 档案馆（读 `l11World.archiveUnlocked`，即现有 `submitL11ArchiveTapes` 提交磁带）。只读现有磁带/档案馆状态，不新增任务系统条目，不改七条团体路线（`career`）与 M.E.G. 任务。
- 手机：碎屏 SVG 贴图（`components/PhoneCracks.tsx`，固定种子）；状态栏「无信号」；主屏论坛卡改为「无法加载新内容 · 无信号」+「↻ 刷新」按钮（每次刷新失败计数）；日期行「时间未同步」。第一人称手机屏幕贴图同步加裂纹与「无信号」（`viewmodel.setPhoneViewCracked`）。

### 不变 / 回归
- 前厅完成标记 `br_foyer_done` 仍在离开前厅时写入；设置「启用前厅」逻辑未改。
- 未经前厅直接开局的 Level 0：无 `prologue`，`hudUnlocks` 缺省全开，开局物资（手电/绷带/杏仁水/随机）照常，开局爬起镜头照常（实测）。

### 验证（M4）
- `npx tsc -p tsconfig.app.json --noEmit`、`npm run build` 通过。无头 Playwright（chromium headless + swiftshader，1280×720，`dist` + 静态服务端口 5200）脚本 `reports/prologue-m4/m4_flow.py`：前厅开局 → 脚本写入「已带齐物品、第 4 幕两次循环后」状态 → 走进小区深处触发真实碎裂 → RealityBreak 各阶段 → L0 醒来 → HUD 解锁 → 主线任务 → 散落物逐件真实交互拾取 → 碎屏手机/刷新失败 → HUD 全部恢复；另测直接 L0 开局与空格跳过（`skip` 模式）。截图与日志见 `reports/prologue-m4/`。

## 验证（合并）
- `npx tsc -p tsconfig.app.json --noEmit`、`npm run build` 通过。无头 Playwright（chromium headless + swiftshader，1280×720，`dist` + 静态服务端口 5200），真实游戏流程：新游戏进前厅 → 家中 9 个机位 → 楼道声控灯亮/灭（脚步声触发 → `setCorridorLightLevel` 链路实测：起辉闪烁期 level 0.226 → intensityMul 0.068）→ 拿手机 → 安全通道下楼 → 门厅/小区/第六大街/后巷 → 第 4 幕回程异常 → 碎裂 → RealityBreak（起手为最后一帧 3D 画面）→ L0 着陆；另起会话：L0 直接开局 → `devJump` 到 L1、L11。
- 控制台：前厅全流程 error 0 / warning 1（`KHR_parallel_shader_compile extension not supported`，swiftshader 环境）；L0 直接开局与 L1 同为 0 / 1。合并前该流程有 3 条 l900 贴图 404，L0 有约 75 条 GL 纹理格式/采样器不匹配警告（预热修复后消失）。
- 已知（非合并引入）：无头 swiftshader 下从 L0 `devJump(11)` 会 WebGL 上下文丢失（随后约 27 条 `VALIDATE_STATUS false` 与大量 `useProgram` 警告），合并前构建（f46a0e9）复现相同结果。
- 截图与脚本：项目 `reports/merged/`。

## RealityBreak 3D（rb3d）：真 3D 现实破碎过场

用户反馈 2D 截图碎片「不太真实」，改为 Three.js 实时 3D：周围世界碎成碎片 → 黑暗虚空下坠 → 低头看自己 → 坠向黄色迷宫 → 坠入 Level 0。

### 实现
- **抓取周围世界**：回程终点 `requestBreakShot` 的同一任务内，`Renderer3D.captureCubeAtlas(engine)` 在玩家眼睛处用 90° 相机渲染六个方向（直接画到游戏画布左下角方块，用游戏自身的色调映射/曝光/雾/灯），逐面拷入 3×2 图集画布（每面 ≤640 px）；同时记录每面相机的 右/上/前 基向量、地面相对眼高、当前相机朝向与 FOV。挂相机的第一人称网格（手、手电）抓取时临时隐藏，灯光保留（不触发着色器重编译）。距出口还有 ~0.2 s，下一帧照常渲染覆盖。数据经 `core/breakCube.ts`（App 注册抓取函数，过场 `takeBreakCube()` 取走一次）。
- **碎片**（`components/realityBreak3d/breakScene.ts`）：以脚下为圆心的抖动环形网格（地面，内密外疏）+ 半径 13.5 m 的球面带（周围楼栋/路灯/树/夜空），三角剖分；每片是一个三棱柱实例（`InstancedBufferGeometry`，模板 = 正面/背面/三个断面，每片实例属性 = 三个静止角点 + 剥落时刻/距离/厚度/上升系数 + 旋转轴/角速度 + 初速度 + 漂浮目标）。动画全部在顶点着色器里按时间求值，一次绘制。正面按**静止时的视线方向**采样图集，所以起手画面与游戏最后一帧一致，碎片飞走翻滚后仍保持原来那块环境的图案。断面暗、透出微弱黄光；裂缝 = 碎片边缘（屏幕空间宽度，`fwidth`），按距脚下距离由近到远出现，每条边强弱随机。
  - 未用 `InstancedMesh`：每片已占 9 个顶点属性，`instanceMatrix` 再加 4 个会超过 16 个顶点属性上限（swiftshader 实测链接失败）。仍是 GPU 实例化、单次绘制。
- **虚空**：背景纯黑；碎片剥落后在玩家四周 4.5–15 m、上下 −38..6 m 的云团中缓慢翻滚、整体相对上升（玩家下坠更快），让开玩家所在的竖直通道（不穿脸）；冷色补光 + 距离衰减；尘埃粒子（加色混合）冷白 → 迷宫逼近时转黄。
- **身体**：简模（外套躯干/兜帽领口/拉链、牛仔裤腿与鞋、张开的双臂与手），`MeshStandardMaterial` + 顶点着色器布料抖动；下方点光随迷宫逼近变黄变亮。手机（亮屏）与手电从手边飘走、翻滚。
- **黄色迷宫**：Level 0 俯视——随机格墙（`l0_wall.jpg` 墙纸、墙顶浅色）、地毯（`l0_floor.jpg`）、每隔一格一盏荧光灯管、最后显形的天花板层（`l0_ceil.jpg`）；64×64 格（3 m），边缘径向淡入黑暗；InstancedMesh（墙、灯管）。中心略偏向视线前方，最后回到正下方；高度按 `−300·(1−s)^1.6` 急速逼近。
- **时间线**（`TL`）：crack 0–1.9 s → shatter 1.9–4.6（1.45 s 起由近到远剥落，3.2 s 脚下塌空）→ void 4.6–6.2（平视环顾）→ self 6.2–7.8（低头）→ maze 7.8–11.4 → impact 11.4–11.95（荧光黄白淹没 → 撞击闪白 → 黑）→ card（黑场 + 嗡鸣，App 换图）→ in（L0 醒来，眼皮开合）。3D 部分约 12 s。
- **声音**：沿用 `realityBreakAudio`：碎裂 6 次由弱到强（脚下 → 剥落 → 塌空）、失真低鸣随破碎加深后在虚空中减弱、风声分两段加强（起坠 / 迷宫逼近）、8.4 s 起荧光灯嗡鸣渐起，撞击后黑场嗡鸣。
- **跳过 / 降级**：空格/回车/「跳过 ▸」按钮 → 直接黑场。粗指针/小屏：碎片 252（桌面 480）、尘埃减半、迷宫 44×44、关闭抗锯齿、像素比 ≤1；`prefers-reduced-motion`：无震动/闪白，环顾幅度减小，淹没改为暗黄。
- **回退**：无六面抓取（例如非回程触发）或 WebGL 初始化失败 → 原 2D 版（`components/RealityBreak2D.tsx`，未改动）。3D 渲染中途异常 → 直接进入黑场。黑场开始即释放 3D 场景与 WebGL 上下文。
- 过场根节点用 portal 挂到 `body`（盖住 body 级的准星）。`data-rb-mode="3d"`、`data-rb-shards`；性能统计 `window.__rbStats`（碎片数、迷宫实例数、每帧渲染提交耗时）。
- 流程逻辑不变：`onStageChange` out → loading → in、物品散落、HUD 解锁、主线任务均沿用 M4。

## 打磨轮（2026-10-23，提交 fe3abcb → 本轮末）

1. **家具审查**（fe3abcb）：陷墙/悬空摆件逐件修正，餐桌与盆栽让出玄关→客厅通道；QA 包围盒采集与碰撞探针（`reports/prologue-polish/audit.js`）。
2. **街上路人改用项目 NPC 系统**：`world/foyerStreetLayout.ts` `FOYER_PEDS`（7 个：5 个沿人行道往返、2 个在公交站/店门口驻足看手机），`NpcDef.ambient/route/routeSpeed`，`engine/npc.ts` 新增路线分支（往返、端点驻足）。环境路人不可交谈、不进人物名册与地图点、不受挥击声望影响；第 4 幕回程异常（含读档到第 4 幕）由 `engine/foyerStreet.ts` 移除。旧简模行人（`renderer/foyerStreet.ts buildPeds`）删除。
3. **出门卡顿**：根因是防盗门门洞格 (5,14) 不属于任何房间，穿门一瞬被判为「室外」→ 点光池盏数变化 → 全场景着色器重编译。改为 `foyerHomeAt()`（家 + 门洞格）；家与街区只绘制玩家所在一边；加载画面期间 `Renderer3D.foyerWarm()` 预热：等街景路人模型建好 → 镜头临时放到楼下门厅、小区各完整更新+绘制一帧再 `compile` → 预上传街区与人物贴图 → 放回玩家；预热完成前保持加载画面。家中不绘制街景路人。
4. **坐下**：复用项目座椅系统（`engine/seating.ts`，`content/furnitureSeats.ts` 增加 `foyerprop` 分支 → `world/foyerLayout.ts foyerSeats()`）：电脑椅、沙发（三个座位）、扶手椅、餐椅、吧凳、床边/床尾、马桶。电脑椅不设碰撞，放一个无碰撞交互代理（`data.foyer='seat'`）。
5. **电脑论坛重做**（`components/ForumPage.tsx`，内容 `content/foyerForum.ts`）：社区论坛版式，虚构品牌「边界线 borderline」（版块 b/、用户 u/，自绘标志与线性图标，不用真实网站名称/标志）：顶栏 + 左侧导航 + 版块横幅 + 帖子卡片（投票列/版块·发帖人·时间/标题/正文配图/评论·分享·保存）+ 帖子详情嵌套评论树（缩进线折叠）+ 右侧版块简介与版规，深浅色切换。地址栏 `borderline-forum.example/b/legends`，手机笔记品牌名统一为「边界线」。
6. **随身物品**：像素图标（`scripts/gen-item-icons.py`：手机/瓶装水/能量棒/你的背包）、表面像素贴图（`scripts/gen-foyer-item-textures.py` → `public/textures/foyer/items/`）、精细模型（`renderer/foyerItemModels.ts`，家中走前厅 PBR + 烘焙，L0 地面走 Lambert）。素材登记见 `public/textures/foyer/FOYER-ASSET-SOURCES.md`「打磨轮新增」。四个新图标须登记在 `components/HUD.tsx` `PIXEL_ICON` 表里才会显示（QA 时发现漏登记、界面仍是手绘线稿，已补）。

### 验证（打磨轮）
- `npx tsc -b`、`NODE_OPTIONS=--max-old-space-size=3072 npx vite build` 通过。
- 无头 chromium（headless + swiftshader，1280×720，`dist` + `python3 -m http.server 5231`），**网址参数 `?cpu=1`**（CPU 蒙皮；无头软件渲染绘制 GPU 蒙皮人物会崩）。脚本 `reports/prologue-polish/pq.py`（模式 flow / sit / sitprobe / items / top / perf / audit）。
- 前厅流程（flow）：开局 → 物品近景 → 电脑新闻 → 论坛首页/帖子（深浅色）→ 拾取手机/背包/手电/水/能量棒 → 出门 → 楼道 → 安全通道下楼 → 门厅/小区/第六大街 → 路人行走 → 第 4 幕：控制台 **error 0 / warning 1**（`KHR_parallel_shader_compile` swiftshader 提示）。路人 7 个，往返者在走、驻足者原地；第 4 幕后环境路人 0、模型 0。
- 出门性能（perf，swiftshader 下帧时间只作相对比较）：

  | 段落 | 基线 8c64644 新程序数 / 最长帧 | 本轮 新程序数 / 最长帧 |
  |---|---|---|
  | A 玄关 → 防盗门 → 楼道 | 42 / 43624 ms | **0** / 2723 ms |
  | B 安全通道下楼（黑场加载） | 0 / 5345 ms | 12 / 18507 ms |
  | C 门厅 → 小区 | 0 / 4088 ms | 0 / 1568 ms |
  | D 转向街道 | 0 / 884 ms | 0 / 894 ms |

  出门瞬间不再有新编译；剩余 12 个程序在下楼黑场（画面全黑的加载段）内编译。加载画面预热本身约 0.6 s、50 个程序、112 张贴图。
- 坐下（sitprobe）：沙发/电脑椅/马桶 sitting-down → seated（眼高 1.28/1.27/1.20 m）→ 交互起身 → 站回可通行点；其余座位能出现「坐下」并进入坐姿。
- 俯视图：`__topdown` 不再把 `scene.fog` 换成 null（会触发重编译、画面全黑），改为临时把雾推远。
- 已知：无头环境里 Playwright 键盘事件（Esc/Tab）没有让文档/论坛/背包界面关闭或打开（新闻页同样，非本轮引入；M4 测试同样改用 window 派发），论坛用「离开屏幕」按钮关闭验证；真机键盘未验证。
- 已知（非本轮）：背包界面的角色预览（独立 WebGL，未走 `?cpu=1`）在 swiftshader 下着色器验证失败并丢上下文，预览区白屏。

## 尚未完成（后续里程碑）
- M4 已完成（见上）；RealityBreak 已改为 3D（见「RealityBreak 3D」）。真机触屏「跳过」按钮与音效主观听感未在无头环境验证。
