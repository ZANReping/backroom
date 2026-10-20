# Alpha 壁挂、容器液体与 NPC 岗位修正

## 本次修正

- 164 件壁挂物逐件验证真实墙体背托，安装间隙 2 mm；修正留言板、画框、消防柜与空调的位置或朝向。公共门框内衬伸入门洞 12 mm，盖住墙端共面；门洞上方不生成踢脚线。可交互门使用唯一门框，门扇与框保留装配间隙。
- 49 个杯具改为实际内壁和杯底，液面低于杯沿。8 个水槽在原台面/柜体上挖出槽腔，加入槽底、排水口和下沉水面；液体不再与封闭顶面相交。真实模式有低粗糙度、微弱法线起伏、斜角反射与现有灯具高光；没有额外灯光或反射相机。经典模式保留空心几何及透明水面。
- 全部 29 名 NPC 使用明确岗位。4 名固定值守，25 名限定在岗位周围 0.3～0.65 m；选目标检查全段路径，移动避开门口、家具、人物与玩家，近距离交谈时停步。身份、服务、任务与既有存档格式保持原规则。

烘焙重新生成，指纹 **1ddc4c10**，75,985 部件，4096×2752 图集；游戏中的几何指纹与资产匹配。改动限定于 Three.js 游戏及项目说明，联机保持关闭。

## 验证结果

生产构建成功；Alpha 生成/通行 56,365 项、壁挂/门框/容器/岗位 1,201 项、光照图 912,318 项、坐姿 308 项检查通过。实际游戏真实/经典各 16 个可站立视角，含门框正反两侧、开关门、三类水槽、杯具、壁挂和 NPC 岗位。

真实游戏通过 67 项设施/出口/存档检查与 125 项居民检查，包括全部 29 人的 E 键对话、600 秒确定性行动、固定岗位不漂移、门口与碰撞净空、靠近停步以及读档重建名单。经典模式本轮单独检查画面，不重复运行 NPC 模拟；真实模式验收中额外进行了两轮往返画质切换。

三次进出基地资源：[{"geometries":2519,"textures":111},{"geometries":2519,"textures":111},{"geometries":2519,"textures":111}]。两轮画质切换：[{"geometries":2519,"textures":111},{"geometries":2519,"textures":111}]。离开时烘焙材质引用清零，返回及切换后的几何/纹理数稳定。

浏览器运行错误 0/0，资源请求错误 0/0（真实/经典）。已有 ANGLE/PMREM 浮点精度警告保留于原始日志，没有着色器编译失败。构建仍有已有字体路径、PostCSS、混合导入及 chunk 大小提示，退出码 0。

## 性能记录

ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)；Chrome/155.0.8059.40，headless，1920×1080、DPR 1、FOV 70、种子 424242、关闭动态分辨率。五处固定视角，预热后各五轮，每轮至少 100 帧及 1.2 秒；表中为五轮统计值的中位数。前值为本轮之前已验收的 realistic-final，后值为 realistic-fittings-final。

| 场景 | 绘制调用 前 → 后 | 三角面 前 → 后 | CPU 中位 ms 前 → 后 | GPU 中位 ms 前 → 后 | 帧间隔中位/P95 ms 前 → 后 |
|---|---:|---:|---:|---:|---:|
| 中控室 | 214 → 212 | 229047 → 226461 | 2.00 → 3.10 | 4.00 → 3.65 | 4.20 / 4.30 → 4.20 / 4.30 |
| 实验室 | 644 → 644 | 803419 → 796563 | 4.30 → 6.60 | 4.18 → 5.72 | 4.20 / 8.30 → 8.30 / 12.50 |
| 纸质档案馆 | 339 → 346 | 464347 → 462745 | 2.80 → 4.50 | 4.04 → 4.72 | 4.20 / 4.30 → 4.20 / 8.40 |
| 行政大厅 | 384 → 385 | 534805 → 531569 | 3.00 → 4.50 | 3.60 → 4.13 | 4.20 / 4.30 → 4.20 / 8.40 |
| 图书馆 | 1089 → 1109 | 1054991 → 1044337 | 6.90 → 9.10 | 6.33 → 7.63 | 8.30 / 8.40 → 8.40 / 12.60 |

所有代表场景本次稳定帧间隔中位 ≤ 8.40 ms，P95 ≤ 12.60 ms；满足 16.7/20 ms 桌面目标。图书馆等位置有小幅批次增长，CPU/帧间隔比上次采样升高，不能据此声称每项性能均改善。headless 帧间隔与实际显示刷新不同，不推断所有视角或移动端表现。

进入至预热稳定 8.25 s（包含至少 3 秒预热），生成 124.80 ms，加载阶段最大 RAF 间隔 583.20 ms；加载仍有长帧，未混入稳定性能。Android 真机未测。

## 截图与复现

[真实/经典近景对照](fittings-comparison.html) · [真实原始记录](realistic-fittings-final/runtime.json) · [经典原始记录](classic-fittings-final/runtime.json) · [性能及岗位最大位移](fittings-summary.json)

全部相机位置、朝向与画质写入原始记录。realistic-fittings 是本轮中间诊断版本，尚有门框共面条纹，不作为最终验收；已在最终视角消除。液体为低成本透明/PBR 近似，没有实时折射与流体模拟。静态烘焙不会随人物移动或开关门重算。

在 app 目录执行：

```sh
npm run bake:alpha
npm run check:alpha
npm run check:alpha-fittings
npm run check:alpha-bake
npm run check:seating
npm run build
node scripts/verify-alpha-refinement.mjs --label=fittings-final --cases=kitchen_sink,tea_cups,laboratory_sink,duty_sink,mounted_research,mounted_expedition,doorway_radio,doorway_radio_inside,doorway_admin,doorway_admin_open,reception_post,repair_post,radio,laboratory,admin_lobby,zephyr
node scripts/verify-alpha-refinement.mjs --classic --skip-runtime --label=fittings-final --cases=kitchen_sink,tea_cups,laboratory_sink,duty_sink,mounted_research,mounted_expedition,doorway_radio,doorway_radio_inside,doorway_admin,doorway_admin_open,reception_post,repair_post,radio,laboratory,admin_lobby,zephyr
node scripts/summarize-alpha-fittings.mjs
```

QA 使用独立临时 profile 与端口，不加载玩家存档；两次最终运行均已关闭自有浏览器/服务器并删除 profile。实现及素材记录见 [Alpha 说明](../../ALPHA-REFINEMENT.md) 与 [来源](../../public/assets/alpha-bake/SOURCES.md)。
