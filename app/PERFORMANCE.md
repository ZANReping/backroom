# 移动端性能说明

项目使用 Three.js，运行目录为 `app/`。手机默认预设为：渲染比例 80%、DPR 1、8 盏场景灯、区块预算 1.5ms、HUD 4Hz、细节 65%、粒子 25%，关闭实时阴影、水体和泛光。已有存储设置会保留；需要时可在设置中手选“手机流畅”。

本轮实现包括：

- Worker 原始区块缓存，通用缓存与等待队列分别限制 64 项（L11 使用独立 96 项缓存）；区块消费后移出，Worker 失败时回退同步生成，种子确定性保持不变。
- 增量模型构建、贴图预热和 `compileAsync`，以及静态矩阵与合批。门扇和碰撞代理保留。
- 手持模型缓存、闲置贴图回收、稳定 RAF、HUD 降频、后台暂停，以及真实场景就绪后再放行加载。标题背景也先在 Worker 准备地图数据。
- 静止门和容器不重复遍历子网格；动画结束时归位并刷新最终碰撞盒。
- 门扇内固定的面板/把手一起合批，铰链仍独立运动；L4 低细节使用较大的静态家具分组，并合并等价材质。碰撞不受分组大小影响。
- 异步图片替换占位纹理前释放旧 GPU 分配，避免连续切层回收时出现 `usedTimes` 异常。
- 探索地图移除无效的逐灯遍历：可见格已标记为探索后，无需对每盏灯再次将同一个格写为已探索。

区块与构建预算是软预算，单个同步构造器仍可能超过预算；优化不改变玩法密度。

## 验收

已通过的命令：

```text
npm run build
npm run check:l1
npm run check:l2
npm run check:l3
npm run check:l4
npm run check:l10
npm run check:l11
npm run check:settlements
npm run check:mouse-look
npm run check:generation-obstacles
npm run check:item-batches
npm run check:static-colors
npm run check:texture-images
```

当前性能回归通过 123 项，性能流程通过 38 项（包含开门改变碰撞盒、关门恢复原碰撞盒）。旧的 82/93 项记录仍保留在历史证据文件中。手机触屏模拟确认首次默认预设、新游戏入口和背包开关正常，无运行时异常；见 `.check/mobile-ui.json`。模拟设备仍使用桌面硬件。

## 复现

启动开发服务器：

```text
npm run dev -- --host 0.0.0.0
```

在手机同一局域网访问：

```text
http://<电脑IP>:3000/verifier/performance.html
```

页面不读写游戏存档，使用固定 seed `424242`，等待可见区块构建完成后环视 360 度，并下载 JSON。测试页基准固定为 DPR 1、8 盏灯、细节 65%、粒子 25%，未应用完整手机预设（无动态分辨率，雾使用默认值）。

当前测试页在场景就绪之前暂停模拟，与 App 的 `waitingForMap` 一致，报告中用 `startupProtocol` 标注。较早记录在加载时仍运行视野计算与 AI；其加载阶段 CPU、等待时长及加载后的实体状态不能和新协议直接作性能比例对照。`warmupMs` 包含等待与至少 180 帧启动采样，不是单纯的加载界面等待时间。

桌面 Chromium 打开该页面后，可用其调试连接运行脚本（Node 24）：

```text
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 4 .check/cpu4.json 0,4,5,8,11,105,106
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/checks.json checks
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/crossings.json crossings
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/walking.json walking
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/transforms.json transforms
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/textures.json textures
node scripts/run-performance-cdp.mjs <浏览器CDP-WebSocket地址> 1 .check/texture-images.json textureimages
```

省略末尾层级列表会测试全部层级。脚本退出时恢复 CPU 速率。四倍 CPU 降速只是压力条件，GPU 仍为桌面显卡，不能换算为某款手机。

## 证据

- `.check/performance-before.json`、`.check/performance-after-pass1.json`：同一旧协议；L5 调用 4040→993，CPU P90 31.8→9.7ms；L0 启动最长 CPU 1121.5→190.5ms，L2 875.1→219.2ms。
- `.check/performance-final-desktop.json`：30 层更新协议，不能与旧协议直接计算提升。
- `.check/performance-release-desktop.json`：前一阶段版本连续完成 30 层加载和 360° 稳态环视；各层帧间隔 P90 为 4.2–12.6ms。只代表该桌面、种子和测试路线。加载阶段仍有长帧，例如 L7 单个构造阶段约 366ms，不能将稳态结果当作无卡顿保证。
- `.check/performance-checks-final.json`：82 项基础回归、38 项交互回归；包括 GPU 贴图替换/释放与门扇碰撞归位。
- `.check/performance-checks-release.json`：93 项基础回归、38 项流程回归，runtimeDiagnostics 为 0。
- `.check/occlusion-validation-final.json`：161 项验证通过，所有像素一致；A/B 使用同一已准备场景，避免重复推进状态。
- `.check/performance-batches-final.json`：136 组画面对照通过；使用数值栅格化容差，不能表述为全像素一致。
- `.check/sky-textures-validation-final.json`：9 项验证通过；6 种天空的 Worker 像素与旧算法一致，并覆盖 GPU 占位扩容、失败回退和环境探针。
- `.check/performance-walking-budgeted.json`：L4/L5/L105/L106 各 34 米、600 帧、每层 5 次操作、0 受阻；CPU P90 为 8.2/7.2/8.4/7.5ms，60Hz 预算比例为 99.5%/98.67%/99.5%/100%，0 帧超过 50ms。仅代表单种子近出生点桌面路线。
- `.check/performance-september27-desktop.json`：连续 30 层完成且无 runtimeDiagnostics；L4/L5 帧 P90 为 19.1ms，L116/L274 为 38.0/38.4ms，不能声称性能全部达标。L7 本次启动 CPU 峰值 136.2ms，历史前一阶段为 365.6ms，不作稳定因果对比；冷启动和长帧仍存在。

### 2026-09-27 四倍 CPU 压力样本

来源为 `.check/performance-september27-cpu4.json`，7 层的 runtimeDiagnostics 均为 0。

| Level | CPU P90 (ms) | 帧 P90 (ms) | 启动 CPU 峰 (ms) |
| --- | ---: | ---: | ---: |
| 0 | 15.9 | 38.4 | 226.3 |
| 4 | 38.7 | 38.4 | 239.9 |
| 5 | 27.2 | 38.4 | 181.4 |
| 8 | 98.8 | 114.6 | 697.6 |
| 11 | 29.3 | 38.4 | 261.1 |
| 105 | 71.7 | 76.5 | 742.7 |
| 106 | 56.2 | 76.3 | 1254.2 |

这是 CPU 降速压力样本，不能作为同比提升或手机实际帧率结论；该样本没有全部满足 60Hz 预算，帧调度出现约 38ms 量级，需要在目标设备上复核。
- `.check/performance-final-hotspots.json`、`.check/performance-flows-final.json`：12 次强制往返中，地图平移 CPU 0.3~3.8ms，渲染峰值 6.1~48.1ms，GPU 纹理约 142~179，未再单调累积。

测试环境为桌面 Chrome 153 / RTX 4060。60Hz 屏幕测量允许 0.75ms 调度误差，不代表严格超过 60fps；桌面数据不代表 Android 真机结论。

后期四倍 CPU 压力测试（`.check/performance-cpu4-final.json`，门扇内部合批之前，固定 960×540，未降低 GPU 性能）：

| 层级 | CPU P90（ms） | 帧间隔 P90（ms） |
| --- | ---: | ---: |
| 0 | 19.8 | 20.9 |
| 4 | 68.7 | 70.8 |
| 5 | 43.1 | 45.8 |
| 8 | 39.2 | 41.6 |
| 11 | 26.5 | 29.1 |
| 105 | 67.7 | 70.7 |
| 106 | 80.4 | 83.1 |

最后移除无效逐灯探索计算后，再测 `.check/performance-release-cpu4-after-visibility.json`：L0 CPU / 帧间隔 P90 为 **9.2 / 12.4ms**；L4 为 **54.8 / 58.3ms**；L5 为 **38.3 / 37.6ms**。L0 已在该压力样本内落入 60Hz 预算，L4、L5 仍明显超出。

不能声明移动端目标已经达成。当前改动改善了重复解码、区块生成、提交尖峰和资源累积，但高负载场景仍需进一步减少绘制调用，并在中端 Android 真机上验证首次进入、连续行走、操作及长时间运行。

## 2026-09-27 增补

- 办公室、酒店和据点加入实体墙遮挡剔除，门洞保留；开启实时阴影时自动停用。相机活动范围使用保守缓存，门和容器变动时更新边界；寻找新遮挡每帧使用 1ms 软预算，检查未完成时继续显示物体。
- 据点静态家具按 8m 网格与楼层分组合批，原交互对象和碰撞对象保留。材质键覆盖完整标准渲染属性；自定义 shader 或无法安全比较的对象按实例隔离。
- 门和容器的变换矩阵只在姿态变化时更新。
- 2048×1024 程序化天空像素移到 Worker，支持缓存和失败回退；占位图升级前释放旧 GPU 分配，场景就绪与 realistic 环境探针均等待正式像素。
- 性能验收页新增“行走与操作”，使用实际移动与碰撞、手持切换、门/容器动画，并输出实际距离和受阻帧。

当前目标暂按中端 Android 浏览器设定。尚未有 Android 真机，不能声明所有层级 90% 场景超过 60fps。

## 2026-09-27 静态矩阵缓存补充

`renderer/staticTransforms.ts` 为完全静止子树缓存 world matrix，跳过逐帧遍历；chunk 根节点保持可遍历，动态结构、出口和天空整枝排除。父变换、强制刷新和 world-position 查询后的变化仍会传播。门柜姿态变动与 chunk 平移后会先完整刷新矩阵，避免边界查询提前清除脏标记导致子节点位置过期。

`.check/static-transforms-validation.json` 覆盖 10 个层级 `[0,1,4,5,8,9,10,11,105,106]`、124 组动画和立即/加载后跨块画面对照，共 775778 个矩阵精确比较通过，runtimeDiagnostics 为 0。画面对照允许少量最大 1 字节舍入，实测平均最大误差为 0.00000289352。

同一浏览器 960×540 CPU4 样本（两份均 0 diagnostics）为 `.check/performance-static-trees-before-cpu4.json` → `.check/performance-static-trees-after-cpu4.json`：L4 CPU P90 35.4→26.1ms、帧 P90 37.5→29.1ms；L5 CPU 21.2→15.9ms、帧 20.9→16.7ms；L105 CPU 34.2→33.2ms、帧 33.4→33.4ms。L5 预算比例为 95.83%，但这只是桌面单 seed 样本，不代表 Android 真机或严格 60fps。

`scripts/check-static-transforms.ts` 的 326 项 Node 回归通过，覆盖重复冻结、普通帧更新、祖先位移、动态子孙、强制刷新和世界位置查询；计数断言确认静止帧不再访问静态孙节点。方法采样中，L4 的 `scene.updateMatrixWorld` 平均从 11.82ms 降至 2.91ms（`.check/performance-l4-current-profile-cpu4.json` → `.check/performance-l4-static-trees-profile-cpu4.json`）。

本轮重新运行基础/流程检查（93+38 项）和 classic/realistic 货架动画检查（118 项），均通过且 0 diagnostics，记录见 `.check/performance-static-trees-checks.json` 与 `.check/performance-static-trees-moving.json`。

## 2026-09-27 货架实例化补充

`movingInstances.ts` 将 binshelf 收纳箱与标签按相同材质和几何进行实例化，同时保留原节点动画与精确碰撞；只有姿态变化时上传矩阵。`.check/moving-instances-both-modes-validation.json` 在 classic/realistic 两种模式各通过 59 项，共 118 项：各 33 个货架、726 个原部件，覆盖打开/关闭中间状态的 56 组画面对照、碰撞归位、绘制减少和 idle 不上传，runtimeDiagnostics 为 0。

桌面 CPU4 同环境样本 `.check/performance-shelves-before-cpu4.json`→`.check/performance-shelves-after-cpu4.json` 中，L105 绘制调用 357→225，CPU P90 50.2→36.7ms，帧 P90 50.1→37.5ms；该样本仍未达到 60Hz 预算，不能代表 Android 或全部场景。正式 build 已通过；最新 `.check/performance-checks-september27-current.json` 为 93 项基础、38 项流程、0 diagnostics。

## 2026-09-27 L8 补充

- L8 岩石按 8m 分组静态合批，保留精确原始代理；24 个视角画面对照与代理/碰撞共 26 项通过，记录见 `.check/l8-rock-batches-validation.json`。本轮未将货架实例化计入成果。
- 洞底与洞顶使用 2048 项精确坐标缓存，seed 切换时清空，不近似碰撞。`scripts/check-l8-surfaces.ts` 共 28,792 次 `Object.is` 检查，与旧算法一致。
- 同一浏览器 CPU4 协议下，L8 绘制中位数 686→112；CPU P90 34.4→31.8ms（仅合批）→15.4ms（再加入高度缓存）；最后帧 P90 16.7ms，96.25% 采样帧在允许 0.75ms 调度误差的 60Hz 预算内，稳态帧超过 50ms 为 0。数据分别见 `.check/performance-l8-pre-rock-batch-cpu4.json`、`.check/performance-l8-post-rock-batch-cpu4.json`、`.check/performance-l8-surface-cache-cpu4.json`。这只是单层、单 seed 的桌面压力样本，不代表 Android 或所有场景达标。
- 最新 crossings 覆盖 `[0,4,5,8,11]`，每层 6 次：移动 CPU 峰值 3.1/4.6/10.1/39.9/8.2ms，构建帧峰 65.6/31.7/22.5/50.7/14.5ms。仍有长帧；30 次为强制跨块测量，不等于真实行走 FPS。
- 最新 `.check/mobile-ui.json` 确认触屏默认 80%/DPR1/8 灯/1.5ms/4Hz/遮挡剔除开启，新游戏和背包通过且 0 exceptions；进入约 14.15 秒包含开场流程，不能作为冷网络时间。


## 2026-09-27 NPC 与加载峰值补充

- `renderer/npcBatches.ts` 在每个动画关节内部合并刚性细节，把材质颜色烘焙为顶点色。重叠共面部件继续保留原网格，避免头发/服装深度竞争改变外观；头、手脚、躯干、Joey 吉他和死亡姿态保留。原关节仍在树中，只屏蔽其自身绘制层。NPC 模型按距离每帧创建一位，附近 24m 内角色未就绪时保持加载界面。
- `geometry.ts`、`settlementMeshes.ts`、`tradeMeshes.ts` 提供可暂停的地形生成器，同时保留同步工具入口。分帧不改变原有几何合并、材质、实例分组或三角形顺序。L11/洞穴继续复用已有生成器。
- `sceneWarmup.ts` 每批最多预编译 8 个实际可见绘制对象，跳过合批后只用于碰撞的隐藏源模型。随后用零绘制范围分批提交实际几何和实例 buffers；不清屏、不绘制阴影，并在每次提交后恢复层级、裁剪和 drawRange。取消/卸载时显式释放 InstancedMesh 自有缓冲区。

验证：

- `.check/npc-batches-final-validation.json`：130 种 NPC/头像组合 × 4 姿态 × 有无阴影，1040 项通过；总绘制调用 91856→48812（含对照场景地面/阴影）。少数边缘存在亚像素舍入，最高平均通道误差 0.000936；只允许最多 1 个无法在邻近像素匹配的像素。共面深度冲突保留原网格。
- `.check/npc-runtime-validation.json`：classic/realistic，4 层级共 98 项，64 组世界画面对照逐像素一致；覆盖最近角色优先、每帧一位和附近角色就绪门槛。
- `.check/terrain-fingerprints-before.json` → `.check/terrain-fingerprints-after.json`：18 个有限层的节点树、矩阵、几何属性/索引字节摘要、材质与实例矩阵完全相同。暂停次数和耗时不参与相等判断。
- `.check/scene-warmup-final-validation.json`：22 项实际 WebGL 检查通过，预热不改写画布、首次正式绘制无额外 bufferData、像素结果一致，异常和取消后恢复状态。`scripts/check-scene-warmup.ts` 另验证预编译对象筛选、灯光、父子层掩码、Promise 完成及取消。
- `.check/performance-finite-warmup-checks.json`：93 项基础和 38 项流程检查通过。上述浏览器验收记录均为 0 runtimeDiagnostics。

同一桌面 Chrome 153、960×540、CPU4、相同 seed 和移动配置采样：

| 层级 | 本轮前 CPU P90 | 最后 CPU P90 | 本轮前加载渲染 CPU 峰值 | 最后加载渲染 CPU 峰值 |
| --- | ---: | ---: | ---: | ---: |
| 105 | 33.1ms | 21.5ms | 347.8ms | 68.8ms |
| 106 | 35.3ms | 22.0ms | 557.6ms | 61.3ms |

对应 `.check/performance-npc-batching-before-cpu4.json` → `.check/performance-finite-warmup-after-cpu4.json`，两份均无 runtimeDiagnostics。NPC 合批单独引入后曾增加创建峰值，因此随后加入每帧创建预算、地形生成器和 GPU 预热；最终表格包括这些改动。

加载渲染峰值不包含 `engine.newRun/loadLevel` 同步地图生成时间。该协议下加载观察期约从 2.52/2.47 秒变为 4.37/4.52 秒，工作被分散到更多帧，不能将其描述为总加载时间缩短。地图生成仍可产生长任务；一次刷新后的 L106 冷材质/NPC 首帧仍约 102ms。最后稳态帧间隔 P90 为 20.9/24.9ms，仍未满足所有场景 60Hz 预算。

这些数据来自桌面 CPU 降速，GPU 仍是 RTX 4060，不是中端 Android 真机成绩。整体移动端目标仍未验收。


`.check/performance-all-levels-warmup.json` 为完整区块上传预热方案下的全部 30 个层级遍历，0 runtimeDiagnostics；桌面原速样本的稳态 CPU P90 为 1.3~9.5ms，最低 60Hz 预算比例 93.75%。这只覆盖单 seed、出生区域环视，并非 90% 游戏场景。首次访问部分无限层仍出现约 100~316ms 的渲染峰值，后续应继续定位单个同步构造器/首次材质路径。


后续修正：无限区块只预上传当前视野内的模型，离屏物体沿用按需上传；有限地图仍完整分帧预热。完整区块预热的 A/B 压力检查中，L5 往返末尾 GPU 几何计数由关闭时的 1481 增至开启时的 3140，且未证实跨块峰值改善（`.check/performance-upload-crossings-ab.json`），因此收窄预热范围。不能把有限地图的峰值改善直接套用到所有无限区块。

加载取消时，尚未完成 `compileAsync` 的模型会等待其 Promise 结束再释放材质，避免 Three 后续轮询已经失效的 program。`.check/loading-cancellation-validation.json` 8 项通过：63 个 owned 材质在编译等待期间保持有效，取消后各释放一次，旧场景不发布，新层级能正常就绪；0 runtimeDiagnostics。当前 NPC 运行时复测 `.check/npc-runtime-warmup-validation.json` 仍为 98 项 / 64 图像 / 0 diagnostics。


最终视野内区块预热方案的矩阵回归 `.check/static-transforms-warmup-validation.json` 为 124 组画面对照、776813 个矩阵精确比较通过，0 runtimeDiagnostics；覆盖 10 个层级、门柜开合以及区块平移的立即/就绪帧。最终 `npm run build` 已通过，现有字体路径、Browserslist、PostCSS 和包体积警告仍在。


最终地形复核：`.check/terrain-fingerprints-final.json` 与同一缓存状态下的 `.check/terrain-fingerprints-final-sync.json` 在 18 个有限层完全一致。相对最初快照，几何、树、矩阵与材质参数未变；L113/114 共享 L8 法线贴图的 colorSpace 会受先前是否访问 L8 的缓存状态影响，因此最终同步/生成器对照使用相同缓存历史，不能直接忽略这一字段后声称全字段相等。

最终区块视野预热记录 `.check/performance-warmup-visible-crossings.json`（桌面原速、每层 6 次强制往返、0 runtimeDiagnostics）：

| 层级 | 平移 CPU 峰值 | 构建帧 CPU 峰值 | 往返后 GPU 几何数 |
| --- | ---: | ---: | ---: |
| 0 | 8.2ms | 22.0ms | 819 |
| 4 | 5.7ms | 128.2ms | 2639 |
| 5 | 11.9ms | 94.2ms | 1491 |
| 8 | 80.9ms | 163.2ms | 588 |
| 11 | 12.9ms | 46.0ms | 532 |

L5 几何驻留已回到关闭整块预热时的量级，但这些跨块样本仍有长帧，不能宣布跨块卡顿已全部解决。强制平移测试也不等同于正常行走帧率。

## 2026-09-27 水面分帧与返程区块预取

L8 跨块采样定位到两类独立峰值：渲染构建中水面在同一帧重复查询洞底高度，以及首次折返时未预取的 5 个洞穴区块在主线程生成。

- `liquidsSky.ts` 将水面、潮湿岸边、连续浅溪法线和天空区域扫描接入可暂停生成器。保持同一合并桶、顶点/索引顺序和湖面归属；中途取消释放尚未提交的几何缓冲。同步工具入口保留。
- `renderGeometry.ts` 复制渲染缓冲时直接使用 `BufferGeometry.copy`，避免 `clone()` 重新调用默认 Cylinder/Dodecahedron 等构造器。静态批次只需要渲染数据；碰撞提取仍使用原始模型及其几何类型。
- `chunkCache.ts` 修复预取发生在卸载之前的遗漏：新窗口外环内、即将卸载的旧区块也进入后台队列，为返程准备独立原始数据。缓存仍为 64 项且单次消费，不复用可变 live 数组。

验证记录：水面/天空修改前后指纹与取消检查 79 项（`.check/liquid-jobs-validation.json`，含 515 个中间缓冲释放检查）；几何复制 270 项字节/变换检查（`scripts/check-render-geometry.ts`）；有限层合批画面对照 136 项与 L8 岩石 26 项（`.check/static-batches-render-copy-validation.json`、`.check/l8-batches-render-copy-validation.json`），均在原有图像误差容限内。最新基础/流程检查为 123 + 38 项，0 runtimeDiagnostics（`.check/performance-return-prefetch-checks.json`），含水平与对角返程、污染 live 数组后生成数据仍确定且独立。

桌面原速 30 次强制往返记录 `.check/performance-liquid-jobs-crossings.json`（尚未加入返程预取修复）中，L0/L4/L5/L8/L11 构建帧峰值为 44.5/29.6/45.8/10.0/16.9ms，0 runtimeDiagnostics。L8 相比上一轮的 163.2ms 大幅下降，但独立轮次存在缓存和系统调度差异，不将该比例视为严格性能增益或所有场景保证。

随后仅针对预取修复的同协议对照 `.check/prefetch-diagnostic-before.json` → `.check/prefetch-diagnostic-after.json`：L8 首次折返 34.9→0.9ms；同步生成 5 个 chunk→0 个（每个原先约 6.4~7.4ms）。修复后六次平移峰值 5.1ms。该协议是预取完成后的桌面强制跨块，仍不能替代 Android 冷启动、长时间发热降频与实际行走验收。

最后生产构建 `npm run build` 通过，原有字体路径/PostCSS/Browserslist/包体积警告仍在。最新 CPU4 压力样本 `.check/performance-liquid-return-final-cpu4.json` 记录 L4/L5/L8/L105/L106 的稳态 CPU P90 为 22.2/14.8/14.7/24.8/25.6ms，帧间隔 P90 为 25.0/16.7/16.7/25.0/25.1ms，0 runtimeDiagnostics。加载渲染峰值仍达 193.4/202.1/189.5/55.5/186.7ms，当前不能宣布整体性能目标达成。不同轮次受到冷缓存和系统负载影响，以上为最终代码的一次压力样本，不替代受控真机 A/B。

稳态 CPU 采样 `.check/cpu-profile-l106.json` 与绘制归集 `.check/performance-l106-current-draws-cpu4.json` 显示，剩余开销主要在 Three 的绘制提交（setProgram / renderBufferDirect / VAO / uniforms），而非 updateNpcs 或 engine.update；静态家具批次仍有较多材质绘制。后续应据实际 Android GPU/CPU 采样决定是否进一步合并兼容材质，不能仅用桌面 GPU 或更低画质推断真机目标完成。

## 2026-09-27 据点颜色合批与刚性物品合批

`staticColors.ts` 在有限地图已有的空间分组内，将只有漫反射颜色不同的 Basic/Lambert 静态材质合并为顶点颜色。其它材质状态、纹理、发光、阴影和图层必须一致；透明、自定义 shader、材质动画元数据与特殊绘制状态排除。扫描和复制接入现有分帧构建，取消时释放中间缓冲；新材质随私有几何释放，原始交互/碰撞代理保留。

仅颜色合批的桌面 Chrome 153、960×540、CPU4 对照 `.check/static-colors-ab-cpu4.json`：

| 层级 | 绘制调用中位数（前→后） | 稳态 CPU P90（前→后） |
| --- | ---: | ---: |
| 105 | 204→152 | 28.1→25.8ms |
| 106 | 225→141 | 30.8→20.3ms |

该记录也包含一次 L4/L5 扩展试验：L4 绘制减少有限、可见三角形和 CPU 耗时增加，L5 几乎没有绘制收益，因此最终撤回无限层颜色合批，只保留有限地图入口。L4 普通几何复制继续使用 `cloneRenderGeometry`。这些是按先后顺序运行的压力样本，会受缓存、游戏时间与系统负载影响，不能直接换算为真机提速比例。

L4 绘制归集 `.check/l4-draw-distance.json` 进一步发现大量远处补给模型仍逐零件提交。`itemBatches.ts` 对杏仁水、腰果水、罐头、绷带、电池的地面/投掷模型按同一父节点和同一材质对象合并刚性叶子；保留贴图、法线、父变换、物品轮廓和透明拾取光环。重复的完整材质分组折叠为一次提交，已无引用的源几何释放；模型池继续复用成品。第一人称模型工厂不变。

物品前后整轮对照 `.check/item-batches-ab-cpu4.json` 中，L4 绘制调用 449→400，但 CPU P90 22.2→24.5ms；其它无相关物品的层级同样有耗时波动。因此补充同一冻结世界、每帧交换先后顺序的成对测量，避免不同轮次 NPC 位置与缓存状态改变结论。`.check/item-batches-pairs-cpu4.json` 中 L4 有 24 个相关物品、240 对样本，绘制调用中位数 447→400，绘制提交 CPU 中位数 15.4→14.0ms、P90 19.9→18.2ms；逐对差值中位数约 -1.0ms。L106 无相关物品，作为对照绘制均为 174，逐对差值约 0。该协议测量渲染提交开销，不包含正常游戏循环，也不代表可玩帧率。

验证记录：

- `scripts/check-static-colors.ts`：29 项颜色、缓冲顺序、状态隔离、取消与释放检查通过；`scripts/check-item-batches.ts`：29 项变换、材质分组、排除条件、重复调用与几何所有权检查通过。
- `.check/static-colors-modes-validation.json`：classic/realistic × L4/L5/L105/L106 × 有无阴影 × 12 视角，共 192 项通过。平均通道误差最大 0.000312，使用现有栅格化误差容限。
- `.check/static-batches-colors-final-validation.json`：17 个有限层、136 组最终原始模型/合批画面对照通过；`.check/static-colors-occlusion-validation.json`：161 项墙体遮挡检查通过。
- `.check/item-batches-validation.json`：5 类物品、两种光影、光环开关、8 姿态、阴影开关，共 320 组近景通过；平均通道误差最大 0.000747，最多 1 个邻域无法匹配的边缘像素。8,000 条拾取射线中 5,964 条命中，前后命中状态相同，最大距离差约 8.3e-9。
- `.check/performance-colors-items-final-checks.json`：最终基础/流程检查 123 + 38 项通过。上述浏览器验证和两种性能对照均为 0 runtimeDiagnostics。
- 最终 `npm run build` 通过；主包约 3,501.94kB（gzip 1,124.99kB）。现有字体路径、Browserslist、PostCSS 与包体积警告仍在。

目标设备暂按中端 Android 浏览器；以上仍为桌面 CPU 降速或桌面原速数据。当前没有 Android 真机结果，且剩余加载峰值与部分稳态 P90 仍超过 60Hz 预算，不能声称任何层级 90% 场景超过 60fps。

## 2026-09-27 地图连通计算与共享贴图重复上传

有限地图生成的 CPU 采样显示，连通搜索每访问一个格子就遍历全部结构，并重复构造碰撞盒。`generationObstacles.ts` 为单次搜索建立整数格遮挡快照；每个结构只计算一次碰撞盒，随后查询数组。地形修补或结构修改后的下一次搜索重新建立快照。碰撞盒两端闭区间、可开门占地的上界开区间、门覆盖其它阻挡的原有规则，以及楼层过滤均保留。运行时空间索引地图和非整数查询继续使用原查询。

`.check/mapgen-bfs-pairs-cpu4.json` 是同一浏览器、交替先后顺序、每层 4 个种子的纯同步 `generateLevel` 对照，不包含模型构建、GPU 上传或正常游戏循环：

| 层级 | 修改前耗时范围 | 修改后耗时范围 |
| --- | ---: | ---: |
| 12 | 990.7–1489.9ms | 10.1–30.7ms |
| 105 | 171.2–382.5ms | 2.3–11.4ms |
| 106 | 80.5–181.4ms | 17.1–44.1ms |
| 107 | 103.4–452.3ms | 1.1–6.6ms |
| 109 | 206.3–514.2ms | 6.5–12.3ms |
| 115 | 29.3–102.3ms | 2.4–22.8ms |
| 274 | 76.4–207.1ms | 9.1–16.2ms |

L101/L102 的生成入口提前返回，不经过这段搜索；同批对照中它们的耗时仍有 JIT、GC 和系统调度波动，不归因于本次优化。90 张完整地图（18 个有限层 × 5 个种子）的内容指纹与跨层可达数组和修改前一致，180 项检查通过，见 `.check/mapgen-bfs-equivalence.json`。对照固定时钟及随机源，只归一化实体全局 ID 起点；相对 ID、地图数组、物品、结构、NPC 等内容均参与指纹。`npm run check:generation-obstacles` 另有 11,527 项边界、楼层、随机标量对照与独立快照检查。

初次加载还发现物品工厂在每次复用共享贴图时重设过滤参数，渲染器随后按手机画质再次修改并标记上传。补给、手电筒、L2/L3 材质现统一使用已有的 `configureSurfaceTexture`，仅在颜色空间或目标过滤实际变化时标记更新，保留 UV、平铺、颜色图与数据图空间。

相同 L4 加载协议的 `.check/texture-upload-before.json` → `.check/texture-upload-after.json` 中，杏仁水图片上传 12→1 次、绷带 5→1 次、罐头 3→1 次、电池 2→1 次；场景内这些图片的首次上传仍保留。此结果证明消除了重复上传，不能推算成整体加载时间改善比例。

`verifier/texture-reuse.js` 经真实模型工厂及 WebGL 上传器验证：6 种物品、L2/L3、classic/realistic、低/中/高/返回低画质，64 组共 1,116 项检查通过。每组首次解码和上传后重复构建 6 次，贴图对象、Source、版本、颜色空间、UV 参数稳定，重复 GPU 上传为 0。记录为 `.check/texture-reuse-validation.json`，可用 `run-performance-cdp.mjs` 的 `textures` 模式复现。最终基础/流程检查为 123 + 38 项（`.check/performance-generation-textures-checks.json`），以上浏览器记录均无运行时或 WebGL 错误。

`npm run build` 通过，主包 3,502.50kB（gzip 1,125.38kB）；原有字体路径、Browserslist、PostCSS、动态导入与包体积警告仍在。以上按中端 Android 浏览器方向优化，但测量硬件仍为桌面 Chrome 的 CPU4 降速，尚无 Android 真机验收。

完整压力测试曾在 L12 等待 180 秒超时，前三层结果和失败原因保留于 `.check/performance-generation-textures-ungated-partial.json`。现场 CPU 采样 `.check/cpu-profile-pending-l12.json` 的主要调用链为 `engine.update → computeVisibility → los → structColliders`：测试页在场景构建、结构索引尚未启用时继续模拟，而正式 App 会等待场景就绪。测试页现对齐正式入口的单向暂停门控；未通过提前启用碰撞索引或降低就绪标准来绕过问题。

新协议 CPU4、960×540、每层 240 帧环视记录 `.check/performance-generation-textures-gated-cpu4.json` 完成全部七层，0 runtimeDiagnostics：

| 层级 | 稳态 CPU P90 | 帧间隔 P90 | 启动渲染 CPU 峰值 |
| --- | ---: | ---: | ---: |
| 12 | 8.7ms | 8.4ms | 147.1ms |
| 2 | 15.3ms | 16.7ms | 95.9ms |
| 3 | 13.1ms | 12.7ms | 91.4ms |
| 4 | 22.6ms | 25.0ms | 97.3ms |
| 105 | 20.0ms | 20.9ms | 179.7ms |
| 106 | 22.2ms | 20.9ms | 152.6ms |
| 109 | 24.1ms | 25.1ms | 122.4ms |

L12 的启动采样窗口约 4.6 秒；这反映测试协议已纠正，不能把超时→4.6 秒作为产品提速比例。新协议基础/流程回归再次通过 123 + 38 项，0 runtimeDiagnostics（`.check/performance-generation-textures-gated-checks.json`）。单张图片首次上传仍可产生长帧，L4/105/106/109 的稳态 P90 也超出 60Hz 预算；当前整体目标仍未完成。

## 2026-09-27 首次图片上传与临时位图释放

`textureImages.ts` 将文件贴图的上传源暂时改为从压缩 Blob 异步解码的 ImageBitmap，保留原分辨率、UV、颜色空间及过滤参数。直接执行 `createImageBitmap(HTMLImageElement)` 在当前浏览器仍有同步像素转换：杏仁水图片约 82ms；从 Blob 调用约 0.9ms 返回 Promise，解码约 36ms 后完成，见 `.check/texture-bitmap-pairs-cpu4.json` 与 `.check/texture-blob-bitmap-pairs-cpu4.json`。实现采用后者，未把原来的长帧简单移动到另一次同步转换。

位图仅作为上传暂存资源。首次 GPU 上传后立即关闭位图，并把同一个 Source 的数据恢复为原 HTML 图片，不增加贴图版本号；后续画质切换、资源回收后复用和新 WebGL 上下文仍有有效源。回收后的缓存贴图可再次异步准备；若绘制先完成上传或资源再次回收，迟到的解码结果直接释放，避免重复上传或复活过期状态。

解码并发为 2、等待队列最多 32 项；超大图片（按 RGBA 估算超过 16MiB）、不支持 ImageBitmap、失败或超过 5 秒的准备均回退原图片。尚未上传的位图按 RGBA 估算最多保留 64MiB，超出时恢复最早条目的原图片并关闭位图。这是暂存像素预算，不是进程总内存上限；浏览器自身图片缓存及正在解码的两个任务另计。

`.check/texture-image-loading-verified-pairs-cpu4.json` 在同一桌面 Chrome、960×540、CPU4 下，以 HTML→位图→位图→HTML 顺序分别重载 L4，使用相同的场景就绪门控。脚本在采样前断言解码能力开关，上传记录也分别确认 12 次 HTMLImageElement 或 ImageBitmap 上传：

| 路径 / 轮次 | 12 张图片上传累计 | 单次图片上传峰值 | 启动帧 CPU 峰值 |
| --- | ---: | ---: | ---: |
| HTML / 1 | 602.8ms | 101.2ms | 204.0ms |
| 位图 / 1 | 84.2ms | 21.7ms | 193.6ms |
| 位图 / 2 | 63.4ms | 13.4ms | 175.3ms |
| HTML / 2 | 644.0ms | 100.3ms | 196.0ms |

上传累计是同步 `texSubImage2D` 调用耗时之和，不是加载等待时间。其它模型构造、编译与绘制开销仍可造成长帧；不能按上传降幅推算总加载或稳态帧率增益。早期 `.check/texture-image-loading-pairs-cpu4.json` 的开关未生效，已标记 `validComparison: false`，四轮实际均为位图路径，不作为 A/B 证据。

验证记录：

- `npm run check:texture-images`：96 项检查通过，包含队列/并发、暂存预算、释放次数、原回调保留、回收复用、上传/取消竞态、失败、超时及迟到位图释放。
- `.check/texture-images-validation.json`：116 项检查，39 组实际 WebGL 画面对照逐像素一致，覆盖透明度、方向、SRGB/数据图、原分辨率、过滤切换、回收重传、平台回退及新上下文恢复。
- `.check/texture-bitmap-reuse-validation.json`：64 组、1,116 项模型共享贴图检查仍通过；重复创建不再上传已加载图片。
- `.check/performance-bitmap-checks.json`：123 + 38 项基础/交互流程检查通过；`.check/texture-bitmap-cancellation-validation.json`：8 项取消检查通过，63 个材质按预期释放。上述浏览器验证及有效完整加载对照均为 0 runtimeDiagnostics。
- `npm run build` 通过，主包 3,504.53kB（gzip 1,126.22kB）。原有字体路径、Browserslist、PostCSS、动态导入及包体积警告仍在。

这次修改减少首次上传的主线程阻塞，没有降低贴图清晰度。中端 Android 真机尚未验收，整体 90% 场景超过 60fps 的目标仍未完成；剩余模型/编译峰值和高负载稳态绘制需要继续处理。

## 2026-09-27 经典模式延迟粗糙度贴图

`l1Materials.ts`、`l2Materials.ts`、`l3Materials.ts`、`l4Materials.ts` 和 `settlementMeshes.ts` 的材质工厂现在只在 realistic 模式创建 roughness 贴图。classic 保留颜色贴图、法线贴图和原有画面；这项优化只覆盖这些工厂，不能称整个 App 没有 roughness 请求，因为 core/preload 可能仍会预取资源。

专项 verifier 覆盖 225 个表面变体×2 模式、8 类据点分区材质和地形缓冲，`verifier/material-textures.js` 通过 1160 项/450 组逐像素一致，并验证 classic 缓存；证据为 `.check/material-textures-validation.json`，runtimeDiagnostics 为 0，可用 runner 的 `materials` 模式重现。工厂专项实际请求为 classic 49 张，切换 realistic 后再新增 24 张；统计只覆盖这五个工厂。本轮未测整体 FPS 收益。

`npm run build` 已通过，主包 3504.66kB（gzip 1126.25kB），原有警告仍存在。桌面结果不能代表 Android 真机，也不宣称整体性能目标已完成。

## 2026-09-27 地面物品模型预编译

`modelWarmup.ts` 每帧最多推进一个 `compileSceneJob` 小批次并轮转队列，地面新模型准备完成后才显示；3m 内物品纳入初始就绪门控，模型池复用不重复预编译，投掷物仍即时显示。取消私有资源时等待已提交编译结束后释放。

`npm run check:model-warmup` 通过 66 项；`.check/model-warmup-validation.json` 通过 210 项/48 组 classic/realistic 画面对照逐像素一致，覆盖首次显示无新 program、拾取、池复用和真实编译取消。另有 `.check/performance-model-warmup-checks.json` 的基础 123 + 流程 38 项，以及 `.check/model-warmup-cancellation-validation.json` 的取消 8 项/63 材质；均为 0 runtimeDiagnostics。

四轮 CPU4、960×540、分别重新加载 L4 的交替对照见 `.check/model-warmup-loading-pairs-cpu4.json`。关闭队列时恢复物品立即绘制，其余画质、位图上传和场景就绪协议相同：

| 队列 / 轮次 | 物品编译结果查询累计 | 单次查询峰值 | 首帧渲染 CPU |
| --- | ---: | ---: | ---: |
| 关闭 / 1 | 108.1ms | 17.9ms | 156.7ms |
| 开启 / 1 | 14.4ms | 4.4ms | 81.8ms |
| 开启 / 2 | 13.8ms | 4.4ms | 84.7ms |
| 关闭 / 2 | 102.2ms | 19.1ms | 187.0ms |

查询累计指地面物品首次绘制触发的同步 `getProgramInfoLog`，每轮 35 个新模型、结束时无剩余队列、0 runtimeDiagnostics。这是驱动查询与首帧样本，不代表整体加载或稳态 FPS 提升；启动采样窗口在 23.7–41 秒间波动，不作为总加载时间缩短的证据。新出现的地面模型会等待几帧准备，结构构造仍可能产生长帧。

`.check/performance-all-levels-model-warmup.json` 在同一渲染器中依次完成 30 个层级的加载及每层 240 帧环视，0 runtimeDiagnostics。该次为桌面 CPU1、960×540，稳态 CPU P90 为 0.9–5.8ms，启动 CPU 峰值仍达 84.7ms；它验证跨层就绪和绘制流程，不代表中端 Android 或各层全部场景达标。最终 `npm run build` 通过，主包 3,505.43kB（gzip 1,126.53kB），原有警告仍在。
## 2026-09-27 拾取光环与 L4 分帧合批

拾取光环是透明无厚度平面环，材质启用 `forceSinglePass` 后每个可见光环少一次绘制。`.check/halo-pass-validation.json` 通过 688 项/336 组前后画面对照，像素差为 0；CPU4、960×540、冻结 L4 场景 240 帧交替样本（`.check/halo-pass-pairs-cpu4.json`）中，35 个模型可见光环减少 13 draw，绘制数量 475→462，`three.render` CPU P50/P90 为 17.5/22.6→16.4/19.9ms。该结果不是 Android 或整体 FPS 证明。

`batchL4StaticJob` 按模型复制和材质合并步骤暂停，临时几何由 job 管理，完成后才发布，取消时清理。`check:l4-batch-job` 通过 856 项、36 个暂停点和 957 个临时几何；`.check/l4-batch-job-validation.json` 通过 250 项/128 组双光影阴影视图一致。同步合批峰值 55.4ms，分帧样本单步峰值 4.8ms，不代表整体帧保证。

四轮 CPU4 fresh L4 样本显示同步/分帧交替中 renderer 超过 50ms 的帧为 9/4/1/9，启动 CPU P90 为 22.1/19.5/19.9/21.8ms，25 区块窗口为 22.7/30.3/30.4/22.3 秒；这是平滑度换吞吐的样本，不能称总加载变快，`chunkBudget` 仍可调。基础 123 + 流程 38 检查为 0 diagnostics；跨块验证仍有 L8 单帧异常，原因未归因。最终 `npm run build` 已通过，主包 3,505.73kB（gzip 1,126.66kB）；原有字体路径、Browserslist、PostCSS、L11 动态导入与包体积警告仍在。混合序列复测仍显示偶发首次着色器使用停顿，未解决，也不宣称性能验收通过。

补充诊断：加入 `sourceDisposals=0` 断言后，`check:l4-batch-job` 仍通过 856 项/36 个暂停点/957 个临时几何。后续混合跨块序列曾出现 124.1ms，其中 `gl.getProgramInfoLog` 为 110.4ms；热缓存复测没有同类长帧。fresh renderer 记录 42.4ms，其中 36.1ms 为程序查询，位置在新区块首次上传的 Points/Lambert；程序 profile 显示实际程序 `cacheKey` 与预编译记录一致，不能称为新编译参数错误或已修复 470ms。该首次着色器使用长帧仍未归因。

`.check/l4-step-cap-profile-cpu4.json` 的 2374 帧中仅 31 帧触及 64 步上限，因此未修改步数上限。最终混合序列复测仍保留首次着色器使用停顿限制。

## 2026-09-27 异步预编译等待全部程序版本

Three 0.185 的 `compileAsync` 只轮询材质的 `currentProgram`；同一透明双面材质的正/背面程序，以及普通 Mesh 与 InstancedMesh 共享材质时，可能漏掉先提交的版本。`programCompletion.ts` 在提交后读取公开 `renderer.info.programs` 快照，使用 `KHR_parallel_shader_compile` 等待每个程序完成；按 renderer/program 复用单个轮询器并缓存完成状态，后续提交不进入较早快照。无扩展时保留原有 fallback。

`.check/compile-variants-validation.json` 在真实 WebGL 程序中人为延迟第一个程序的完成状态，以确定性复现顺序竞态；覆盖 classic/realistic × 两类对象共 4 例。旧路径提前结束并遗漏程序版本，新路径全部等待；共 60 项检查、24 组画面对照逐像素一致、0 runtimeDiagnostics，并覆盖取消后的材质/renderer 资源等待与单次释放。`check:program-completion` 通过 54 项，`check:model-warmup` 通过 66 项。

这项修改确认并修复了已提交程序版本的等待竞态，不能据此解释或宣称解决此前 470ms/124ms 事件，也没有整体 FPS 提升结论。

L8 四轮 CPU4、960×540、全新页面的跨块样本记录于 `.check/variant-loading-pairs-cpu4.json`，每轮 6 次强制跨块、共 24 次且 0 diagnostics。原检查→新检查→新检查→原检查的自然时序中，预编译程序首次使用未完成计数均为 0；renderer 超过 50ms 的帧为 11/3/0/2，峰值 149.3/68.3/47.9/53.5ms。页面使用同一隔离 Chrome 进程并禁用 GPU shader 磁盘缓存，但驱动/进程内缓存仍可能命中；这些样本只显示波动，不能将总帧变化归因于本修复或宣称 FPS 改善。

`.check/performance-all-levels-program-completion.json` 已在正式 renderer 完成 30 层加载及每层 240 帧环视，CPU1、960×540、0 runtimeDiagnostics；稳态 CPU P90 为 1.5–7.3ms，启动峰值 96.9ms。该记录只验证功能与跨层流程，不代表 Android 达标。`.check/program-completion-checks.json` 为基础/交互 123 + 38，`.check/program-completion-models.json` 为 183 项/48 组像素一致，检查数随帧数变化，不能与旧 210 项横比；取消记录为 8 项/63 材质，均为 0 diagnostics。最终 `npm run build` 已退出 0：2023 modules，主包 3,506.37kB（gzip 1,126.90kB）；原有警告仍在。此前偶发的程序首次使用停顿不能宣称全部解决，整体 90% 场景超过 60fps 与 Android 真机仍未验收。

## 2026-09-27 L9 平面玻璃单次双面绘制

建筑玻璃共享材质增加平面/实体两个缓存：house 上层 `PlaneGeometry` 使用 `forceSinglePass`，`l9window` 的 `BoxGeometry` 保持默认双面两次绘制；视觉参数、透明排序和实体窗行为不变。

`.check/architectural-glass-final-validation.json` 的 verifier 通过 613 项、256 组逐像素差 0、0 runtimeDiagnostics，runner 模式为 `glass`。覆盖 20 种住宅×2 光影模式、镜像、两侧观察及重叠平面；所有共享材质参数仍一致，仅平面材质的 `forceSinglePass` 不同。CPU4、960×540、同一冻结 L9 场景 240 帧交替 360°环视中，155 个平面窗的 draw 中位数 773→743，`three.render` CPU P50/P90 为 57.7/109.5→53.5/97ms，证据见 `.check/architectural-glass-pairs-cpu4.json`；这是配对绘制样本，不是 Android/FPS 保证。

正式 renderer 的 L9 CPU4 加载及 240 帧环视也完成且 0 diagnostics：活动窗口 23 块、测试准备 145.9 秒、启动 CPU 峰值 585.2ms、稳态 CPU P90 79.9ms，见 `.check/l9-glass-full-cpu4.json`。完整窗口准备时间不等于正式 App 可开始操作时间；此前 180 秒超时与本次缓存时序不同，不能据此宣称加载提速。中端 Android 真机与整体性能目标仍未验收。

`.check/architectural-glass-regressions.json` 的基础 123 + 交互流程 38 项通过，0 runtimeDiagnostics。最终 `npm run build` 退出 0：2023 modules，主包 3,506.42kB（gzip 1,126.96kB）；原有字体路径、Browserslist、PostCSS、L11 导入和包体积警告仍在。

此前曾有尚未接入正式 renderer 的 L9 颜色合批试验；该候选后来已接入并由下方专项记录验证。音频专项测量未复现先前方法插桩记录的高耗时，本轮未改音频。
## 2026-09-27 通用静态合批分帧与入场预算

`renderer.ts` 中的 6 处原同步批处理改为委托 `staticBatch.ts` 的 `yield*` job，缓冲、材质和次序保持不变；暂存输出在完成后发布，取消时清理私有 geometry/instances，不释放源资源。Node `check:static-batch-job` 通过 11621 checks、145 yields、1247 个取消几何、15 个 instances，`partialInstanceCancellation=true`、`sourceDisposals=0`；浏览器 `.check/static-batch-job-validation.json` 通过 10824 checks/384 pixel comparisons，maxDelta 0、diagnostics 0。

`.check/performance-all-levels-static-job.json` 完成 CPU1、30 层每层 240 帧环视，0 diagnostics；稳态 CPU P90 为 0.9–5.2ms，startup 峰值 98.2ms，仅作为功能/跨层证据。CPU4 L9 旧 batch 峰值 143.5ms，新 job 单步峰值 2.9ms，但 terrain 等整体构造仍有长帧。四轮 2ms 预算交替中 renderer 超过 50ms 的帧为 41/26/29/48，near-ready 为 7.51/10.78/13.41/9.24 秒，不能称整帧达标或加载更快。

新增入场预算范围为 1–8ms、步长 0.5，默认 desktop 6ms/mobile 4ms；四个预设为 performance 4、balanced 6、immersive 8、mobile 4，游玩预算 mobile 仍为 1.5ms。`.check/loading-budget-pairs-cpu4.json` 中入场 2/4/4/2ms、游玩均 2ms，near-ready 11.232/8.071/9.044/10.072 秒，full window 62.626/58.778/62.241/61.469 秒，0 diagnostics；只说明附近就绪预算可调，不能推出全窗口或整体 FPS 结论。

`.check/loading-budget-validation.json` 通过 13 项并包含真实 React Slider 交互；`static-job-regressions.json` 基础 123 + 流程 38，`static-job-cancellation.json` 取消 8/63 材质，均 0 diagnostics。最终 `npm run build` 已退出 0：2024 modules，主包 3,507.64kB（gzip 1,127.16kB）；原有字体路径、Browserslist、PostCSS、L11 导入和包体积警告仍在。Android 真机与 90% 场景超过 60fps 仍未验收。

## 2026-09-27 L9 外部颜色合批

正式 renderer 仅对 L9 `exteriorBatch` 使用既有 `batchStaticColorsJob`；先加入 chunk 私有组以便取消收集，室内、交互对象和其他层保持原路径。

`.check/l9-colors-validation.json` 通过 103 项/96 组（classic/realistic × 阴影开关 × 24 视角），0 runtimeDiagnostics。classic 少量通道存在差异，最大差 55、单图最多 6 个通道超过 8、最大平均差 0.00007475；realistic 最大差 5、无通道超过 8、平均最大差 0.00000627，不能写成逐像素完全一致。复现前先运行 `node .check/prepare-l9-color-baseline.mjs`，再打开 `/verifier/performance.html?l9ColorBaseline` 调用 `verifyL9Colors`。

取消验证 `.check/l9-color-cancellation-validation.json` 通过 5989 项：collecting 阶段 99 geometry/0 material，partly-merged 阶段 100/1，compiling 阶段 105/6；编译完成后才释放，每资源一次，源材质释放为 0，正常 L9 后续就绪 0 diagnostics。

CPU4、960×540、active 2ms/loading 4ms 的四轮 fresh page 交替记录于 `.check/l9-color-loading-pairs-cpu4.json`：draw P50 为 651/536/536/651，CPU P90 为 29.2/24.5/23.1/29.6ms；near-ready 为 7.695/7.941/7.815/7.826 秒，全窗口为 54.949/54.251/49.037/55.779 秒，startup 峰值为 162.7/131.5/137.7/135.0ms，0 diagnostics。该结果支持绘制稳态 CPU 降低，不说明入场等待减少或整体 60fps，也不是 Android 结论。

## 2026-09-27 无限地图地形切片内部恢复分帧

无限地图此前对每个 4 行切片调用同步 `buildTerrain`，会一次耗尽底层生成器。现在直接 `yield* buildTerrainJob`，使瓦片和材质阶段的暂停点也受到区块预算控制；切片边界、参数、顺序和最终合批保持不变。L4 专用构造函数仍有同步工作，L8/L11 的专用生成器保持原路径。

`verifier/infinite-terrain-job.js` 对 L0/1/2/3/5/6/7/9/10、classic/realistic、每层两个附近区块共 36 组切片进行同步/分帧对照，90 项通过，全部几何缓冲、实例矩阵、层级顺序和材质参数一致，0 diagnostics（`.check/infinite-terrain-job-validation.json`）。可用 runner 的 `infiniteterrain` 模式复现。

CPU4 L9 诊断 `.check/builder-profile-terrain-job-l9-cpu4.json` 中，9763 个地形步骤的最大单步为 27.3ms；此前同步切片样本最大 104.1ms。两次并非同页配对，不能据此计算总加载提升比例。新诊断的结构构造峰值仍为 42.5ms、编译步骤 17.6ms、完整 renderer 帧峰值 99.9ms；该采样不能宣称消除长帧或达到 60fps。

最终正式 renderer 验证（含上述三项改动）：

- `.check/performance-all-levels-terrain-color-final.json`：CPU1、960×540，30 层加载及每层 240 帧环视，0 runtimeDiagnostics。稳态 CPU P90 为 0.9–5.5ms，启动 CPU 峰值 96.6ms；仅作功能与跨层回归，不能代表 Android。
- `.check/final-streaming-validation.json`：基础 123、交互流程 38、真实设置交互及预算切换 13、L9 取消检查 7279 项，0 diagnostics。三个取消阶段的几何/私有材质数仍为 99/0、100/1、105/6；增加的检查数来自地形暂停点，不能视为性能提升。
- 最终 `npm run build` 退出 0：2024 modules，主包 3,507.60kB（gzip 1,127.11kB）。原有字体路径、Browserslist、PostCSS、L11 导入和包体积警告仍在。

目标设备暂按中端 Android 浏览器，真机与“各层级 90% 场景超过 60fps”仍未验收；模型单次构造、首次程序使用及高负载稳态仍有继续优化的空间。
## 2026-09-27 L9 实体玻璃固定正反面材质

L9 外部实体玻璃使用共享的固定 `BackSide`/`FrontSide` 材质，同一 Mesh 保留背后再正面的两个完整 geometry groups，继续执行两次绘制，避免 Three 每帧切换材质导致 `material.version` 变化；反射设置遍历材质数组，其他玻璃路径保持不变。

验证记录：guard `.check/glass-pass-guards-validation.json` 通过 21 项；`.check/glass-passes-validation.json` 通过 1173 项、144 组画面对照逐像素一致、48 条射线全交点一致，`baselineVersionChanges=8112`、新材质版本不变、0 diagnostics，可用 runner `glasspasses` 模式重现。`.check/glass-pass-streaming-validation.json` 的基础 123、流程 38、设置 13、取消 7280 项也通过；取消三阶段 geometry/material 仍为 99/0、100/1、105/6，并通过共享玻璃材质 dispose=0 与 compiling 阶段持有 pair 断言，0 diagnostics。

正式冻结 L9 的 188 个 mesh、240 对、CPU4/960×540 样本 `.check/glass-pass-pairs-cpu4.json`：原/新 CPU P50 为 17/14.6ms，P90 为 20.5/18.0ms，draw P50 均为 474，0 diagnostics。这只支持绘制调用内 CPU 改善。fresh 正式 L9 样本 `.check/l9-glass-passes-full-cpu4.json` 为 240 帧、draw 536、CPU P90 25.5ms、frame P90 25.1ms、startup CPU max 130.7ms、0 runtimeDiagnostics；场景不同，不能与冻结对照混比，也不能声称整体 FPS 或 Android 达标。

`npm run build` 已完成并退出 0：2025 modules，主包 3,508.37kB（gzip 1,127.31kB）；原有警告仍在。中端 Android 与 90% 场景超过 60fps 尚未验收。

补充测量口径：旧 `.check/glass-pass-pairs-cpu4.json` 是固定相机方向的配对测量；`.check/glass-pass-rotation-pairs-cpu4.json` 才是真实渲染相机 360°环视，188 mesh/240 对、CPU4/960×540，原/新 CPU P50 为 16.8/14.7ms、P90 为 21.5/18.3ms，draw 中位数均为 536，0 diagnostics。环视直接旋转 render camera，`applyView` 只更新引擎输入射线；两份都是冻结世界上的 direct `three.render`，不代替完整帧或 Android 验收。

`.check/static-culling-rotation-probe-cpu4.json` 仅是尚未接入正式 renderer 的整体包围盒视锥裁剪候选：46 组/1590 节点、24 画面像素一致，240 对环视 CPU P90 17.2→16.9ms、draw P50 536→530，收益较小，未改变正式裁剪行为。
## 2026-09-27 L9 静态实例颜色合批

正式 renderer 仅在 L9 `exteriorBatch` 的普通颜色合批后执行 `batchStaticInstanceColorsJob`。只有几何字节完全相同、除漫反射颜色外材质与渲染状态一致的已有实例组会合并，颜色写入 `instanceColor`；`geometryDataKey` 仅作候选键，随后逐字节核对，避免量化误合并。job 每 32 个实例提供一次暂停点，由区块预算决定是否延到下一帧，完成后原子发布，取消时清理私有 geometry/instance，源共享材质保持不释放。

`check:instance-colors` 通过 747 项、9 个取消点、5 个临时 geometry/instance 回收和 8 个 yields。`.check/instance-colors-validation.json` 通过 325 项/96 画面/30 射线：classic 最大差 6、最多 6 个通道、平均最大差 0.00000771605；realistic 最大差 5、最多 5 个通道、平均最大差 0.00000530479；均无通道差超过 8，0 diagnostics，不能称逐像素完全相同。复现先运行 `node .check/prepare-instance-color-baseline.mjs`，打开 `/verifier/performance.html?instanceColorBaseline`，再运行 runner `instancecolors`。

`.check/instance-color-streaming-validation.json` 通过基础 123、流程 38、设置 13、取消 9576 项。collecting/partly-merged/instance-merged/compiling 四阶段 geometry/material/instance 分别为 99/0/24、100/1/24、106/7/25、106/7/25；compiling 异步任务 settle 后释放，各资源一次，共享材质释放为 0，0 diagnostics。

四轮 CPU4/960×540/seed424242、active 2ms/loading 4ms、全新页面按关闭/开启/开启/关闭实例颜色合批交替，每轮 240 帧，记录于 `.check/instance-color-loading-pairs-cpu4.json`。draw P50 为 536/473/474/550，CPU P90 为 22.1/18.7/21.2/22.1ms，frame P90 为 25/20.9/21/21ms；near-ready 为 7.268/7.822/7.722/7.478 秒，全窗口为 57.583/49.815/58.294/48.096 秒，startup CPU max 为 89.6/70.9/89.5/74.7ms，全部 0 diagnostics。样本支持绘制开销降低，不说明初始等待缩短或整体 60fps 达标；动态模拟和缓存会造成波动。

最终 `npm run build` 已退出 0：2026 modules，主包 3,511.79kB（gzip 1,128.21kB）；原有字体路径、Browserslist、PostCSS、L11 导入和包体积警告仍在。Android 真机与整体性能目标尚未验收。
## 2026-09-27 手电首次出现与跨层开关预热

renderer 将 `vmFlash` 贴图初始化、异步材质编译和分批零 `drawRange` 缓冲上传纳入加载就绪门控，跨层及光影特征变化时重新预热。手电 `castShadow` 固定跟随阴影设置；游戏内关灯、电池耗尽和受干扰只改变强度与模型显隐。初次加载会初始化有效阴影贴图与投影，游戏内关灯不绘制手电阴影。`sceneWarmup.ts` 可预热实际手电深度材质，保留其他灯的阴影标志，并标记下一次实际照明帧刷新阴影。

同流程桌面 Chrome、CPU4、960×540、classic/8 灯、手电阴影开启、active 2ms/loading 4ms、seed 424242 的首次开灯 CPU 样本：L0 737.1→10.8ms，L2 244.5→17.6ms，L9 1825.5→22.6ms；修复前 shader link 为 12/5/14 次，最终首次开灯均为 0，`bufferData`/`texImage2D` 均为 0。证据为 `.check/flashlight-before.json` 与 `.check/flashlight-final-cpu4.json`。

`.check/flashlight-all.json` 覆盖 30 层、361 项；`.check/flashlight-modes.json` 覆盖 classic 无手电阴影 61 项、realistic 无手电阴影 51 项、realistic 手电阴影 97 项；scene warmup 22 项、shadow warmup 16 项、visual 13 项/12 组关灯像素对照差 0，均为 0 diagnostics。可在 `/verifier/performance.html` console 调用 `await (await import('/verifier/flashlight.js')).verifyFlashlight({levels:[0,2,9,103],shadows:true})`，另有 `/verifier/shadow-warmup.js` 的 `verifyShadowWarmup` 与 `/verifier/flashlight-visual.js` 的 `verifyFlashlightVisual`。

`.check/flashlight-final-checks.json`：基础回归 123 项、交互 38 项、加载取消 8 项通过；保持开灯从 L0 进入 L103、L1 的加载隐藏与首次显示检查通过，0 diagnostics。取消测试仅对有限场景的自有材质编译设置等待栅栏，避免把更早开始的手电预热误识别为场景编译。

最终 `npm run build` 退出 0：2026 modules，主包 3,513.41kB（gzip 1,128.65kB）；保留原有字体路径、Browserslist、PostCSS、L11 导入和包体积警告。

以上为桌面降速样本，不能代表 Android 真机、整体 60fps 达标或加载总时长改善。

## 2026-09-27 网页入口、区域光影与音频预热

网页入口增加纯 HTML/CSS 后室走廊加载页，支持减少动画、App 动态加载和入口模块失败重试；Google Fonts 不阻塞首屏。`.check/startup-validation.json` 通过 7 项，覆盖手机 390×844、桌面 1280×720、加载页、减少动画、App 下载失败重试和入口模块失败回退。

区域光影保持各层固定的太阳、花园和场景灯阴影槽位，只按区域与光源调整强度和刷新，避免材质程序与手电预热 key 随区域状态改变。手电阴影视锥探测补入主相机视锥外但投影可见的物体，仍采用分批预上传。`.check/new-area-validation.json` 记录 shadow 20、scene 22、audio 7，0 diagnostics；`.check/area-lighting-results.json` 通过 255 项，覆盖 L7 实际下潜、L1 花园/停车分区和点光池 dim/absent/restored，首次手电切换 shader links 均为 0，停用点光阴影画面一致。

区域水体桌面 Chrome CPU4、960×540、seed 424242、active 2ms/loading 4ms、手电与太阳阴影开启的同流程前后记录见 `.check/region-water-before.json` 和 `.check/region-water-final.json`：classic L7 坠水序列峰值 31.9→16.2ms，首次 wet 帧 31.9→15.0ms；realistic 序列峰值 1911.3→27.7ms，首次 wet 帧 24.0→11.7ms，整段 shader links 20→0。1911.3ms 位于坠落出门、阳光开始启用的帧，不能写成首次 wet 帧；muted 音频测量也不能单独归因于音频缓存。强制跨 32m 的 L9 生成仍有 162.2ms 长帧，因此区块生成并未全部解决。

AudioContext 现在复用同一上下文的一秒白噪声 PCM，仍为每次播放创建独立 source。Android 真机与整体 60fps 目标仍未验收。

最终 `.check/area-final-regressions.json` 通过 classic 无手电阴影 61、realistic 无手电阴影 61、realistic 有手电阴影 109、scene 22、shadow 20、visual 13（12 组像素对照差 0）、基础 123、交互 38、取消 8、跨层 218，均为 0 diagnostics。


本轮构建已退出 0：2028 modules，入口 233.36kB（gzip 75.10kB），App 3,273.82kB（gzip 1,051.66kB）；原有字体路径、Browserslist、PostCSS、L11 混合导入和包体积警告仍在。生产版 `http://127.0.0.1:3002/` 已通过相同 7 项启动验证，覆盖 Vite 生成且无 id 的入口 module script 失败回退；证据为 `.check/startup-production-validation.json`，截图为 `startup-production-mobile.png`、`startup-production-desktop.png`、`startup-production-ready.png`。



## 2026-09-27 层级标题与附近场景就绪同步

`LevelIntro` 保留黑底层级号、中文名、风味文本和 seed 的原有顺序，完整逐字显示至少 2.4 秒；长文本在最后一个字符出现后再停 300ms。减少动画时完整文本至少展示 600ms，仍等待 `nearWorldReady`，随后淡出 240ms；点击不会跳过最低展示时间或加载门控。字符、扫描线和等待状态使用 CSS `opacity`/`transform`，不再逐字更新 React state；原黑色加载提示移入标题卡，就绪提示不依赖 HUD 刷新率。

App 在标题卡 presenting/exiting 以及 Cutscene 切出/切入期间暂缓 engine/world 渲染；完整展示后的 holding 阶段继续分帧准备。Cutscene 持有目的地标题卡直到 ready，每次切换使用唯一 key 取消旧动画。该调度以顺滑优先，错开演出与重构建，不能据此宣称加载总时长缩短。

`.check/level-intro-validation-cpu4.json` 通过 24 项，Chrome CPU4、844×390、HUD 5Hz、0 diagnostics，覆盖原 19 项、opacity/transform 动画属性、L0→L1、有限据点 L103、切层替换目标及展示中触发新切层。presenting/exiting 阶段 renderer 调用计数为 0，holding 阶段持续构建。headless 浏览器未返回 compositing 目标层（compositing:null），不能写成已验证 GPU 合成或绝对无卡顿。rAF 样本中 presenting 有 2 帧超过 50ms、最大 62.5ms；title-exiting 最大 8.4ms、cut-out 最大 33.3ms、cut-in 最大 9.8ms，这些不是 GPU 呈现或真机 FPS 结论。最终 `npm run build` 已退出 0：2029 modules，入口 233.36kB（gzip 75.10kB），App 3,276.75kB（gzip 1,052.66kB），App CSS 28.23kB（gzip 6.15kB）；原有字体路径、Browserslist、PostCSS、L11 混合导入和大包警告仍在。生产版 `.check/level-intro-production.json` 通过 6 项、0 diagnostics，覆盖打包 CSS 逐字全文/等待动画、L0→L1 持有标题到 ready、无第二个纯加载屏、动画期间 0 renderer 调用及完成后可操作。



## 2026-09-27 层级标题主题与字体裁剪

`levelTitleTheme.ts` 为 30 个层级和据点提供视觉主题，L0 与未知层级继续使用默认主题。`LevelIntro` 和 `Cutscene` 共享字体、色彩与装饰；App 传入内部 `levelId`，未知目的地会在 `intro` 事件中补全实际 id/name，不重置既有过场、状态机或计时。CSS 新特效只使用 `opacity`/`transform`，减少动画时关闭，原有加载门控和动画阶段暂停场景构建保持。

两个 OFL 字体裁剪为 `title-wide.woff2`（104132 bytes）和 `title-hand.woff2`（34976 bytes），合计 139108 bytes，按需请求；许可证见 `public/fonts/title-fonts-LICENSE.txt`。其他 serif/system 字体继续使用现有或系统回退，不宣称 Android 字体逐像素一致。需要重现字体裁剪时使用 `python scripts/subset-title-fonts.py`，环境需提供 fonttools/brotli。

`.check/title-theme-validation.json` 通过 113 项、30 层、0 diagnostics，覆盖 L0 intro/cut 逐像素对照、844×390 全层布局与减少动画、390×844 代表层、未知回退、动画属性和字体请求；预览为 `verifier/title-themes.html`，截图为 `.check/title-theme-gallery.png`。`npm run build` 已退出 0：2032 modules，App 3278.51kB（gzip 1053.30kB），App CSS 39.77kB（gzip 8.30kB），入口 233.36kB（gzip 75.10kB）；原有构建警告仍在。

.check/title-themed-flow-cpu4.json 通过 28 项、0 diagnostics（Chrome CPU4/844×390），覆盖实际 L1/医疗据点主题、未知目的地更新标题与主题但 DOM 不重挂，以及 presenting/exiting、cut out/in 阶段 0 renderer 调用。title-presenting 有 2 帧超过 50ms、最大 66.7ms，cut-out 有 1 帧超过 50ms、最大 54.3ms，不能宣称完全无卡顿或 Android/FPS 达标。

生产版 .check/title-theme-production.json 通过 8 项、0 diagnostics，覆盖实际字体资源加载、切层就绪、无第二加载屏和动画阶段暂停 world render；.check/title-theme-ui-compat.json 验证 8 种界面主题的字体/字重/字距一致，L0 保持原样。界面皮肤覆盖规则已调整为只提高非默认标题样式优先级。

