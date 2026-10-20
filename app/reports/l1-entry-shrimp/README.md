# L1 加载与活旱虾拾取验收

2026-10-20。1920×1080、真实光影、原生分辨率、独立无头 Chrome、RTX 4060 Laptop / ANGLE D3D11；禁用动态分辨率和动态曝光。测试使用生产游戏引擎、渲染器及完整 App，未使用简化场景替代交互。

## 结果与测量口径

同种子 `20261020` 的冷进入对照使用相同的 500 μs CPU Profiler 配置：**25.78 秒降至约 7.54 秒**。布局准备分别约 0.78 / 0.80 秒，场景等待约 24.97 / 6.70 秒。另一轮无 Profiler 测得 7.42 秒。原始数据见 [之前](../level-entry/l1-entry-shrimp-before/runtime.json)、[之后](../level-entry/l1-entry-shrimp-after-profile/runtime.json)、[另一种子](../level-entry/l1-entry-shrimp-seed42/runtime.json)及 [汇总](summary.json)。

这项指标从进入层级的准备开始，到附近建筑、碰撞相关场景及首次 GPU 提交就绪。**不是全部 25 块精细烘焙完成时间**，也不包含应用首次加载模块的时间。完整开发版 App 从导航到可玩另测得约 39.63 → 25.18 秒，包含 Vite 模块加载、标题等待和继续游戏 UI；未把这项指标宣称为十秒以内。

完整 App 用真实 E 键捕捉活旱虾、实际选择快捷栏五轮。基线首次手持 CPU 建模／求解约 25.8 ms，并在该段出现约 1653.8 ms 的 `render()` 主线程停顿。优化后首次手持命中缓存；最新真实／经典模式的具体耗时见各自 `result.json` 和 `summary.json`。该计时包含驱动等待，不能当作独立 GPU 时间或通用帧率保证。

完整真实模式运行中，25 个区块都完成最终图集替换，最终队列和活动任务均为零。相同工厂的最终高精度图集、方向、门光照权重、几何与已发布第 17 版资源逐字节相等；临时展示与最终结果具有完全相同的几何和 UV。**全部精细烘焙仍昂贵**：该次后台观察约 201 秒，期间并行执行了部分回归和构建，不作为独立吞吐基准。进入等待已不再包含这部分工作。

完整缓存收敛到 95,718,176 字节（96 MiB 上限以内）。准备中的结果单独保留，活动窗口内临时占用可超过完整结果缓存上限；观察峰值见汇总，不能把队列字节数当作进程总内存。没有验证 Android 真机，也没有对所有种子或所有设备作十秒保证。

## 截图与实际交互

- [初始完整建筑](after-realistic-20261020/initial-world.png)、[最终精细受光](after-realistic-20261020/refined-world.png)：已检查建筑没有在精细化时替换，精细受光后台接续。
- [真实模式手持](after-realistic-20261020-pickup/held-shrimp.png)、[经典模式手持](after-classic-20261020-pickup/held-shrimp.png)、[拾取前目标](after-realistic-20261020-pickup/catch-target.png)。
- [完整真实模式结果](after-realistic-20261020/result.json)、[最终真实模式复测](after-realistic-20261020-pickup/result.json)、[经典模式结果](after-classic-20261020-pickup/result.json)、[基线](before-realistic-20261020/result.json)。
- [离开 L1 的后台取消回归](after-realistic-20261020-pickup-leave/result.json)：实际切入 L2 后，L1 活动任务、队列和 Worker 数量全部归零；已完成缓存保留。

通过实际视线扫描选中旱虾，E 键捕获同一实体且背包只增加一只；五轮快捷栏切换仍使用同一物品实例和同一手指几何。截图已检查姿态、材质与握持表现。各运行保存浏览器命令、端口、GPU、控制台、资源数和清理结果，业务运行错误为零；孤立的 `favicon.ico` 404 不影响游戏。

## 回归与复现

在 `app` 目录执行：

```powershell
npm run check:l1-progressive
npm run check:shrimp-item-cache
npm run check:retro-hands
npm run check:shrimp
npm run check:model-warmup
npm run check:program-completion
npm run check:entity-preparation
npm run check:l1-offline
npm run check:l1-d-import
npm run check:l1-shadow-edges
npm run build
node scripts/verify-level-entry.mjs --levels=1 --seed=20261020 --label=l1-entry-shrimp-after-profile --profile
node scripts/verify-level-entry.mjs --levels=1 --seed=42 --label=l1-entry-shrimp-seed42
npm run verify:l1-entry-shrimp
npm run verify:l1-entry-shrimp -- --pickup-only
npm run verify:l1-entry-shrimp -- --classic --pickup-only
npm run verify:l1-entry-shrimp -- --pickup-only --leave-test
node scripts/summarize-l1-entry-shrimp.mjs
```

自动检查覆盖完整／临时几何一致性、最终图集回归、初始任务优先、后台并发限制、旧响应隔离、模板取消与竞争、实例独立性、手部准备不改变可见姿态、实际切换复用，以及既有异步编译生命周期。手部回归 12,988 项、旱虾机制 57 项、模型预热 111 项、着色器完成 58 项、实体准备 17 项、D 阶段兼容 33,698 项、108 个离线资源、射线 20,024 项、半影 1,272 项和图集接缝／遮挡 2,024,785 项通过。

`--before` 对照需要本工作区 `.cache/l1-entry-shrimp/before` 的改前快照；来源哈希另存于 [source-baseline.json](source-baseline.json)。普通复测不依赖改前快照。QA 使用自己的端口和浏览器目录，退出后关闭并清理；未触碰用户浏览器。生产构建现有字体路径、Browserslist、PostCSS 和大包提示仍保留。
