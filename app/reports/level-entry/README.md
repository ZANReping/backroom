# 全层级进入速度检查与优化

日期：2026-10-15。范围：`app` 的 29 个已注册层级／据点。Level 601 的内部 ID 为 12。

## 结果

最终生产构建中，从请求出口切层、播放过场，到加载完成并恢复操作，**29/29 项在 10 秒内**；当轮范围 **2.62–8.57 秒**，29 项均通过真实方向键移动检查。设备为 RTX 4060 Laptop GPU，1920×1080、DPR 1、真实光影、16 场景灯、阴影 1、AO 1、泛光开启，动态分辨率关闭。

| 代表层级 | 最终完整切层 | 独立复测完整切层 |
| --- | ---: | ---: |
| Level 0 | 3.32 s | 3.29 s |
| Level 1 | 8.14 s | 8.00 s |
| Level 5 | 7.85 s | 9.01 s |
| Level 11 | 8.57 s | 8.59 s |
| Level 601 | 3.98 s | 4.04 s |

逐层数据见 [comparison.md](comparison.md)，机器可读数据见 [comparison.json](comparison.json)。最终完整流程原始记录为 [production-final/runtime.json](production-final/runtime.json)，独立复测为 [production-repeat/runtime.json](production-repeat/runtime.json)。

另外，直接运行引擎和渲染器的关卡准备测试覆盖全部 29 项：真实光影为 **1.02–9.48 秒**，经典光影为 **0.37–5.82 秒**。这两组从地图准备开始计时，到附近世界就绪并绘制两帧结束，**不包含 React 过场、标题或页面启动**，不能与完整切层计时混用。

早一轮完整流程仍测到 Level 1 的 10.47 秒和 Level 5 的 10.20 秒，保存在 [production/runtime.json](production/runtime.json)。之后修正 L1 未完成烘焙占用构建槽位的等待问题；L5 各轮也有设备负载和缓存差异。保留这些记录，不将单轮达标解释为所有设备、所有种子都严格少于 10 秒。

## 本轮改动

- 修正预编译环境：所有区块、有限地图、手电、物品和人物模型按实际 HDR 后处理目标编译，并等待最终环境反射就绪。当前 Three r185 首帧会把旧 PCFSoft 改为 PCF，现从开始就选择实际使用的 PCF，避免首帧再编译一套阴影程序。
- 将区块构建改成有上限的轮转队列。桌面加载阶段最多四个任务、移动端两个；行走流式构建和存在跨区块结构所有权的 L11 保持串行。任务等待 Worker 或驱动编译时，其他任务可以继续准备；主线程仍服从原加载时间预算。
- 加载卡覆盖时先完成附近场景的构建、编译和上传，避免反复绘制未完成的场景及其后处理。首个完整画面仍在解除加载卡之前绘制。
- L1 按 CPU 核心数使用最多八个烘焙 Worker，移动端保留一个；一次请求完整的入口邻域。仅在已经接受进入 L1 的出口请求后，在离开动画期间预烘焙该目标种子的入口数据；尚未完成的烘焙不占用几何构建槽位。烘焙质量和算法沿用当前设置。
- L5／L11 在本层活动期间保留有限数量的飞蛾模板材质，避免刚预热完成就释放对应程序；离层时释放。物品、人物和附近实体的预热完成情况纳入就绪判断。
- 地图准备与离开动画重叠，动画耗时只计算一次；切层过场已经显示目的层级信息，结束后直接进入可操作画面，消除之后重复播放的入层标题卡。新开局和继续游戏仍使用原有介绍流程。
- 修复离开 L11 的瞬间，小地图旧定时回调访问新有限地图而报错的问题。

主要实现位于 `src/game/renderer/renderer.ts`、`chunkBuildQueue.ts`、`l1BakeQueue.ts`、`sceneWarmup.ts`、`modelWarmup.ts`、`src/game/world/chunkCache.ts`、`src/game/engine.ts`、`src/App.tsx` 及 `src/components/L11MapPanel.tsx`。

## 实际游戏与资源验证

使用独立 Chrome 配置目录、独立开发／预览服务器端口和 CDP 端口；从 `Browser.getBrowserCommandLine` 核验 `--headless=new` 与本轮 profile。生产测试从隔离存档继续游戏，再调用正常 `Engine.takeExit` 路径进入每层，保留实际过场和就绪门槛。进入后发送方向键，用真实碰撞验证移动，没有用传送替代输入。

最终生产流程、经典与真实模式测试均无 JavaScript 运行时错误。各目录的 `console.json`、`runtime.json`、`server.log`、`browser.log` 保存原始输出；部分运行有 `favicon.ico` 的 404，未发现关卡资源请求失败。所有本轮 QA 浏览器、服务器均退出，临时浏览器配置目录已删除，见各报告的 `cleanup`。

资源与取消检查见 [resource-ownership/runtime.json](resource-ownership/runtime.json)：

- 有限场景取消：8 项通过，编译完成之前保留材质，完成后恰好释放一次，旧场景不会发布。
- 并发区块与飞蛾资源：19 项通过，取消全部待处理区块，旧任务完成后不重新显示；五次 L5／据点往返均确认飞蛾模板由四份恢复为零。
- 五次往返后的几何数量为 231、254、266、266、266；纹理均为 139，程序均为 162。几何增长对应最多 24 项的现有物品池逐步上传，最后三轮稳定；待释放场景数量均为零。
- 另四次 Alpha／Tom 据点往返，几何均为 145，纹理为 118、122、122、123。纹理存在有界缓存／延迟上传，稳定判断容许最多两份差异；此有限轮数不能证明任意长时间游玩绝无泄漏。

探索阶段的 `resource-audit`、`resource-final`、`regressions` 保存过早采样触发的失败记录；最终检查等待编译、图片上传和延迟回收结束，并记录资源池归属。`app-final` 中的 L11 定时器错误已修复并在后续 11→601 切层中验证；`app-optimized` 的选取移动方向问题改为尝试八个方向的实际输入，最终 29 项通过。

## 截图与复现

检查了真实模式全部 29 个入口的截图汇总及主要层级前后对照，并检查生产流程 L0、L1、L5、L11 与经典模式 L5、Alpha 的原尺寸画面：墙体、地面、天空、人物及 HUD 正常显示。截图是正常场景绘制，没有替代材质或截图专用几何。

- [全部入口汇总 1](contact-sheet-1.jpg)、[汇总 2](contact-sheet-2.jpg)、[汇总 3](contact-sheet-3.jpg)
- [主要层级前后对照](before-after.jpg)
- [最终 L0](production-final/app-0.png)、[最终 L1](production-final/app-1.png)、[最终 L5](production-final/app-5.png)、[最终 L11](production-final/app-11.png)
- [经典 L5](classic/5-entry.png)、[经典 Alpha](classic/101-entry.png)

命令在 `app` 目录运行；需本机 Chrome，可通过 `CHROME_PATH` 指定路径。每次用新 `--label` 保留原始记录。

```powershell
npm run build
node scripts/verify-level-entry.mjs --label=recheck-realistic
node scripts/verify-level-entry.mjs --label=recheck-classic --classic
node scripts/verify-level-entry.mjs --label=recheck-production --production --app-levels=0,1,2,3,4,5,6,7,8,9,10,11,12,101,102,103,104,105,106,107,108,109,110,111,112,113,114,116,274
node scripts/verify-level-entry.mjs --label=recheck-resources --levels=104 --regressions
node scripts/summarize-level-entry.mjs --before=baseline --after=final --app=production-final --classic=classic
node scripts/level-entry-contact-sheet.mjs
```

关卡准备测试每项新建页面／Renderer，种子 424242、相机 yaw/pitch 为零，采用实际出生点；同一轮各项共享浏览器进程，不能当作清空操作系统／驱动缓存的彻底冷启动。生产测试使用同一个正常游戏实例、世界种子 424242；逐层的派生种子保存在 `mapSeed`。完整流程统一使用 `bloom` 出口过场，以比较进入准备耗时，不覆盖所有专属出口演出。开启无敌、锁定属性和冻结 AI，以避免测量期间死亡或自主移动实体改变测试条件。

初始 `baseline` 开启 CPU Profiler，且各轮设备后台负载没有严格控制。因此前后差值只用于排查瓶颈，不作为严格受控的性能百分比。最终计时未开启 CPU Profiler。未测 Android 真机、低核数设备、全部随机种子、全部存档地点或远程网络下载；页面启动时间和长时间稳态 FPS 也不属于这里的完整切层指标。

## 构建与脚本回归

最终 `npm run build` 通过 TypeScript 和 Vite 生产构建，Vite 用时 18.02 秒，日志见 [build-final.log](build-final.log)。仍有原有字体路径、Browserslist、PostCSS 和包体积提示。

以下检查均通过，原始输出见 [checks.json](checks.json)：

```powershell
npm run check:model-warmup       # 89 项
npm run check:program-completion # 58 项
npm run check:texture-images     # 96 项
npm run check:item-batches       # 29 项
npx esbuild scripts/check-scene-warmup.ts --bundle --platform=node --format=esm --outfile=.cache/check-scene-warmup.mjs
node .cache/check-scene-warmup.mjs # 7 批次
npx esbuild scripts/check-chunk-build-queue.ts --bundle --platform=node --format=esm --outfile=.cache/check-chunk-build-queue.mjs
node .cache/check-chunk-build-queue.mjs # 13 项
```

本轮保持单机开发范围，未更新联机功能或 `app-lite`，保留工作区先前改动。
