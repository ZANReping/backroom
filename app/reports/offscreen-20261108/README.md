# Worker 分阶段迁移验收（2026-11-08）

本轮在原项目 `E:\ZAN\backroom\app` 实施。正常游戏已启用有界计算 Worker；OffscreenCanvas 三维渲染完成真实场景试点，尚未替换正式游戏后端。模块与操作见 [WORKER-PIPELINE.md](../../WORKER-PIPELINE.md)。

## 已接入正式游戏

1. L1、L5、L11 的探索视线求交转入 Worker，以最多 12.5 Hz 更新探索；地图当前视野仍同步绘制。保留薄墙、城市多边形、多楼层与坐姿遮挡。队列只有一个执行任务和一个最新候选，不接受地图／原点／修订／探索数组过期的回包。
2. 留声机五组原画刷在 OffscreenCanvas 2D 中生成颜色及 PBR 通道；高度转法线及 L5 第二页物品图集法线转入像素 Worker。沿用原配方、UV、尺寸、mipmap 和共享 Texture，模型预热等待像素完成。
3. 野兽、迎宾女郎、厨师的 SDF 几何及近距离高细节在 Worker 中准备。传回复制的属性、索引及包围体，保留原骨骼、材质、动画和实例；等待期间沿用已有细节，活模型缓冲不会被 detach。
4. 消除两处实测阻塞：L1 材质克隆的 userData JSON 序列化连带编码 Canvas PNG；L5 没有厨师污渍时仍每帧递归整个场景。分别改为保留资源引用的独立材质克隆和按 Scene 缓存污渍根节点。
5. 三类计算 Worker 均有队列上限、超时、故障回退和 15 秒空闲释放。不支持或创建失败时恢复原同步／协作式计算。调试参数 `?workerJobs=0` 关闭新计算 Worker，两处直接修复仍保留。

游戏逻辑、输入、React UI、碰撞、音频和存档仍由主线程拥有。没有修改玩法数值、存档版本或联机代码，没有新增外部视觉资产。

## 性能对照

NVIDIA RTX 4060 Laptop、原生 GPU 无头 Chrome、1920×1080、DPR 1、真实光影、16 场景灯、阴影／泛光开启、关闭动态分辨率。种子 `424242 + level`，固定随机序列、相同环视及 60 Hz 目标调度。区块、模型、远景队列清空后，先双圈环视并等待连续安静帧；各层五轮、每轮 120 帧。

以下是**正式主线程渲染后端**的前后对照，不是渲染试点的速度。CPU 为逻辑与渲染提交之和，帧间隔包括调度等待。单位 ms，左为改造前、右为当前。

| 场景 | CPU 中位数 | CPU P95 | 帧间隔中位数 | 帧间隔 P95 |
| --- | ---: | ---: | ---: | ---: |
| L1 | 7.7 → 6.7 | 48.1 → 13.2 | 16.7 → 16.7 | 49.9 → 16.8 |
| L5 | 23.2 → 18.7 | 27.7 → 23.2 | 24.9 → 20.7 | 29.2 → 25.0 |
| L11 | 7.2 → 4.6 | 9.4 → 6.5 | 16.7 → 16.7 | 16.8 → 16.8 |

| 场景 | 绘制调用中位数 | 三角面中位数 | GPU 中位数 / P95（ms） |
| --- | ---: | ---: | ---: |
| L1 | 233 → 227 | 127882 → 117398 | 6.5 / 10.7 → 6.7 / 10.7 |
| L5 | 2134 → 2134 | 1380813 → 1380813 | 13.1 / 15.1 → 11.5 / 13.3 |
| L11 | 407 → 411 | 1551186 → 1553784 | 10.5 / 13.2 → 10.1 / 12.8 |

L1 的主要收益是减少烘焙材质准备产生的长帧。L5、L11 的主线程 CPU 中位数分别降低约 19% 和 36%。**L5 仍未达到帧间隔中位数 ≤16.7 ms、P95 ≤20 ms 的稳定 60 FPS 目标**，当前为 20.7 / 25.0 ms。后续仍需降低旅馆渲染及提交成本。

测量保留 CPU Profiler，有诊断开销；光源更新及流式细节会引起少量绘制量差异，L1 两版三角面也不完全相同，不能把全部差异归因于 Worker。两版静态测试均关闭无关的实体图鉴后台预热，实体首次准备另在实际 App 验证。未测试 Android 真机。

warmupMs 包括全窗口、模型、双圈环视和安静帧；L5 前／后为 46.51 / 39.29 秒，**不能作为首次可操作时间**。本轮未重新验证全部层级十秒入口指标。

原始数据：[改造前](final-before-realistic/result.json)、[改造后](final-after-realistic/result.json)、[汇总](comparison.json)。目录内含逐帧数据、五轮汇总、GPU 计时、CPU profile、截图和 Chrome 参数。[source-before](source-before) 保留原模块，对照服务器只读替换这些源文件。

| 场景 | 前后截图 | 实际 App |
| --- | --- | --- |
| L1 | [前](final-before-realistic/level-1.png) / [后](final-after-realistic/level-1.png) | [真实](final-realistic-complete/actual-1.png) / [经典](classic-complete/actual-1.png) |
| L5 | [前](final-before-realistic/level-5.png) / [后](final-after-realistic/level-5.png) | [真实](final-realistic-complete/actual-5.png) / [经典](classic-complete/actual-5.png) |
| L11 | [前](final-before-realistic/level-11.png) / [后](final-after-realistic/level-11.png) | [真实](final-realistic-complete/actual-11.png) / [经典](classic-complete/actual-11.png) |

## OffscreenCanvas 三维试点

试点直接调用原 Engine、Renderer3D、建筑、材质、模型和后处理。主线程运行逻辑，Worker 从确定性层级描述构建只读场景；视角使用世界坐标，两线程独立处理流式原点。视角消息确认／合并，尺寸和暂停单独传递。

L1、L5、L11 均检查了真实场景、主线程主动阻塞 250 ms 期间继续出帧、1280×720 缩放和跨 32 米原点变化。已查看截图，没有替代模型、背景照片或验证专用材质。Worker 的警告和错误返回诊断记录。

- [最终真实模式 15 项](final-pilot-world/result.json)：跨区世界坐标和原点变化通过，无未捕获异常或错误级控制台消息。
- [L1 跨区](final-pilot-world/offscreen-1-crossed.png)、[L5 跨区](final-pilot-world/offscreen-5-crossed.png)、[L11 跨区](final-pilot-world/offscreen-11-crossed.png)。落点用于验证原点，不是构图验收机位。
- [真实综合 19 项](final-realistic-complete/result.json)、[经典综合 18 项](classic-complete/result.json)：包含实际 App 与三维试点。经典综合在最后一次世界坐标扩展前运行，最终跨区协议由真实模式覆盖。

**尚未迁移**：动态场景修订、战斗／拾取等完整状态反馈、资源就绪反向通知、手机拍照及切入方块截帧。试点不能保存为正常游戏，正式 App 没有新增实验渲染设置。本次证明执行隔离和平台适配可行，不代表全部玩法已迁移。

## 功能与回归

| 检查 | 结果与记录 |
| --- | --- |
| 新增纯数据／队列／资源检查 | [46 项通过](regressions/check-worker-pipeline.log)：材质共享与释放、几何缓冲复制、法线方向、薄墙／多边形遮挡、队列合并及回退 |
| 原版视野等价 | [204 组通过](regressions/check-worker-map-parity.log)：17 个层级／据点、四方向、三位置 |
| 模型预热 | [113 项通过](regressions/check-model-warmup.log)：像素就绪、视图层过滤、共享程序等待、资源及错误清理 |
| 现有回归 | [野兽](regressions/check-beast.log)、[迎宾](regressions/check-spokes.log)、[厨师](regressions/check-chef.log)、[L5 物品](regressions/check-l5items.log)、[L1 烘焙](regressions/check-l1-bake.log) 通过 |
| 无 Worker / OffscreenCanvas 的实际 App | [8 项通过](fallback-actual-app/result.json)：模型、纹理回退、骨骼有限值、过期回包及无未捕获异常 |
| 暂停与恢复 | [10 项通过](worker-lifecycle/result.json)：计算 Worker 空闲终止、恢复时重建视野 Worker 并复用几何缓存 |
| 正式生产构建 | [TypeScript 与 Vite 通过](regressions/production-build.log) |

原生浏览器中，留声机五组配方的颜色、法线、粗糙度及金属度与原 Canvas 路径逐像素比较，14 个实际通道差异全部为 0。几何 Worker 完成七项（野兽 LOD0/1、迎宾 LOD0/1、厨师 LOD0/1/2），三种实际生成模型的蒙皮矩阵均为有限数值。数据见综合及生命周期报告。

生命周期检查仅证明新增 Worker 的释放和恢复，不证明全游戏长期 GPU 资源稳定。后台准备期间贴图／几何由 308/2082 增至 397/2483；恢复后保持 397/2483，未重复生成七组几何，不能据此宣称没有全局资源泄漏。

原 check:model-warmup 测试桩仍模拟 compileAsync，现有实现已采用 renderer.compile 与 KHR 并行程序等待；原文件也复现同一失败，见 [旧桩证据](regressions/check-model-warmup-before.log)。本轮更新桩并补齐像素等待，没有修改原编译策略。早期 Worker 图像加载缺适配及缩放检查未等待准备完成的问题均已修正重跑；失败目录保留追溯，不作为通过数据。

浏览器为独立 --headless=new、独立配置目录和动态端口，实际 App 使用内存存档。通过报告中 cleanup.profileRemoved 均为 true；测试浏览器及服务器已关闭，不接触用户浏览器或存档。部分记录有验证入口 favicon.ico 404 和 ANGLE 精度警告，没有对应游戏资产失败或错误级控制台消息。

## 复现

从 `E:\ZAN\backroom\app` 执行，性能测量串行运行并保持供电、驱动和其他应用负载一致：

```powershell
npm run check:worker-pipeline
npm run check:worker-map-parity
npm run check:model-warmup
npm run check:beast
npm run check:spokes
npm run check:chef
npm run check:l5items
npm run check:l1-bake
npm run build
npm run verify:worker-pipeline -- --label=rerun-realistic
npm run verify:worker-pipeline -- --classic --label=rerun-classic
npm run verify:worker-pipeline -- --pilot --label=rerun-cross-window
npm run verify:worker-pipeline -- --app --fallback --label=rerun-fallback
npm run verify:worker-pipeline -- --app --lifecycle --label=rerun-lifecycle
npm run measure:worker-pipeline -- --before --label=rerun-before
npm run measure:worker-pipeline -- --label=rerun-after
```

脚本分配独占端口并关闭自己创建的进程。试点入口：开发服务器 `/verifier/worker-render.html?level=1&mode=realistic`，level 支持 1、5、11。
