# 室内天空遮挡与场景过渡

实施日期：2026-10-15；最终验收跨至 2026-10-16。范围为 Three.js `app` 与根说明；保留既有工作区改动，联机继续冻结。

## 实现

原先以是否存在 `SKY_PROFILES` 决定创建天空，导致已经改为全室内的 L2–L5 仍创建天空球、体积云和天空反射源。部分层级又在复制背景色之后修改雾色，或把雾的结束距离放到相机裁剪面之外，远处因此露出天空或明显的色块。L11 地铁沿用地表长视距，地下也一直绘制天空。

现在用 `renderer/skyVisibility.ts` 根据实际层级和空间选择天空：

| 空间 | 当前行为 |
|---|---|
| L2/L3/L4/L5 | 不创建天空球或云图；室内雾在实际绘制距离前完成过渡 |
| L4 窗边 | 保留原有虚空建筑、局部雨和体积雾 |
| L11 地铁 | 只有穿过真实 3×10 米坡道开口的天空射线保留；开口在相机背后或太远时跳过整个天空绘制 |
| L11 坡道 | 氛围按实际入口深度平滑变化，进入地下后地表雨雾及雨丝消退 |
| L11 运河 | 使用水体数据，不以负高度误判为地铁 |
| L6 地下 | 停绘天空及云图更新 |
| L7 封闭舱室、水下 | 停绘天空及云图更新；封闭舱室同时停绘蜃楼船队 |
| L6/L7/L9/L10/L11 户外 | 保留天空；L7 开门后保留门外天空 |

天空不可见时，`SkySystem.update()` 自身也拒绝更新云图，避免只隐藏网格却继续离屏计算。混合层保留实例以便返回地表恢复，离开层级正常释放。每次场景重建重置室内、室外及水下插值，新场景第一帧直接采用正确状态。没有新增贴图、美术资源、额外全屏通道或几何遮挡幕。

主要修改：`skyVisibility.ts`、`skybox.ts`、`skySystem.ts`、`l11Sky.ts`、`liquidsSky.ts` 与 `renderer.ts` 中的天空创建、环境过渡和更新位置。L11 现有 HDR 天空、城市建筑和其他聊天的改动保留。

## 实际游戏验证

使用真正的 `--headless=new` Chrome、独立用户目录与随机调试/服务端口，实际运行 Engine/Renderer。没有连接用户日常浏览器，使用验收页面的内存存储，不写玩家存档。所有脚本结束路径均关闭其创建的浏览器、服务并清理独立配置目录。

- GPU：NVIDIA GeForce RTX 4060 Laptop GPU，ANGLE D3D11。
- 分辨率：1920×1080，DPR 1，FOV 75°；种子 `20261006`。
- 真实/经典模式分别验证 L2、L3、L4 办公区及窗边、L5、L11 地铁/入口/坡道/地面、L6 地下、L7 舱室开关门/海面/水下、L9、L10。
- 额外覆盖关闭雾效，以及 L11 地铁和入口的雨天、雾天。
- 每个视角预热后采样 90 帧，直接统计天空 `onBeforeRender` 次数及实际云渲染目标绘制次数，保存未修改的截图。
- 修复前后的 15 个共同视角逐项核对世界坐标、朝向和 FOV，一致；雨雾和舱门状态的额外视角没有伪造修复前截图。
- 坡道以 0.5 米步长双向行走，每步经过 5 个实际渲染帧；检查背景与雾一致、过渡连续、返回地表恢复天空。
- 跨 L2→L10→L5→L10 检查旧天空释放、当前场景天空类型、无遗留地铁开口或水下状态。
- 复用既有 `verifier/sky-import.ts` 检查天气、画质切换、全部旧天空 profile、云图有限数值、共享噪声、异常时恢复渲染目标与资源释放。此脚本从真实模式开始，内部覆盖两种模式。

逐场景原图与对照入口：[comparison.html](comparison.html)。完整相机位置、朝向、天空状态、雾范围、资源数量及帧时间保存在各运行目录的 `runtime.json`。汇总见 [verification-summary.json](verification-summary.json)，逐视角帧时间与资源数见 [measurements.csv](measurements.csv)；可用 `node reports/sky-visibility/summarize.mjs` 从原始记录重新生成。

## 绘制结果

以下为每个视角 90 个实际渲染帧的天空/云图次数，单独统计目标，不把整场景绘制次数当成天空成本。

| 视角 | 修复前天空/云图 | 修复后天空/云图 |
|---|---:|---:|
| L2、L3、L4 办公、L4 窗边、L5 | 各 90 / 90 | 各 0 / 0 |
| L2 关闭雾效 | 90 / 90 | 0 / 0 |
| L11 地铁远端 | 90 / 0 | 0 / 0 |
| L11 可见入口、坡道、地面 | 各 90 / 0 | 各 90 / 0 |
| L6 地下 | 90 / 90 | 0 / 0 |
| L7 水下 | 0 / 90 | 0 / 0 |
| L7 海面、L9、L10 | 各 90 / 90 | 各 90 / 90 |
| L7 关闭舱门 | 未单独采样 | 0 / 0 |
| L7 开启舱门 | 未单独采样 | 90 / 90 |

## 复现命令

在 `app` 目录执行：

```powershell
npm run check:sky-visibility
npm run build -- --outDir .cache/sky-visibility/production
npm run verify:sky-visibility -- --sky-regression
npm run verify:sky-visibility -- --classic
```

局部复查示例：

```powershell
npm run verify:sky-visibility -- --cases=l11-metro-rain,l11-entrance-mist --skip-transitions --label=weather
```

本轮最终定向真实模式与完整经典模式使用的命令：

```powershell
node scripts/verify-sky-visibility.mjs --cases=l5-corridor,l11-metro-rain,l11-metro-mist,l11-entrance-rain,l11-entrance-mist,l11-street --sky-regression --label=final
node scripts/verify-sky-visibility.mjs --classic --label=final
node scripts/verify-sky-visibility.mjs --classic --cases=l5-corridor,l11-street --label=transition
```

`--baseline` 读取本机本轮开始时保留的 `.cache/sky-visibility/baseline/src/game`，该缓存必须存在；修复前截图和原始记录已保存在 `before-realistic/`。`--quick` 仅缩减场景列表，不跳过切换；`--label` 给输出目录增加后缀，避免覆盖已有结果。

## 历史失败与限制

- 初次基线和初次修复运行唯一网络错误为验收 HTML 没有 favicon，相关记录保留。脚本随后显式注入 data URI 图标，没有屏蔽真实网络错误。
- 一次真实模式全视角运行的 18 项场景通过，随后冷加载 L11 城市在 120 秒预热看门狗处超时，剩余 15 个区块；记录保存在 `after-realistic/runtime-timeout.json`。保留此失败，不将它描述为天空或城市加载性能通过。
- 另一轮在完成 L2/L3/L4 四个视角后，L5 预热在 60 秒处超时，剩余 7 个区块；保存于 `after-realistic/runtime-l5-timeout.json`。随后把验收脚本的固定截图时钟放在预热完成后，准备阶段保持正常时钟；L5 定向真实模式和跨层真实模式复验通过。但完整经典模式在 22 个视角全部通过后，跨层返回 L5 又出现同类超时（`after-classic-final/runtime.json`），因此不能归因于固定截图时钟或声称超时已经解决。本轮没有改动通用层级加载器。
- 经典模式首次调用旧天空回归时，该回归假设从真实模式开始，造成高画质尺寸断言失败。22 个场景和坡道/跨层检查已通过；原记录保存在 `after-classic/runtime-first.json`，后续测试入口显式初始化真实模式。
- 帧间隔只是短时抽样，包含主场景阴影、CPU 调度及其他系统负载。不同轮次差异明显，不能由减少天空绘制推断整场游戏达到固定 FPS；部分 L4/L5/L9 视角仍超过 16.7ms。
- 本轮按封闭空间及真实地铁入口裁剪天空。L9/L10/L11 有窗的室内仍保留窗外天空；未新增针对每一扇窗的通用 GPU 遮挡查询。关闭距离雾仍会显示有限绘制距离的几何边界，但不会重新露出天空。
- 生产构建沿用现有字体路径、Browserslist、PostCSS 和大包提示。未验证 Android 真机或所有随机种子；负坐标、周期入口和流式重定位由直接脚本覆盖。

## 最终检查记录

- `check:sky-visibility`：154 项断言通过，包含全室内分配规则、入口视锥、负坐标、周期入口、流式重定位、坡道连续性及运河排除。
- 生产构建：通过，耗时 40.10 秒；日志为 `build.log`。
- 真实模式：18 个此前已经完成断言的视角，加上最终 6 个定向复验视角，合计覆盖 22 个不同场景。最终复验 `after-realistic-final/runtime.json` 整轮通过；旧整轮超时记录仍保留，汇总逐项注明来源，没有把旧失败标成整轮成功。
- 最终真实模式的 74 个坡道往返采样通过，室内过渡权重相邻采样最大差为 0.1772；L2→L10→L5→L10 的天空选择、释放和状态清理通过。
- 经典模式：完整运行中的 22 个视角均通过，随后 L5 预热超时；另外执行 `after-classic-transition/runtime.json` 定向复验，整轮通过。定向运行包含 L5、L11 地面、74 个坡道往返采样和 L2→L10→L5→L10，最大权重步差 0.2328。两种模式的最终定向复验均无页面运行时错误或资源请求错误。
- 原有天空回归通过天气、质量、模式、纹理有限值与释放检查。反复低／高质量切换时纹理数量稳定回到 394／397；经典／真实模式重复三轮后分别稳定为 289／358 个几何、379／397 张纹理。

最后核对没有残留本任务的浏览器、开发服务器或 QA 配置目录，见 [cleanup.json](cleanup.json)。保留全部失败记录；本报告确认天空可见性和场景过渡修复，不将短时帧采样或定向复验作为全游戏加载时间与稳定帧率的通过证明。
