# 猎犬与 L0—L0.2 导入验收

日期：2026-10-26。目标为原项目 `E:/ZAN/backroom/app`，增量合并两个用户附件，保留现有工作区修改。功能及操作见 [接入说明](../../HOUND-L02-IMPORT.md)，完整截图见 [对照页](comparison.html)。

## 结论与范围

猎犬三形态、新模型／动画／AI／扑倒挣脱及图鉴已接入；Level 0 教学任务、施工许可、持久施工点、Level 0.2 地图／PBR／崩塌／设施／返回流程已接入。新增集成检查 **141 项通过**，相关回归与最终生产构建通过。实际生产 App／引擎／渲染器在经典、真实光影分别通过 **54 / 51 项**检查，额外真实坡道通行通过 **31 项**检查，三次均无 JavaScript 或 WebGL 运行错误。

原包的天顶站、冰室只有任务登记和开发者模拟按钮，尚无真实地图。因此“阈限之外”的三子层级目标目前不能全部通过正常探索完成；测试的奖励检查使用显式发现事件，不能视作三个地图均已制作。

## 合并与适配

使用附件增量和最终文件进行三方合并，没有覆盖整个项目或执行包内命令。原文件哈希见 [before-files.json](before-files.json)，合并路径见 [base-merge.json](base-merge.json)，本轮文件的最终哈希见 [source-files.json](source-files.json)。修改前备份保存在 `app/.cache/hound-l02-import-20261026/before/`。未修改 GitHub 副本、app-lite，也未开展联机工作。

本地适配包括：

- 保留现有爬菌、人物／手部、物品模型、库存操作、商人交易、手机电量锁定、序章状态重置和移动端任务布局。
- 猎犬模型／共享纹理渐进准备，按现有预算排队、取消和 GPU 预热；减少反复样条采样，保留同步模型工厂接口。
- L0.2 初始窗口立即声明自身生成器，避免首帧错误碰撞／高度路径；切层释放粉尘、裂纹、施工门与私有材质，保留共享材质及纹理。
- 关键物品禁止丢弃／寄存／出售；塌墙上限不再淘汰旧切口记录，避免画面与碰撞不一致；返回门数据缓存有上限。
- 新 HUD 使用现有任务列与主题，支持触控、键盘展开与进度条无障碍语义。

## 实际游戏流程

验收入口使用生产 App，默认存档读取替换为测试专用内存槽；继续菜单进入 Level 2，然后按真实交互键验证。并非仅渲染孤立原型。

| 场景 | 验证内容 | 记录 |
|---|---|---|
| 猎犬 | 三种形态、8 个网格、有限 UV、扑击压倒、四次按键推进挣脱、继续按键解脱、面部和手部遮挡 | [真实](validated-realistic/result.json)、[经典](validated-classic/result.json) |
| 图鉴 | 实际 G 键打开，猎犬预览轮换 12 次，覆盖三个形态 | [经典图鉴](validated-classic/codex-hound-cycle.png) |
| L0 | 实际任务 HUD、申请许可、贴近真实墙面使用、门和路障出现，E 进入 | [任务](validated-realistic/l0.png)、[施工门](validated-realistic/doorSetup.png) |
| L0.2 | 正确生成器／室内天空关闭、崩塌阶段、真实楼板掉落、房屋几何 | [进入](validated-realistic/entered.png)、[楼板下](validated-realistic/house.png) |
| 设施与返回 | E 给手机充电、E 打开 BRC 文档、E 通过返回门，回到原施工点约 1.1 米处 | [文档](validated-realistic/documentOpen.png)、[返回](validated-realistic/returned.png) |
| 坡道 | 从实际房屋底部按住 W 2.5 秒，通过真实碰撞／地面逻辑爬出，脚底高度回到 0 | [结果](validated-ramp/result.json)、[走出后](validated-ramp/rampClimbed.png) |
| 触控 | 900×600 桌面触控模拟，实际点击任务栏展开 | [收起](validated-classic/mobile-quest-collapsed.png)、[展开](validated-classic/mobileTask.png) |

任务完成、拍摄事件、奖励幂等、快照字段、关键物品保护、防尘面罩减伤、崩塌上限和重复进入重置由 [集成检查](check-hound-l02-integration.log) 覆盖。并未人工长期通关任务线、逐一听审全部音效或进行 Android 真机测试。

测试通过调试事件推进崩塌时钟、选择测试落点并冻结部分 AI，以便重现危险和拍照；实际开门、充电、阅读、挣脱和爬坡使用生产交互／移动路径。`validated-realistic` 早期模型准备阶段与命令行回归有时间重叠，首见峰值包含这一干扰，原始数据不剔除。

## 设备、种子和画质

原生无头 Chrome `--headless=new`，ANGLE NVIDIA GeForce RTX 4060 Laptop GPU / Direct3D11，1920×1080、DPR 1、渲染比例 100%、纹理质量 2、FOV 72；移动模拟另为 900×600。脚本拒绝软件渲染和丢失的 WebGL 上下文。

主世界种子 `424242`。猎犬固定世界位置约 `(14.5, -1.5)` 的 Level 2 直通道，相机位置／方向详见各阶段 JSON 的 `player + origin` 和 `look`。L0.2 沿原包按进入时刻派生地图种子，真实／经典／坡道三次分别为 `542556.3928`、`542547.7926`、`542466.1523`；不要将两种光影的 L0.2 截图当成完全相同建筑的像素对照。

五轮数据采样固定 L2 单猎犬、每轮 120 帧，完成预热后记录 RAF 帧间隔和 CPU 渲染耗时。绘制调用与三角面包括阴影及场景其他内容，不能当作单只模型的开销。不是改前／改后同种子性能对照，也不是全层级性能结论。

## 性能与资源

下表是五轮中的范围；完整逐轮值见 [summary.json](summary.json) 和原始 `result.json`。

| 模式 | 帧间隔中位数 | 帧间隔 P95 | 渲染 CPU 中位数 | 渲染 CPU P95 | 绘制调用 | 三角面 |
|---|---:|---:|---:|---:|---:|---:|
| 真实 | 4.2 ms | 4.3 ms | 2.3–2.7 ms | 4.4–5.3 ms | 240 | 129,300 |
| 经典 | 4.2 ms | 8.3–8.5 ms | 3.1–4.6 ms | 5.1–5.5 ms | 226 | 129,286 |

首见数据包含 300ms 稳定等待，不能用作纯模型构建时间：

| 模式／形态 | 可见准备总时长 | 最大模型构建步骤 | 最大帧间隔 |
|---|---:|---:|---:|
| 真实／敌对 | 1710 ms | 5.4 ms | 241.6 ms |
| 真实／中立 | 1137 ms | 3.0 ms | 29.2 ms |
| 真实／伏击 | 1332 ms | 4.9 ms | 29.1 ms |
| 经典／敌对 | 1221 ms | 3.5 ms | 83.3 ms |
| 经典／中立 | 1024 ms | 3.2 ms | 8.3 ms |
| 经典／伏击 | 1034 ms | 2.7 ms | 8.4 ms |

本轮并未达到“首次出现完全无卡顿”。分帧控制降低了单步模型构建，但首次纹理／资源与其他准备仍会形成帧峰值。高骨数毛链和部分视角的发束覆盖仍为模型成本与外观限制；脚锁是平地求解，不是逐足台阶射线 IK。

三次 L2→L0→L0.2→L2 循环后资源（几何／纹理）：

- 真实：`1394/258 → 1305/258 → 1309/258`。
- 经典：`1255/234 → 1220/236 → 1220/234`。

没有观测到单调增长；真实模式最后两次几何仍有 4 个差异，流式几何与延迟退休会影响计数，所以仅可称本次有限循环内有界，不能声称资源完全恒定或已完成长期泄漏验证。L0.2 动态崩塌完整压力场景没有另做五轮性能基准。

从菜单点击继续到 Level 2：真实 2.29 秒、经典 1.66 秒；开发服务器冷启动／模块加载另耗约 14.32 / 12.00 秒，整页至首次可玩约 22.62 / 16.84 秒。以上口径分开，不把菜单后的计时当作冷启动少于十秒。

## 自动检查、复现和清理

在 `app` 运行：

```powershell
npm run check:hound
npm run check:hound-anim
npm run check:hounds
npm run check:hound-integration
npm run check:hound-l02-integration
npm run check:creeper-integration
npm run check:entity-forms
npm run check:entity-preparation
npm run check:l0-architecture
npm run check:l0-state
npm run check:l0-continuity
npm run check:l0-meshes
npm run check:phone-stat-lock
npm run check:merchant-trade
npm run check:warehouse-ui
npm run check:retro-hands
npm run build
node scripts/verify-hound-l02-import.mjs --label=review-realistic
node scripts/verify-hound-l02-import.mjs --classic --touch --codex --label=review-classic
node scripts/verify-hound-l02-import.mjs --skip-hounds --skip-pin --skip-perf --ramp --label=review-ramp
```

16 个回归命令和生产构建均通过。最终构建约 48.09 秒，保留 Vite 大包、静态／动态重复引用及 PostCSS `from` 提示；这些提示没有阻止构建。每个命令原始输出在本目录 `check-*.log` 和 [build.log](build.log)，最后一次构建记录见 [build-checks.json](build-checks.json)。

浏览器脚本自动创建独立服务端口、CDP 端口和临时配置，执行后关闭自有进程并删除配置。三次正式结果均记录 `profileRemoved: true`，最终按命令行归属检查未发现本轮遗留 Chrome／Node 验证进程。唯一网络失败为未提供的 `favicon.ico`（404），未见素材／模块加载失败。

`realistic-first` 至 `realistic-fourth` 是测试夹具定位／等待调试记录，不属于通过结果；保留其失败证据。`realistic-fifth` 为早期通过的部分流程。正式结论使用 `validated-*` 三组。CPU 定位数据 [hound-cpu-profile.json](hound-cpu-profile.json) 来自 `scripts/profile-hound-import.ts`（先以 esbuild 的 Node ESM 模式打包，外置 `@napi-rs/canvas`，再执行），不能直接作为 GPU 性能比较。

## 来源

[猎犬附件与参考造型记录](../../assets/hound-full-import/SOURCES.md)；[L0—0.2 附件与原文记录](../../assets/l02-full-import/SOURCES.md)；[PBR 的作者、URL、CC0 与派生参数](../../public/textures/l02/SOURCES.md)。包内原说明和预览保留在 `app/assets/`，并不替代本轮实际运行证据。
