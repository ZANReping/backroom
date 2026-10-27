# Level 0.2 第五轮导入验收

2026-10-26，目标 `E:/ZAN/backroom/app`。[当前功能说明](../../L02-ROUND5-IMPORT.md) · [截图索引](comparison.html) · [原始来源](../../assets/l02-round5-import/SOURCES.md)。

## 合并范围

读取用户附件的增量 mbox 与最终源文件，验证 `983cde3` 原始文件的 Git blob 哈希，再与当前项目进行三方合并；21 个生产源文件中 8 个直接适用、6 个自动三方合并、5 个手动保留双方改动、2 个新增。未执行附件中的 `git am`、Python QA 或其他命令，没有覆盖整个项目。

保留当前寻人启事、库存、人物与手部、猎犬、爬菌、序章及其他已有修改。修改前路径／哈希见 [before-files.json](before-files.json)，合并分类见 [merge-plan.json](merge-plan.json)，最终文件清单见 [source-files.json](source-files.json)。备份在 `app/.cache/l02-round5-import-20261026/before/`。

本地适配：

- 保留塌墙数量上限后的全部切口，避免旧墙重新显示却没有碰撞。
- 新返回门缓存保留有界淘汰，兼容原先最近门验证入口。
- 新设施缓存材质标记为共享，切层只释放实例几何／私有材质；未定义的 `side` 使用 Three.js 默认正面。
- 400 种子检查发现办公室 L 短臂可能偏离中心轴半个墙厚，补齐视轴保护；洗手间后插入规则不变。
- 合并 BRC 文档风格时保留当前寻人启事与基金会文档；新增字段没有改变主存档格式。
- 旧浏览器验证器适配新许可证弹窗，并修正天空检查读取 `skyMesh`，避免读取不存在字段而空通过。

## 实际游戏覆盖

全部通过生产 App、引擎和渲染器验证，使用内存存档与真实键盘／触控事件；危险阶段通过现有调试入口推进，便于复现，不用截图专用模型。

| 项目 | 实际检查与截图 |
|---|---|
| 施工许可与进入卡 | 领取后出现纸质许可证，Esc 关闭，使用许可形成施工点，真实 E 进入；标题／副标题采用 remodel 主题。[许可证](validated-realistic/permit-paper.png) · [进入卡](validated-realistic/entryTitle.png) |
| 灯具与布局 | 固定种子、灯色／半径／强度、入口视轴光线求交，保留正常阻挡视野的整面墙。[场景](validated-realistic/fixedScene.png) · [视轴](validated-realistic/whiteLine.png) |
| 吊顶 | 强制强跳与抬高后，眼高最大 2.58 米，保留 12cm 顶部余量。[记录](validated-realistic/result.json) |
| 细化设施 | 实际洗手间中的马桶／隔断／洗手台，路由器／板夹，以及掉板后设备层与未完工房屋。[洗手间](validated-realistic/props.png) · [洗手台](detail-closeups/sinkView.png) · [设备层](detail-closeups/tileSetup.png) · [房屋](validated-realistic/houseSetup.png) · [工具](tool-closeup/houseTools.png) |
| 倒墙与插座 | 12 米、两端自由的真实带插座墙完整倒塌，碰撞与贴墙灯消失，原交互提示移除，正在充电的手机断线。[倒塌前](validated-realistic/wallSetup.png) · [倒塌后](validated-realistic/collapseWall.png) |
| 坡道 | 从塌陷房屋底部按住真实 W 走出，脚底回到上层地面。[走出](validated-realistic/rampClimbed.png) |
| 多返回门 | 选择第二近的自然返回门，靠近后停止崩塌，真实 E 返回原施工点。[门](validated-realistic/otherReturnSetup.png) · [返回](validated-realistic/returned.png) |
| 文档 | 四种版式的表头／签名／来源页脚；390×844 下无横向溢出，实际触控“放回”关闭。[桌面](validated-realistic/openWork.png) · [触控模拟](validated-realistic/mobile-inspect.png) |
| 开发者与图鉴 | L0.2 分区默认收起、展开后控件可见；真实 G 打开图鉴，L0.2 已发现、两个未制作子层级锁定。[面板](validated-realistic/devExpanded.png) · [图鉴](validated-realistic/codex.png) |

经典光影重复同一流程，见 [经典原始结果](validated-classic/result.json)；真实见 [真实原始结果](validated-realistic/result.json)。完整流程每种模式包含原路径 17 项与本轮 77 项断言（其中含重复入场的 Wi-Fi／天空检查），均通过。

## 设备与采样口径

Chrome 真正无头 `--headless=new`，原生 ANGLE NVIDIA GeForce RTX 4060 Laptop GPU / Direct3D11，1920×1080，DPR 1、渲染比例 100%、纹理质量 2、FOV 72；动态曝光／动态分辨率／颗粒／震动关闭，固定场景手电关闭、收手。移动文档另用 390×844 桌面触控模拟，不作为 Android 真机结论。

主测试存档种子 `424242`，通过实际施工门进入时地图种子沿原逻辑派生；随后统一载入 L0.2 种子 `20261025` 做场景、模型和性能验收。稳定视角世界坐标 `(16,16,0)`，朝向 `(26,22,1.6)`；精确 yaw／pitch 及局部原点在各阶段 JSON 的 `look`、`player` 和 `origin` 中。

首次完整流程的五轮数据仍含远景持续构建，已原样保留，不能当作纯稳定开销。本轮另开独立进程，等待全部 **25/25 区块**、构建队列和贴图解码完成，再等待 1.5 秒，分五轮各采样 120 帧。稳定数据来自 `steady-*`，与 `validated-*` 的加载阶段数据分开。RAF 帧间隔包含调度和 GPU 等待，CPU 渲染耗时另列；绘制／三角面包括场景各遍，不是单件设施预算。


## 稳定性能与资源

| 模式 | 帧间隔中位数 ms | 帧间隔 P95 ms | 渲染 CPU 中位数 ms | 渲染 CPU P95 ms | 调用 | 三角面 | 完整窗口预热等待 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 真实 | 12.40–12.50 | 16.60–16.70 | 2.10–2.30 | 2.50–4.00 | 124.00–125.00 | 405287.00–405527.00 | 9.85 s |
| 经典 | 8.30 | 12.40–12.60 | 1.80–2.00 | 2.20–4.60 | 110.00–111.00 | 405273.00–405513.00 | 6.92 s |

预热等待是在附近已可玩后为验收继续等候远景完整构建，包含最后 1.5 秒稳定等待，并非新增玩家入场锁定。调用和三角面的小幅差异包含路由器 LED 的显隐。两个已测固定场景满足中位帧间隔 ≤16.7ms、P95 ≤20ms；这不是改前／改后的加速百分比，也不代表所有机器或最大崩塌状态。

真实模式三次 L0→L0.2 循环的几何／纹理数量：`284/106 → 282/106 → 282/106`。

经典模式三次 L0→L0.2 循环的几何／纹理数量：`286/82 → 284/82 → 284/82`。

纹理保持稳定，几何最后两次一致；这是本轮有限循环的观测，不替代长期泄漏测试。原始逐轮数据、相机参数、错误与进程清理见 [summary.json](summary.json) 及各运行目录的 `result.json`。

## 自动检查与复现

400 种子的新生成／设施检查通过：400/400 出生路由器在 Wi-Fi 范围，400/400 出生板夹在附近；覆盖负坐标与加载顺序、自然门分布／净空、灯位参数、入口视轴、吊顶、塌墙／插座／充电和实际设施释放。脚本共 30,940 次断言，详见 [检查输出](check-l02-round5.log)；每个灯位按种子独立检查，因此断言数不等同于独立需求数。旧猎犬／L0.2 集成 141 项及 L0 建筑、18 组模型、进入主题、序章入场、手机电量锁定回归均通过。

| 命令 | 结果 | 耗时 |
|---|---|---:|
| `npm run check:l02-round5` | [通过](check-l02-round5.log) | 1.77 s |
| `npm run check:hound-l02-integration` | [通过](check-hound-l02-integration.log) | 1.94 s |
| `npm run check:l0-architecture` | [通过](check-l0-architecture.log) | 1.70 s |
| `npm run check:l0-meshes` | [通过](check-l0-meshes.log) | 3.27 s |
| `npm run check:l0-presentation` | [通过](check-l0-presentation.log) | 1.36 s |
| `npm run check:foyer-entry` | [通过](check-foyer-entry.log) | 1.18 s |
| `npm run check:phone-stat-lock` | [通过](check-phone-stat-lock.log) | 1.54 s |
| `npm run build` | [通过](build.log) | 60.04 s |

```powershell
node scripts/verify-l02-round5-import.mjs --label=review-realistic
node scripts/verify-l02-round5-import.mjs --classic --label=review-classic
node scripts/verify-l02-round5-import.mjs --perf-only --label=review-steady-realistic
node scripts/verify-l02-round5-import.mjs --classic --perf-only --label=review-steady-classic
node scripts/verify-hound-l02-import.mjs --skip-hounds --skip-pin --skip-perf --ramp --label=round5-compatibility
```

原浏览器验收路径另补跑 32 项通过，验证新许可证自动关闭的 QA 适配，以及实际 `skyMesh` 室内检查、坡道、充电、文档和返回兼容。正式流程、稳定采样与兼容运行无页面／控制台错误，唯一请求失败为未提供的 favicon.ico（404）。构建保留原有 PostCSS、动态引用和大包提示，没有构建错误。

## 证据与限制

- `before/` 是合并前的原生 GPU 流程与截图；当时的 L0.2 进入种子由时刻派生，与改后固定种子不同，不作建筑像素对齐比较。附件 `sheets/` 另保存作者提供的同机位前后图，属于原包 SwiftShader 证据。
- `realistic-first/` 是验收夹具未给手机的失败；`realistic-second/` 是视线断言误把正常的横向整墙当成端面缺陷的失败，已修正，保留原始记录。`realistic-third/` 为早期通过流程。正式结论用 `validated-*`、`steady-*` 和 `legacy-regression/`。
- 危险阶段和测试坐标由现有调试 API 控制；实际交互键、强跳／重力、坡道行走、手机充电与读文档使用生产路径。没有完整徒步通关、人工音效听审或 Android 真机测试；稳定基准不包含同时达到 48 块板／24 段墙／6 个塌陷房屋的最大压力。
- 崩塌仍为本次进入的临时状态，主存档 v:1 与施工点／任务／物品持久结构保持不变。天顶站、冰室仍为原包占位。联机继续封闭，GitHub 副本和 app-lite 未更新。
- 各运行使用独立配置和端口，结果均记录配置已删除；验收完成后再次按命令行归属检查自有浏览器／服务器，无需关闭用户或其他聊天进程。

[素材记录与原包清单](../../assets/l02-round5-import/SOURCES.md) · [现有 CC0 贴图作者／许可证](../../public/textures/l02/SOURCES.md)。本包没有引入新的外部纹理文件。
