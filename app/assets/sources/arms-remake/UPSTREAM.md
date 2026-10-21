# 手臂（Entité 15-FR「Les Bras」）重制 —— 第 1 阶段：静态建模 · 第 2 阶段：动画 · 第 3 阶段：AI / 机制

> **第 3 阶段（AI、机制、接入游戏）见文末「第 3 阶段：AI / 机制」一章**；第 1、2 阶段各节里「未接入游戏」的说法已被第 3 阶段取代。
> **第 2 阶段（动画 + 建模修正）见「第 2 阶段：动画」一章**；下面第 1 阶段各节里的骨骼数、截面段数、三角面数已被第 2 阶段改写（以第 2 阶段章节为准）。

工作副本：`/workspace/work/arms-wt`（基线 `002514e` = 远端 main 8423ae3 源码）。第 1 阶段**只做模型**，不做动画、不做 AI，**未接入游戏**（旧方块模型 `entitiesMesh.ts` 的 `case 'arms'`、`structures.ts` 的 `ceilvent`、`special.ts` / `infiniteL1.ts` 均未改动）。多人模式、联机协议、存档格式未触碰。

## 设定依据
- FR wiki <https://fr-backrooms-wiki.wikidot.com/entite-15-fr>：又长又扭曲、腐烂的灰色皮肤长臂，末端三根锋利钩爪，爪大到能环住人的胸口；住在通风管里，只在下方黑暗时钻出；被强光照到会缩回去，格栅下留下冒烟的烧焦皮肤碎片。
- 用户附图：天花板下一截方形通风管，管口垂下三条暗色长臂；细长手掌 + 三根弯钩长爪，其中一条扣着柜子边缘。

## 新增文件
| 文件 | 内容 |
|---|---|
| `src/game/renderer/armsMesh.ts` | `buildArmsMesh` / `armsRig`、`buildArmsVent` / `armsVent` / `setGrateOpen`、`buildArmsBurntDebris` / `armsDebris`、`armsBudget`、常量 `ARMS_VENT_DROP` `ARMS_VENT_SIZE` `ARMS_ROOT_IN` `ARMS_SEGMENTS` |
| `proto-arms.html` + `src/proto/armsProto.ts` | 原型预览页（`?mode=under｜side｜hand｜curl｜grate｜burn｜burn-under｜stretch`，`&real=1` 真实材质，`&cpu=1` CPU 蒙皮，`&seed=` `&n=` `&burn=` `&cam=x,y,z&look=x,y,z`） |
| `scripts/verify-arms.mjs` | 无头 Chromium 截图验收（自己起 vite:3377 与 QA 浏览器:9377，结束时全部关闭；所有视图带 `cpu=1`） |
| `reports/arms/*.png` + `verify-result.json` | 截图与每张的预算/就绪记录 |

## 坐标约定
- `buildArmsVent()`：原点 = 天花板底面上的管道中心，+Y 向上。管段露出天花板 `ARMS_VENT_DROP = 0.45m`，向上没入天花板 0.5m。
- `buildArmsMesh(count, seed)`：原点 = 管口中心。用法：`armsVent(vent).anchor.add(buildArmsMesh(3, seed))`，anchor 就在 `y = -ARMS_VENT_DROP`。
- 接入游戏时（第 2/3 阶段）：vent 组放在 ceilvent 瓦片中心、`y = 本瓦片天花板高度`（`structures.ts` 的 `hangingCeil`）。旧 ceilvent 端口在 `CH-0.87`，新管口在 `CH-0.45`；旧 arms 方块模型的 2.55 常量要改成跟随 anchor。

## 结构与预算（实测，见 `reports/arms/verify-result.json`）
| 部件 | 网格 | 绘制 | 三角面 | 骨骼 |
|---|---|---|---|---|
| 3 条臂（单个 SkinnedMesh，皮肤组 + 角质组） | 1 | 2 | 4590（单臂 1530） | 55 |
| 风口：管段（含黑内衬、内顶盖、翻边、法兰、铆钉、天花收口圈） | 1 | 1 | 636 | 0 |
| 风口：百叶格栅（铰链组，8 片百叶 + 框 + 2 个铰链筒） | 1 | 1 | 208 | 0 |
| **风口 + 3 臂合计** | **3** | **4** | **5434** | **55** |
| 烧焦碎片道具（第 3 阶段才出现）：焦痕贴花 + 卷曲焦皮 + 烟 | 3 | 3 | 242 + 28 个点精灵 | 0 |

预算要求：draw call ≤5 ✅（4），三角面 ≤6k（3 臂合计）✅（4590；连风口 5434 也在 6k 内）。

## 几何
- **臂**：Catmull-Rom 中心线（9 个控制点：管内竖直 → 出管口 → 上臂外弓 → 「肘」扭折 → 前臂回收 → 腕），按弧长取 50 环 × 9 段截面；接着同一条管体继续 9 环手掌 + 圆头 + 封口（臂与掌是一条连续扫掠体，不会有腕部断缝）。
  - 半径剖面：管内 7cm → 上臂 6cm → 肘部 6.4cm 骨节 → 前臂 4.4cm → 腕 3cm（腕最细）。
  - 每个关节一个**偏向一侧的骨节凸起**（高斯，0.8–1.8cm）；三股沿臂**螺旋扭转的筋索**（上臂弱、前臂强，半径 +7%～22%）；10 个随机肿块；截面 1:0.86 微扁。
  - 臂根在管内 `y=+0.35` 处收成封口，从管口仰看不会看到空心。
  - 尺寸：管口 → 爪尖沿体长约 2.1–2.3m（seed 3 的三条臂：2.27 / 2.23 / 2.14m），垂直下垂约 1.75m。
- **手**：细长扁掌 30cm（宽度 7→14cm，厚约 5cm，背面 3 道掌骨脊、腕骨隆起），三根爪从掌末长出：中爪 ×1.08、两侧 ×0.92–0.98，三节长 15.5/13.5/11.5cm（合计约 0.4m）；基部半径 2.5cm + 指节凸起，向尖端收成 1mm；截面侧扁、钩内侧起脊。静止姿态每节向「下」弯 10°/38°/64°（±5°），先向外伸再向下钩。
- **风口**：0.6×0.6m 铁皮方管（4 面 1.2cm 厚外壁）+ 贴内壁的近黑内衬 + 管内 0.12m 处的黑色内顶盖（仰视管口是一片漆黑）+ 管口外扩翻边 + 中段接缝法兰 + 铆钉 + 贴天花板的方形收口圈。格栅：框 + 8 片 42° 百叶 + 2 个铰链筒，铰链在管口 −Z 边，`setGrateOpen(t)` 绕铰链转 `t × 95°`（0 = 与管口平齐，1 = 向下垂挂）。
- **烧焦碎片**：0.8m 焦痕贴花（透明、polygonOffset）+ 7–10 片按两个方向卷曲的焦皮（顶点色：焦黑 / 灰白残皮 / 红热边，emissive 只作用在红色顶点）+ 28 个点精灵烟雾（上升、扩散、淡出）。

## 材质与贴图（全部运行时 Canvas，模块级共享；Node 下无 document 时退化为纯顶点色）
- 皮肤图集 256×1024（U = 截面一周、V = 臂根 → 腕 0.84 → 掌末 1）：灰白腐皮底色 + 低频斑驳；青灰/紫褐/黄褐腐败暗斑；成簇的**拉伸纹**（沿臂长的浅色波纹 + 暗边）；关节处横向褶皱；毛孔暗点；青黑静脉；9 处**皮肤撕裂**（暗红褐内里 + 粉褐边 + 翻起的浅色皮缘）；管内一段的黑色与向下流淌的污痕；手掌段的骨脊与掌末压暗。
- **靠近管口一段发黑**：shader 用蒙皮后的高度 `vArmsY`（网格原点 = 管口）做 `smoothstep(-0.42, 0.04)` 压暗，所以伸长后黑段仍然跟着管口，不会跟着贴图被拉到下面去（stretch 截图可见）。
- **烧焦参数**：`armsRig(g).setBurn(a, 0..1)`，每条臂独立（顶点属性 `armId` + `vec3 uArmsBurn`）。128×512 烧焦遮罩，阈值 `1 − 1.08·burn`：超过阈值的区域变成焦黑，阈值边缘一圈红热（emissive），整体再熏黑一些。每次 `buildArmsMesh` 新建一个皮肤材质（uniform 各自独立），着色器程序按 cache key 共享。
- 角质钩爪：顶点色 灰皮 → 深褐角质 → 黑尖；真实材质下粗糙度 0.32，有油亮高光。
- 两套材质：`setMaterialMode('classic')` 用 Lambert（与现状一致）；`'realistic'` 用 Standard，皮肤粗糙度 0.48 + bumpMap（湿黏的腐皮油光），爪 0.32，风管金属度 0.35。两套材质都经过 `litMaterial`，所以 L0 环境场和 L1 动态探针的 onBeforeCompile 都会链式保留。

## 骨骼与接口（给第 2 阶段：蛇行 / 伸长 / IK）
每条臂 18 根骨骼，3 条臂共 `1 + 54 = 55` 根；静止时全部是单位旋转，只有平移（局部轴 = 模型轴）：
```
root（管口中心）
 └ arm{a}_s0 … arm{a}_s7      臂骨链 8 节（s0 在管内 y=+0.35，按弧长等分到腕）
    └ arm{a}_hand             腕 / 掌（第 9 节）
       └ arm{a}_claw{j}_0 → _1 → _2   三根爪（j=0/2 两侧，1 居中），每根 3 节
```
- **蒙皮权重 = 弧长上的帽函数**：顶点正好在关节 k 处时 100% 属于骨 k；在关节 k 与 k+1 之间按比例分给两者。手掌全部属于 hand，爪同理。
  - **弯曲**：直接旋转 `arm{a}_s{k}`，弯折会平滑分布在前后两段上（蛇行就是沿链做相位递增的小角度旋转；IK 可以用 CCD/FABRIK 解 s1…s7 + hand）。
  - **伸长**：`setStretch(a, k)` 把 s1…s7 与 hand 的**局部平移乘以同一个 k**（`restOffsets` 是静止平移）。各关节沿静止方向等比外移，帽函数插值让管体平滑拉长、不会断开；手掌和爪不缩放。`setReach(a, 米)` 按 `k = (米 − handLen + inDuct) / tubeLen` 反算（seed 3：管长 1.83m、管内 0.33m、手长 0.77m）。实测 `setReach(0, 5)` → k≈2.49（seed 3），管口 → 爪尖约 5m（stretch 截图）。伸长时截面不变细、贴图沿 V 拉长（腐皮拉伸纹正好贴合设定）；如果要变细，第 2 阶段可以在 shader 里按 stretch 缩半径，或给 s 骨加 XZ 缩放并在子骨上补偿。
  - 动画里也可以只拉长部分段（单独改某几根骨的 position）实现「从管口一节节探出」。
- `setClawCurl(a, c)`：`c = 0` 静止弯钩，`+1` 收拢扣住（三节各 +22°/30°/34°），`-1` 张开（−16°/24°/28°）；绕每根爪自身的铰链轴（`clawAxis[j]` = 第一节方向 × 钩弯方向）旋转。
- 句柄 `armsRig(group)` 还导出 `arms[a].segs / hand / claws / clawAxis / restOffsets / reach0 / inDuct / tubeLen / handLen` 和 `mesh / root`。
- 风口句柄 `armsVent(vent)`：`anchor`（管口）、`hinge`（格栅铰链组）、`open`；`setGrateOpen(vent, 0..1)`。
- 碎片句柄 `armsDebris(g)`：`update(dt)`（推进烟雾）、`setSmoke(0..1)`、`setEmber(0..1)`。

## 截图（`reports/arms/`，全部用 read_file 逐张检查过）
| 文件 | 内容 |
|---|---|
| `under.png` | **仰视风口垂下 3 条臂（参照附图构图）**：一条伸长 1.28 倍、转腕，三爪钩过铁皮柜前缘，另外两条自然垂下、爪微张 |
| `under-real.png` | 同构图，真实材质 |
| `under-n1.png` | 单臂风口（seed 5） |
| `side.png` | 单臂全身侧视（正交）+ 0.5m 刻度标尺（从管口向下计）+ 1.75m 参照人形 |
| `stretch.png` | `setReach(0, 5)`：管口 → 爪尖约 5m |
| `hand.png` / `hand-real.png` | 三爪手特写（10cm 标尺与爪在同一深度） |
| `hand-side.png` | 从掌侧看手掌与掌骨脊（此视角下标尺有透视缩短，不能用来量尺寸） |
| `curl.png` | 爪张开 / 静止 / 收拢对比 |
| `grate.png` | 格栅关 / 开对比（管内漆黑可见） |
| `burn.png` / `burn-real.png` | 烧焦 0.75：焦黑斑 + 红热边，地面上是烧焦碎片和烟 |
| `burn-under.png` | 附图构图 + 烧焦 0.6 + 碎片 |

运行：`node scripts/verify-arms.mjs [视图名...]`（不带参数跑全部 13 张；单次运行接近 2 分钟，可以分批，结果会合并进 json）。

## 已知不足
- 臂是一条平滑扫掠管：骨节、筋索、肿块都靠截面调制做出来，9 段截面在近景下能看出轮廓多边形；爪 6 段截面，近景时尖端有棱面。
- 爪根直接从掌末「插出」，指节与掌皮之间没有过渡皮褶，近景能看出是两块几何拼接（颜色已对齐）。
- 伸长时截面不变细，贴图沿 V 等比拉长，拉到 2.5 倍时撕裂、暗斑也一起被拉长。
- 帽函数权重弯曲柔顺但会有 LBS 体积损失，大于 90° 的急弯会塌腰（第 2 阶段如需急弯，可以在弯处加骨或改用双四元数）。
- 静止姿态的臂形由 seed 决定，三条臂在管内按 120° 均布；管内挤在一起的部分有轻微互相穿插（藏在漆黑管内，看不到）。
- 格栅关闭时如果臂已经垂下会穿过百叶：开合与伸出的时序归第 3 阶段处理（先 `setGrateOpen(1)` 再伸出）。
- 烧焦是整条臂按遮罩阈值烧，没有「哪里被光照到烧哪里」的局部性；第 3 阶段可以把 `uArmsBurn` 换成按光锥计算的局部遮罩。
- 烧焦碎片的烟是 28 个点精灵，`update(dt)` 已经写好但本阶段没有接入任何帧循环。
- `under*` 构图里柜子按爪的位置摆放，扣边的姿势是原型页里手摆的，不是 IK。
- 只在无头 SwiftShader + CPU 蒙皮下验证；真机 GPU 蒙皮路径没有测（`cpu=0` 时就是标准 SkinnedMesh）。


---

# 第 2 阶段：动画（+ 少量建模修正）

仍然**未接入游戏**（`entitiesMesh.ts` / `structures.ts` / `special.ts` / `infiniteL1.ts` 未动；多人、联机协议、存档格式未触碰）。AI 与机制留给第 3 阶段，本阶段只交付「姿态量 → 骨骼」的动画层和第 3 阶段要用的接口。

## 改动文件
| 文件 | 内容 |
|---|---|
| `src/game/renderer/armsAnim.ts`（新） | `ArmPose` / `ArmsPose`、`poseArms`（无状态）、`ArmsAnimator`、`armsClipPose`（10 个片段 + `loop` / `attack` 串联）、`armsReplay`、辅助函数（坐标换算、爪尖、抓握点、伸长量、光照胶囊、光锥照射量） |
| `src/game/renderer/armsMesh.ts` | 建模修正：16 节臂骨链（加中间骨）、截面 9→10 段、爪根皮褶、伸长变细（morph）、贴图按长度重新平铺（shader）；`ArmsArm.rest` 静止数据、`setStretchLook` |
| `src/game/renderer/qaCpuSkin.ts` | CPU 蒙皮替身支持 morph 目标（先叠 morph 再做骨骼变换，与 GPU 顺序一致；无 morph 的网格行为不变） |
| `src/proto/armsProto.ts` | 原型页入口：带 `?anim=` 走动画预览，否则走第 1 阶段静态视图 |
| `src/proto/armsStaticProto.ts` | 第 1 阶段静态视图（原 `armsProto.ts` 改名，仅修了 stretch 标注的 k 计算） |
| `src/proto/armsAnimProto.ts`（新） | 动画预览页：`?anim=<片段>&t=<秒>&view=`、循环演示、`window.__render(t)` |
| `scripts/check-arms-anim.ts`（新） + `package.json` 的 `check:arms-anim` | 数值自检（Node，CPU 蒙皮含 morph） |
| `scripts/verify-arms-anim.mjs`（新） | 无头截图 / GIF 帧（不起 vite：esbuild 打 IIFE，`file://` 打开；自起自关浏览器，端口 9378） |
| `reports/arms/anim-*.png`、`anim-attack.gif`、`check-anim.json`、`verify-anim-result.json` | 截图、GIF 与自检结果；`hand-real.png` `stretch.png` `under.png` `hand.png` 已按修正后的模型重拍 |

## 建模修正
- **爪根皮褶**：每根爪根部套一圈肉质指节套（6 环 × 8 段，皮肤材质组）：掌内两环属于 hand，中间两环按 0.4 / 0.75 混到爪第 1 节，唇口两环（外翻唇 + 收进爪内的一环）属于爪第 1 节——爪子像从掌末的皮肉里长出来，爪弯曲时皮褶跟着走、和掌之间不撕裂。UV 取掌段两道骨脊之间的一窄条，避开浅色条纹。
- **伸长变细**：每条臂一个 morph 目标（位移 = 指向该环中心，腕部 s>0.86 渐隐，手掌不变细），`setStretchLook(a, k)` 设影响 = 1 − max(0.6, 1/√k)。自检实测 k=2.5 时前臂半径比 0.632（= 1/√2.5）。GPU 是 three 标准的 morph+蒙皮，CPU 替身同样先 morph 再蒙皮。
- **贴图不被拉长**：皮肤图集的臂段做成以 `ARM_TILE = 0.76` 为周期可无缝平铺（V<0.08 的一段与 V+0.76 处交叉淡化），原来贴图里的「管口黑带 + 污痕」改由 shader 的 `vArmsY` 完成（多加了一段 −0.85…−0.35m 的轻微熏黑）。shader 以腕为锚点按 `uArmsStretch` 重新平铺（`textureGrad` 用未取模坐标求导，取模接缝没有 mip 细线）。k=1 时与原贴图逐像素一致。烧焦遮罩与 bumpMap 仍按原 UV（会随伸长拉长，见不足）。
- **急弯不塌腰**：每条臂从 8 节改为 **16 节**（s0,m0,s1,m1,…,s7,m7，m 是每段中点的中间骨），权重是 16 节上的帽函数；动画按路径摆放所有关节，单个关节的转角减半，LBS 的截面收缩（≈cos(θ/2)）明显变小。手腕扭转也分摊到前臂最后 7 节（逐节递增），不会糖纸扭曲。
- **截面 9 → 10 段**，臂环 50 → 56。三角面：风口 + 3 臂 **6880 ≤ 7000**（臂 6036 + 风口 844），绘制仍 4 次，骨骼 79。
- 骨骼名：`arm{a}_s0..s7` 不变，新增 `arm{a}_m0..m7`；`ArmsArm.segs` 仍是 8 根主骨（第 1 阶段的静态摆姿代码照常工作），新增 `chain`（16 节）与 `mids`；`restOffsets` 现在是 chain[1..15] + hand 共 16 个。

## 动画核心：沿路径滑动的样条骨架
- 每条臂的中心线是一条路径 F(x)，x = 从管口量起的路径坐标（m）：
  - x<0 管内：从该臂的管内位置竖直向上 1.3m（高出天花板 0.85m），再以 0.15m 半径弯成水平——**天花板以上的部分在房间里永远看不见**，所以整条 2m 多的臂可以完整地缩进去；
  - x≥0 管外：`S(x) = lerp(悬垂/探寻形 H, 伸向目标形 R, reach) + 抖动场 J(x,t)`。H 由 yaw/lean/bow 与以**路径坐标为相位**的正弦蛇行积分得到（相位不变 = 身体沿同一条路径滑动，真正的「跟随领头」蛇行）；R 是管口（切向 −Y）→ 腕目标（切向 = 指向目标）的 Hermite 曲线 + 两端为 0 的 S 弯（蓄力时加大）。
- 腕的位置 `x_w = lerp(−1.75, Lb, out)`，16 节臂骨按弧长等距排在腕之前：`x_i = x_w − (16−i)·(tubeLen/16)·k`，`k = max(1, Lb/自然管外长)` 同时驱动变细与贴图平铺。所以 `out` 从 0 到 1 时**爪尖先出管口**，其余部分沿同一路径滑出；目标近时多出来的臂留在管内，不会被压缩。
- **IK（解析样条 IK，最长 5m）**：reach=1、out=1 时腕精确落在 W = 目标 − D·|效应点偏移|，手按「效应点方向 → D」对齐（摆动 + 绕 D 扭转，扭转角在连续调用时解卷绕），所以 抓握点（`tipAim=0`）/ 中爪尖（`tipAim=1`，按当前收拢量做爪 FK）精确落在目标上。自检 20 组目标最大误差 **0.5mm**；目标在 7.5m 外时管口→爪尖沿体长被限制在 **4.98m**（k=2.89）。
- 朝向：每节骨骼 = 当前路径在该处的**平行移动标架** × 静止标架⁻¹（两者都从管口处 T=−Y、N=+Z 起算），整条臂不会扭成麻花。
- 安全规则（都写在 `poseArms` 里，片段不用操心）：手进入管口 0.55m 内爪自动收拢到 ≥0.85；钩弯方向在竖直进出管时朝管道中心；管外中心线与手都会柔和地避开打开后垂在 −Z 侧的格栅；全部缩回时隐藏网格（CPU 替身接管时改替身的可见性，不会误开 GPU 蒙皮）。

## API 摘要（`armsAnim.ts`）
```ts
interface ArmPose {            // 每条臂一组，可独立驱动
  out, stretch,                // 伸出量 0..1；悬垂形长度倍数
  yaw, lean, bow,              // 悬垂/探寻形：水平朝向、外探 0..1、末端上翘/下垂
  wave, waveLen, phase,        // 蛇行角幅、波长(m)、相位(rad)
  reach, tx, ty, tz,           // 伸向目标权重 + 目标点（臂空间，原点 = 管口中心）
  pull, tipAim, hookRoll,      // 蓄力回缩(负=过冲)、效应点 0 抓握点/1 中爪尖、手绕目标方向滚转(π/2 = 横抱)
  curl, clawTwitch,            // 爪 -1 张开…1 收拢、爪抽动
  wristPitch, wristRoll,       // 腕部俯仰/滚转（自然姿态上叠加）
  twitch, spasm, shake, burn   // 前臂抽搐、痉挛扭动、甩动+撞击抖动、烧焦
}
interface ArmsPose { grate: number /*0..1，允许 −0.06 回弹*/; rattle: number /*格栅震动 0..1*/; arms: ArmPose[] }

poseArms(rig, pose, t, vent?)          // 无状态；vent 默认沿父链自动找（臂组挂在 armsVent(v).anchor 上时）
new ArmsAnimator(count, init?)         // .set({grate, rattle, arms:[{…}, undefined, {…}]}) / .setArm(a, {…}) / .snap() / .update(dt) → .pose
armsClipPose(clip, t, opts)            // clip: lurk|emerge|search|lunge|grab|drag|swallow|flinch|burnRetreat|spit|loop|attack
   opts: { count, lead, target /*玩家胸口，臂空间*/, dragTo, spitHold, spitPush }
ARMS_CLIPS[clip] = { dur, loop, label, events }   // events：给第 3 阶段同步音效/机制的时刻（如 lunge.strike=1.0, grab.closed=0.3, flinch.release=0.15, swallow.slam=1.45, burnRetreat.debris=1.5, spit.release=1.22）
armsReplay(clip, t, opts, dt=1/60)     // 确定性回放（动画器从 0 起固定步长）
armsWorldToLocal / armsLocalToWorld(rig, v, out?)
armsClawTip(rig, a, j=1, out?)         // 爪尖世界坐标
armsGripPoint(rig, a, out?)            // 抓握点世界坐标：第 3 阶段把玩家胸口挂在这里
armsGripFrame(rig, a, dir, hook)       // 抓握点处掌方向 / 钩弯方向（给被抓玩家定朝向）
armsExtension(rig, a)                  // { k, outLen, tipArc, worldDist, visible }
armsState(rig, a)                      // { k, wristX, outLen, tipArc, visible, jointX[] }
armsCapsules(rig, out?)                // 光照/命中几何：露出管口的每节一个胶囊（含变细后的半径）+ 手掌 1 个 + 每根爪 1 个（世界坐标）
armsLightExposure(rig, origin, dir, halfAngle, range, caps?)  // 每臂 0..1 照射比例（不做遮挡，遮挡由第 3 阶段补射线）
ARMS_MAX_REACH = 5, ARMS_HIDE_X = -1.75
```
第 3 阶段典型用法：`anim.set(armsClipPose(clip, 片段内时间, { target: armsWorldToLocal(rig, 玩家胸口) }))` → 每帧 `anim.update(dt); poseArms(rig, anim.pose, now)`；被抓时每帧把玩家放到 `armsGripPoint`；手电照射用 `armsLightExposure` 判定是否触发 `burnRetreat`。格栅 `rattle` 可直接当刮擦声音量。

## 片段（`ARMS_CLIPS`）
| 片段 | 时长 | 要点 |
|---|---|---|
| lurk（循环） | 4.6s | 全部缩在天花板以上的风管段，格栅关闭；`rattle` 按 2.3s 周期的刮擦阵发起伏（格栅绕铰链 ±2° 轻颤 + 2mm 抖动） |
| emerge | 5.4s | 刮擦（0–1s）→ 格栅 0.8–1.35s 推开 → 1.1s 起主攻臂沿蛇形路径滑出（爪收拢、**爪尖先出**，约 1.95s 露出管口），另外两条错开 0.45s、伸出 0.82 / 0.68；出来后形状渐变成探寻形。**先开格栅再伸出**由自检保证（格栅 <0.85 时没有任何顶点伸出管口） |
| search（循环） | 6s | 悬空左右摆（±0.5rad，5.2s 周期）、蛇行波沿臂传播、腕部俯仰、爪一开一合（1.9s 周期） |
| lunge | 2.2s | 0–0.4s 转入瞄准；0.05–0.6s 蓄力回缩（腕沿弦线收回 41% 并抬起，S 弯加大），0.3–1.05s 前臂抽搐，爪慢慢张开；0.98–1.24s 扑出（含 7% 过冲），中爪尖落在胸口前表面 |
| grab | 1.6s | 效应点从爪尖换到抓握点，爪 0.05–0.3s 收拢扣住，手横过来环抱（hookRoll π/2），之后开始拽 |
| drag | 3.6s | 抓握点沿弧线（先提起再拖回）移到风口正下方，臂随之缩短（k 1.4 → 1），甩动 + 每 ~0.6s 一次撞击抖动 |
| swallow | 2.6s | 抓握点升到管口，0.3–1.3s 整条臂缩回（反向沿路径滑入），其余臂同时缩回；1.45s 格栅猛地关上（1.58s 合上 + 回弹 + 震动） |
| flinch | 1.8s | 0–0.1s 猛地回缩（目标向管口方向退 0.5m）+ 短促痉挛 + 腕部后仰，爪 0.04–0.25s 张开松手（`events.release=0.15`），之后在原处余悸地抽动 |
| burnRetreat | 3.0s | 全部臂痉挛扭动、`burn` 0→0.85（陪衬臂 0.65），0.95s 起逐条快速缩回（缩回前痉挛收住、爪收拢，免得撞格栅），1.95–2.08s 格栅猛关；原型里 1.5s 起格栅下出现冒烟焦皮 |
| spit | 3.2s | （另一个风口）格栅 0.12–0.35s 快速打开，主攻臂抓着玩家沿伸向目标的路径快速探出，0.95–1.25s 向前下方一推，1.18–1.32s 松爪（`events.release=1.22`），1.6–2.4s 缩回，2.5s 格栅猛关 |
| loop / attack | 48.8s / 14s | 全片段循环演示 / emerge→search→lunge→grab→drag（GIF 用） |

## 原型页
`proto-arms.html?anim=<片段|loop|attack>&t=<秒>&view=<side|player|under|close|floor|vent2|wide>`（`&cpu=1` CPU 蒙皮，`&real=1` 真实材质，`&hud=min` 只显示片段名，`&seed=`）。不带 `t` 时实时循环播放；`window.__render(t)` 确定性重绘：动画器从 0 起以 1/60s 固定步长回放到 t，道具（简易人形，胸口 = 抓握挂载点）、焦皮烟雾也只由 t 决定，同一个 t 截出来的帧完全一样。场景：主风口（玩家在 +Z）+ 远处第二个风口（spit 用，+Z 朝房间中央）、L1 混凝土房间、暗环境光 + 冷色应急灯；burnRetreat 时玩家手电变成强光并显示光柱。第 1 阶段的 `?mode=` 视图照旧可用。

## 验收
- `npm run check:arms-anim`（约 2s）：✓ 全部通过（结果写入 `reports/arms/check-anim.json`）。
  - 预算 3 网格 / 4 绘制 / **6880 三角面** / 79 骨骼。
  - 10 个片段 + 62s 循环，按 1/60s 回放、每 0.1s CPU 蒙皮全部顶点：无 NaN；格栅未开时无顶点伸出管口；无顶点穿进格栅板；无顶点穿过可见管壁（管口到天花板之间）；无顶点穿地；露出管口或在管口上方 0.6m 可见管段内的骨骼，单帧最大旋转 0.08–0.49 rad（阈值 0.5；藏在天花板以上风管段里的骨骼不计）。
  - IK 最大误差 0.5mm；5m 上限；k=2.5 半径比 0.632；光照胶囊 52 个，朝向手臂的光锥照射 0.48–0.64、背向 0。
- `node scripts/verify-arms-anim.mjs [视图…]`：截图（全部 `cpu=1`）；`--frames 起 止` 导出 GIF 帧（attack 序列 10fps、560×400）。GIF 用 ffmpeg 两遍调色板合成：`reports/arms/anim-attack.gif`（14.1s，1.27MB）。
- `tsc -p tsconfig.app.json` 通过；新文件 eslint 无报错。

| 截图 | 内容 |
|---|---|
| `anim-lurk.png` | 潜伏：格栅关闭，手臂不可见 |
| `anim-emerge-a.png` / `anim-emerge-b.png` | 出动：格栅已开、爪尖先出（仰视）/ 主攻臂蛇行滑出、第二条臂爪尖刚出管口（侧视） |
| `anim-search.png` | 探寻（玩家肩后视角） |
| `anim-lunge-windup.png` / `anim-lunge-strike.png` | 蓄力回缩（S 弯、爪张开）/ 扑出（伸长变细，中爪尖到胸口） |
| `anim-grab.png` / `anim-grab-side.png` | 抓住（近景 / 侧视，人形道具） |
| `anim-drag.png` | 拖回风口（人形挂在抓握点上，脚拖在后面） |
| `anim-swallow.png` / `anim-swallow-slam.png` | 缩回管口（道具被吞入）/ 格栅猛地关上 |
| `anim-flinch.png` | 受击：回缩、爪张开松手，玩家踉跄后退 |
| `anim-burnRetreat.png` / `anim-burnRetreat-debris.png` | 强光下痉挛烧焦（焦黑斑 + 红热边 + 光柱）/ 缩回后格栅下冒烟的焦皮 |
| `anim-spit.png` / `anim-spit-push.png` | 另一个风口：一推之后玩家落地 / 推出瞬间 |
| `hand-real.png` `hand.png` `stretch.png` `under.png` | 修正后重拍：爪根皮褶、伸长变细 + 贴图不拉长、16 节臂骨 |

## 第 2 阶段已知不足
- **GPU 蒙皮路径没有实机验证**：无头 SwiftShader 下 GPU 蒙皮仍会让 GPU 进程崩溃（试过一次 `ARMS_GPU=1`，上下文丢失），所以截图和自检都走 CPU 替身。GPU 路径用的是 three 标准的 morph + 蒙皮，自定义 shader 只改片元（贴图平铺、烧焦）和一行 `vArmsY = transformed.y`，CPU 替身用的是同一个材质；真机上需要看一眼。
- 抓人时爪是「扣进胸口」，并没有真正绕过躯干两侧合抱（爪长 0.43m、两侧爪只外张 ±20°，环不住 0.46m 宽的人形）；第 3 阶段如果要更可信，可以给 grab 加专门的爪形（两侧爪外张 + 更大收拢角）。
- 管内路径是固定的「竖直 1.3m → 弯成水平」，高出天花板 0.85m：游戏里天花板以上本来就不可见，但如果某处天花板很薄、上方有可见几何，需要第 3 阶段把这段路径改到真实风管的方向（`ductPoint`）。
- 格栅避让只针对本风口自己的格栅；墙、柜子、其它风口、玩家身体都不做碰撞（第 3 阶段可以用 `armsCapsules` 做简单推开或限制目标点）。
- 序列切换时由动画器平滑（时间常数 0.04–0.3s），片段之间的目标姿态不保证首尾相接，快速切换时会看到 0.2–0.3s 的「追赶」。
- 扭转解卷绕依赖相邻帧的调用（|Δt|<0.25s）；单次调用（如原型页 `__render`）取主值，所以同一时刻「从头回放」与「连续播放」在极少数手腕扭转接近 180° 的帧上可能差一个整圈的方向（只影响手的滚转，不影响位置）。
- 烧焦遮罩、真实材质的 bumpMap 仍按原 UV，伸长时会随之拉长；烧焦仍是整臂按遮罩烧，没有按光锥的局部性。
- 原型里的人形道具是简易剪影：被吞时直接缩小消失，吐出后的下落是解析抛物线 + 躺倒插值，不是物理。
- spit 在原型里由第二个风口播放；循环演示里道具在 swallow 之后消失、spit 之后躺在地上，下一次 emerge 时插值站起来（演示用）。


---

# 第 3 阶段：AI / 机制（接入游戏）

本阶段把第 1/2 阶段的模型与动画接入 Level 1，并用新的状态机替换旧的「停电时 5m 内伸出、2.2m 内每 1.6s 抓一下」逻辑。**多人模式、联机协议、存档格式均未改动**：AI 状态只存在于内存（实体上的 `e.ar`、引擎上的 `eng.armsRun`）。`effects` 表登记了 `armsRun`（新一局 / 换层时重置，没有存档键）。自检会逐字段对比基线 `002514e` 的存档快照。

## 设定（ZAN 确认版）
住在 L1 室内通风管里的长臂。只有在玩家所在处黑暗（停电，或该区段没有有效灯光），并且玩家发出足够噪音时才会出动。出动流程：管道里先传来金属刮擦声，并沿管道向风口移动 → 从离玩家最近的连通风口轻轻推开格栅钻出 → 探寻 → 约 0.8s 蓄力后扑抓 → 抓住后拖向风口，玩家可以挣扎挣脱。被拖进风口**不会死**：玩家会重伤、黑屏，听到管道里的撞击声远去，然后从 15–40m 外的另一个风口被吐出来，掉在风口下方。
它只能用光赶走。在被抓之前，强光（手电或头灯光锥、荧光棒、灯具）累计照射 0.6s，它就会痉挛哀嚎、烧焦缩回，风口下留下冒烟的焦皮。武器命中会扣血并让它吃痛；被抓时命中会让它松手。血量清零也不会死，只是被赶走 90–120s，之后回满血。一旦来电，它立即缩回。

## 文件与接入点
| 文件 | 改动 |
|---|---|
| `src/game/engine/armsAI.ts`（新） | 全部数值 `ARMS`、状态机 `updateArmsEntity`、噪音 `armsHear` / `armsGunshot`、光照 `armsLightRate`、被抓 / 挣扎 / 黑屏 / 坠落 `armsControlsPlayer` / `armsPlayerTick` / `armsOverlay`、受击 / 驱逐 `armsHittable` / `armsKillGuard` / `armsRevive`、风口 / 管道规划 `armsDuctPlan`、吐出落点 `armsLandingOk` / `armsTempSpitFor` |
| `engine/entityAI.ts` | 删掉旧 arms 分支；循环前部分派 `updateArmsEntity`；`noiseEvent` 调用 `armsHear`；`dead` 的兜底调用 `armsRevive` |
| `engine/combat.ts` | `canHit` 加 `armsHittable`；`killCheck` 加 `armsKillGuard`（不死、不计击杀）；开枪调用 `armsGunshot`；`hurtPlayer` 在管道里 / 被吐出期间屏蔽外界伤害（`armsPlayerShielded`） |
| `engine/movement.ts` | 被抓时由 `armsControlsPlayer(eng, dt)` 接管玩家（与 duller / clump 同一个入口） |
| `engine.ts` / `engine/effects.ts` | `armsRun` 字段 + 每帧 `armsPlayerTick`；effects 表登记 |
| `entities/special.ts` / `types.ts` / `spawns.ts` | 手臂定义改为 hp 30、stationary，补全图鉴信息；生成只在 L1 |
| `world/infiniteL1.ts` | 每个 chunk 有 6% 概率生成「风口 + 手臂」（maintenance / garden 变体不生成）；`ceilvent` 带 `data.arms=1`，实体对齐到风口格中心 |
| `renderer/renderer.ts` | `updateArmsMesh`：每个风口一个 `ArmsAnimator`，按 AI 状态取 `armsClipPose` 片段（目标 = 玩家胸口 / 扑击点）；临时风口、焦皮、血迹按 AI 记录补建；挑高处加吊管；`?cpu=1` 时调用 `syncSceneCpuSkins` |
| `renderer/entitiesMesh.ts` / `structures.ts` | 旧方块长臂移除；有手臂的 `ceilvent` 不再画旧管体，没有手臂的改画新风口（管口 = 天花板 − `ARMS_VENT_DROP`，不再写死 2.55） |
| `renderer/armsAnim.ts` / `qaCpuSkin.ts` | `setArmsDuct`（管内路径跟随真实管道规划）；CPU 替身同步 |
| `components/HUD.tsx` | 黑屏遮罩、被抓暗角、挣扎提示与进度条（桌面键位取自自定义绑定，移动端点屏幕任意处）、挣脱提示 |
| `core/audio.ts` | `armsSfx`：scrape / grate / wail / sizzle / slam / thump / grab / spit（程序化合成，按距离衰减、按方位声像） |
| `content/codexScores.ts`、`decorRegistry.ts`、`core/types.ts` | 图鉴分数与类型登记 |
| `scripts/check-arms.ts`（新）+ `package.json` 的 `check:arms` | 机制自检（Node） |
| `scripts/verify-arms-game.mjs`（新） | 游戏内截图（launch / enter / shots / live / close） |

## 状态机（`ArmsMode`）
```
hidden ──(黑暗 + 噪音计≥1 + 9m 内 + 冷却结束 + 是连通风口里离玩家最近的)──▶ stir（刮擦 2.4s，声源从 7m 外沿管道移向风口）
stir ──(玩家仍在 11m 内)──▶ emerge（片段 0.6→3.6s；1.95s 爪尖出管口，此后可被照射 / 命中）──▶ search
search ──(3.6m 内 + 胸口到管口 ≤4.4m + 有视线 + attackCd 结束)──▶ lunge（0.4s 起播；0.85s 锁定扑击点；1.2s 判定，偏差 ≤0.8m 才抓到）
lunge ──命中──▶ grab（0.7s）──▶ drag（3.6s，拖到风口正下方）──▶ swallow（2.6s，1.3s 吞入、黑屏）──▶ duct（4.2s，撞击声远去）──▶ 吐出
lunge ──扑空──▶ search（missCd 1.6s）
吐出：spit 由吐出风口的主人播放（本体临时风口或别的空闲手臂风口），1.22s 松手、抛物线落地 → hidden（冷却 75s）
任意露出状态 ──累计照射≥0.6s──▶ burnRetreat（3s，1.5s 落焦皮）──▶ hidden（冷却 40s）
受击 ──▶ flinch（1.8s，0.15s 松手）──▶ search；血量≤0 ──▶ banished（90–120s，缩在管内打不到）──▶ 回满血 hidden
来电（停电结束）──▶ retract（同一帧开始，缩回片段按 1.6 倍速播放）──▶ hidden（冷却 8s）
search 中玩家离开 11m 超过 2.5s，或探寻超过 12s ──▶ retract（冷却 10s）
挣扎：被抓期间跳跃 / 左右换向 / 触屏点击各计一次，累计 9 次挣脱（每秒衰减 1.2）→ 落到合法地面，5s 内不再扑抓
```
`isStateHidden`（hidden / stir / duct / banished）时实体 `hidden=true`，打不到也照不到。`e.x/e.y` 跟随主攻臂的手，供通用命中判定使用。

## 完整数值表（与 `armsAI.ts` 的 `ARMS` 一一对应）
| 分组 | 键 | 值 | 含义 |
|---|---|---|---|
| 生成 | chunkChance | 0.06 | 每个 L1 chunk 生成风口 + 手臂的概率（maintenance / garden 不生成） |
| | countMin / countMax | 1 / 3 | 每个风口的臂数（按风口世界坐标哈希；逻辑上仍是一个实体） |
| | hp | 30 | 血量（清零 = 被赶走） |
| 风口 / 管道 | ductUp | 1.3 | 管内路径竖直向上 1.3m 再转水平 |
| | ductFlatUp / ductScanR / ductExposeMargin | 0.6 / 4 / 0.8 | 4m 内邻格天花板高出 >0.8m 时改走贴天花板路径（只上 0.6m） |
| | regionR | 48 | 世界距离 ≤48m 的风口视为连通 |
| | ventMaxH / ventHangH | 4.2 / 3.4 | 天花板 >4.2m 时用吊管把风口吊在 3.4m |
| 出动 | senseR / senseDz | 9 / 1.6 | 触发范围：水平 9m、高差 1.6m |
| | noiseMinR / noisePerR | 6 / 0.1 | 半径 <6 的声音不计；计入量 = (半径 − 5) × 0.1 |
| | noiseNeed / noiseDecay | 1.0 / 0.45 | 噪音计阈值 / 每秒衰减 |
| | gunNoiseR | 10 | 巧克力枪开火视为半径 10 的响动（只给手臂听） |
| | glowDarkR | 2.0 | 荧光棒在玩家 2m 内 = 玩家处不算黑暗 |
| 钻出 | stirDur / stirFrom / scrapeEvery | 2.4 / 7 / 0.26 | 刮擦时长、起点距离、刮擦间隔 |
| | emergeFrom / emergeTo / clawsOutT | 0.6 / 3.6 / 1.95 | emerge 片段起止；爪尖出管口的时刻 |
| 扑抓 | lungeR / reachMax | 3.6 / 4.4 | 扑抓水平距离 / 胸口到管口的最大距离 |
| | lungeFrom / lungeLockT / lungeHitT | 0.4 / 0.85 / 1.2 | 起播 / 锁定 / 判定（反应时间 0.8s） |
| | grabR / lungeEnd / missCd | 0.8 / 1.9 / 1.6 | 判定半径 / 片段结束 / 扑空冷却 |
| | searchMax / loseR / loseT | 12 / 11 / 2.5 | 探寻上限 / 丢失距离 / 丢失时长 |
| 抓住 | grabHold / dragDur / chestH | 0.7 / 3.6 / 1.25 | 扣住时长 / 拖拽时长 / 胸口高度 |
| | struggleNeed / struggleDecay / tapGap | 9 / 1.2 / 0.09 | 挣扎次数 / 每秒衰减 / 最小计数间隔 |
| | escapeCd / minHp | 5 / 5 | 挣脱后不扑抓的时长 / 手臂造成的伤害最多把玩家扣到 5 血 |
| 吞入 / 吐出 | swallowDur / swallowInside / swallowDmg / swallowSanity | 2.6 / 1.3 / 30 / 10 | 吞入片段 / 吞入时刻 / 伤害 / 理智 |
| | ductDur / thumpEvery | 4.2 / 0.5 | 管道段时长 / 撞击声间隔 |
| | spitMin / spitMax | 15 / 40 | 吐出风口与原风口的距离 |
| | spitDur / spitRelease / fadeIn | 3.2 / 1.22 / 0.6 | spit 片段 / 松手 / 黑屏淡出 |
| | spitHoldOut / spitHoldDrop / spitPushOut / spitPushDrop | 0.55 / 1.05 / 1.35 / 1.45 | 停顿点、推出点（相对管口，m） |
| | gravity | 9.8 | 吐出后的下落 |
| | dropItemChance | 0.5 | 被拖进风口时，原风口下 50% 掉落一件背包物品（另外必留一摊血迹） |
| | postSpitCd | 75 | 吐完后的冷却 |
| 光 | flashHalf / flashRange / flashFull | 0.5 / 9 / 6 | 手电 / 头灯光锥半角 0.5rad，6m 内满强度，9m 外无效 |
| | glowBurnR / glowRate | 1.4 / 0.8 | 荧光棒 1.4m 内按 0.8 倍速累计 |
| | lampRate | 0.8 | 伸进灯具照亮范围：0.8 倍速 |
| | burnNeed / expoDecay | 0.6 / 0.3 | 累计 0.6s 烧退 / 不照时每秒衰减 |
| | burnDur / debrisT / burnCd | 3.0 / 1.5 / 40 | 烧退片段 / 焦皮出现时刻 / 冷却 |
| 受击 / 驱逐 | flinchDur / flinchRelease / flinchCd | 1.8 / 0.15 / 2.2 | 吃痛 / 松手时刻 / 吃痛后不扑抓 |
| | banishMin / banishMax / banishAnim | 90 / 120 / 2.6 | 被赶走时长 / 缩回动画 |
| 来电 / 放弃 | retractSpeed / retractDur / powerCd / giveUpCd | 1.6 / 1.625 / 8 / 10 | 缩回倍速 / 时长 / 来电冷却 / 放弃冷却 |
| 内存上限 | marksMax / tempMax | 4 / 3 | 焦皮 / 血迹记录上限 / 临时风口上限 |

**吐出风口规则**（`chooseSpit` → `spawnTempVent`，QA 用 `armsTempSpitFor` 走同一套规则）：先在 15–40m 内找空闲的其它手臂风口；没有就在 15–40m 环带里临时生成一个。临时风口的条件：格子可走，层高 2.3–4.6m；离任何实心结构或 `ceilvent` ≥0.6m，离灯 ≥1m；不在 maintenance / garden 段；`canOccupy`；8 个方向中至少有一个推出落点满足 `armsLandingOk`（可走、四周 0.32m 可走、地面高差 ≤0.3m、`canOccupy`、与风口有视线）。

## 验收结果
- `npm run check:arms`：**76/76 通过**（`reports/arms/mechanics-check.txt`）。覆盖：图鉴；生成率（784 个 chunk，实测 5.9%）；ceilvent 对齐与新风口；管道规划；慢走 / 蹲行不触发，奔跑、开枪、物品落地会触发；有灯或有荧光棒时不触发；来电立即缩回；手电 0.63s 烧退并留下焦皮、冷却 40s；背对时不累计；荧光棒也能烧退；受击、吃痛、松手；血量清零被赶走（102s）、不计击杀、回满血；`dead` 兜底；扑抓的反应窗口与闪避；被抓、三种挣扎输入、挣脱落点合法；吞入黑屏不致死（最低 24 血）；管道里外界伤害无效；撞击声；吐出距离 38.2m 和 18.4m（两种来源）；落点合法；血迹；连通风口只出动一个；存档快照与基线一致。
- `npm run check:arms-anim`：通过。改动后的 20 项回归与基线 `reports/arms/regress-base/` 对比，全部通过（见下）。
- `tsc -p tsconfig.app.json --noEmit` 通过；`vite build` 通过；改动或新增文件的 eslint 没有新增错误。
- 改动后的 20 项回归日志在 `reports/arms/regress-after/`。20/20 退出码为 0，其中 13 项输出与基线逐行一致。有差异的 7 项：
  - jerry / rats / shrimp：只有随机数值不同（台词抽取、距离、只数），全部 ✔。
  - clump-integration：只有 `buildMs` 不同（6 路并行，计时变长）。
  - arms-anim：spit 片段的 `minY` 从 0.841 变为 0.946，grab 的 `maxJump` 从 0.079 变为 0.074。原因是第 3 阶段的管道路径与 spit 规则调整，两项仍在阈值内。
- 游戏内截图（`scripts/verify-arms-game.mjs`，`?cpu=1`）：`game-idle` / `game-emerge` / `game-lunge` / `game-drag` / `game-drag-down` / `game-burn` / `game-debris` / `game-spit` / `game-spit-retract`（摆姿）；`game-live-emerge` / `game-live-grab` / `game-live-drag` / `game-live-inside` / `game-live-spat`（真实 AI 全流程，`game-verify-live.json`）。
  - live 阶段实测：奔跑噪音 → stir → emerge → 站着不动被抓（−16 血）→ drag → swallow / duct（黑屏）→ 从 19.2m 外的风口被吐出，落点 `armsLandingOk=true`，HP 84，没有死亡。
  - live 阶段的脚本修正：①live 时不再把「闪烁」加入 `phenOff`。phenOff 会让 ambient 每帧调用 `endBlackout`，停电立刻被结束，手臂永远走不出 stir。②无头 SwiftShader + CPU 蒙皮只有约 1–2fps，引擎每帧 dt 上限是 0.05s，所以 `until` 轮询时额外推进 `ARMS_LIVE_PUMP`（默认 8）个 `engine.step(0.05)`。走的是同一套真实 AI，只是不等渲染。等渲染帧（`frames`）时不推进。

## 第 3 阶段已知不足
- **GPU 蒙皮仍没有真机验证**：所有截图和自检都走 `?cpu=1` 的 CPU 替身（原因见第 2 阶段）。
- live 截图是真实停电、手电关闭时拍的，画面很暗，`game-live-emerge` 里几乎看不见手臂；`game-live-inside` 是全黑屏（这正是预期的黑屏）。live 阶段的作用是验证流程，看清形体请看摆姿截图。
- `game-spit` / `game-spit-retract` 的吐出风口按 `armsTempSpitFor` 选点，离柱子 ≥0.6m。但玩家站位固定在推出方向 3.4m 处，画面左侧被近处的墙 / 柱占去一大块。
- 吐出后的下落是解析抛物线，不是物理；吐出落点只检查地面与视线，不检查落点附近有没有别的实体。
- 管内路径在 L1 的实测范围内（0 个风口需要改走贴天花板路径）不会露出。但如果以后 L1 出现上层楼板或很薄的天花板，需要重新核对 `armsDuctPlan`。
- 爪仍是「扣进胸口」，没有真正绕过躯干合抱（第 2 阶段遗留问题）。
- 手臂与墙、柜子、其它实体之间没有碰撞，只避让自己风口的格栅。
- 烧焦仍是整臂按遮罩阈值烧，没有按光锥做局部烧焦。光照判定只对胶囊做光锥测试，不做遮挡射线。
- 联机：AI 只在本机运行，没有同步到其它客户端（多人协议冻结）。多人局里别的玩家看不到别人被抓的过程。
- 旧的 QA 日志里有一条历史错误 `Boot failed … nearestExit … null 'inf'`，来自上一轮热更新时 HUD 读取空地图；本轮的 live 和 spit 运行没有出现任何页面错误。
