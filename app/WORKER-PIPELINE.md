# Worker 分阶段迁移（2026-11-08）

当前落地目录：`E:\ZAN\backroom\app`。主线程继续拥有输入、React UI、游戏规则、碰撞、音频和存档。

## 已启用的运行路径

- **L1 / L5 / L11 探索开图**：共享纯数据视线求交器 `world/mapSightTrace.ts`。探索按最多 12.5 Hz 交给专用 Worker；小地图／大地图的视野扇形仍按当前视角同步计算，保留薄墙、多层、坐姿偏移和建筑多边形遮挡。
- 视野队列最多一个执行任务和一个最新候选。回包必须匹配地图、流式原点、布局修订和探索数组，旧地图结果不能污染新地图。游戏数组始终保留在主线程；静态遮挡数据复制给 Worker。
- **程序纹理**：留声机木材、黄铜、唱片、毡布和铭牌的原画刷提取到共享纯函数配方，在 OffscreenCanvas 2D 中绘制；返回可转移像素缓冲。PBR 高度转 OpenGL 法线及 L5 第二张物品图集的法线也在 Worker 内计算。
- 颜色、纹理规格、UV、mipmap、材质引用保持原实现；模型预热等待生成像素完成。共享贴图不会因一个模型回收而失效。
- **旅馆实体**：野兽、迎宾女郎、厨师的准备流程在专用 Worker 中生成原 SDF 几何，再传回属性、索引和包围体。骨骼绑定、动画、材质和实例仍沿用游戏实现。走近时的高细节 LOD 也异步准备，等待期间继续显示已有细节，避免同步生成。传输的是缓存数据的独立副本，活模型缓冲不会被 detach。
- 几何队列按实体／LOD 去重，最多八项；视野、像素和几何 Worker 均有上限、超时、失败回退及空闲释放。无 Worker / OffscreenCanvas 或创建失败时使用原同步／协作式路径。
- 同时消除了 L1 烘焙材质克隆时的 Canvas PNG 序列化，以及 L5 每帧查找空厨师污渍组时的整树递归。前者通过保留资源引用的材质克隆实现，后者按 Scene 缓存。

调试时可用 `?workerJobs=0` 关闭新计算 Worker；它保留这两项直接优化。严格改造前对照使用报告中的 `source-before` 源码和测量脚本的 `--before`。

## OffscreenCanvas 三维渲染试点

开发服务器地址：

- `/verifier/worker-render.html?level=1&mode=realistic`
- `/verifier/worker-render.html?level=5&mode=realistic`
- `/verifier/worker-render.html?level=11&mode=classic`

试点直接使用游戏的 `Engine`、`Renderer3D`、建筑、模型、材质、烘焙、镜面和后处理。主线程运行逻辑，独立渲染 Worker 从层级／种子描述构建自己的只读场景，接收精简世界坐标视角观察，独立处理流式原点变化，避免两个线程的窗口原点不同导致跳位。视角消息采用确认和合并，窗口尺寸与暂停显式传递，使用 Worker 自己的 requestAnimationFrame。

这是**渲染与平台依赖验证入口**，尚未替换正常游戏的三维后端。试点没有接管完整交互：场景修订、战斗／拾取反馈、资源就绪反向通知、手机拍照和切入方块截帧仍需定义正式状态接口。不能把试点当成可保存的正常游戏。正常游戏已经使用上面的计算 Worker 优化。

渲染 Worker 只在其作用域内安装旧 Canvas 画刷与准星输出适配器，文件图像用 ImageBitmap／OffscreenCanvas 解码。主界面的 DOM、输入与音频不迁移。画布必须在创建 WebGL 上下文之前转交；初始化失败后的主线程后端应使用新画布。

试点按原游戏路径验证了 L1 / L5 / L11，主动阻塞主线程 250 ms 时仍收到阻塞期间产生的 Worker 帧；也覆盖了缩放与销毁。该结果证明执行隔离，不等同于全部玩法迁移或普遍帧率提升。

## 验证与复现

在 `app` 下运行：

```powershell
npm run check:worker-pipeline
npm run check:worker-map-parity
npm run verify:worker-pipeline
npm run verify:worker-pipeline -- --classic
npm run verify:worker-pipeline -- --app --fallback --label=fallback
npm run measure:worker-pipeline -- --before --label=final-before-realistic
npm run measure:worker-pipeline -- --label=final-after-realistic
npm run build
```

实际 App 验收采用独立内存存储、独立 Vite 端口和无头 Chrome 配置，不触碰玩家存档。报告包含运行错误、Worker 统计、像素对照、蒙皮有限值、过期回包、截图和进程清理结果。

性能脚本在 RTX 4060 Laptop GPU、1920×1080、DPR 1、真实光影、16 场景灯、阴影／泛光开启、关闭动态分辨率下运行。种子为 `424242 + level`，固定随机序列。先完成加载及流式窗口修正，再双圈环视预热，最后采样五轮、每轮 120 帧，目标调度 60 Hz。分别记录逻辑／渲染 CPU、帧间隔、异步 GPU 计时、绘制调用和资源。CPU 采样器会增加诊断开销，数据用于相同协议下的对照。通用实体图鉴后台预热在两版静态场景测试中均关闭，首次模型准备另在实际 App 验证。

结果和限制见 [验收报告](reports/offscreen-20261108/README.md)。桌面无头测试不代表 Android 真机性能，也不能推导整个游戏已经稳定 60 FPS。

## 来源与资产

没有新增外部视觉资产；纹理配方和实体几何来自项目已有实现，画刷由共享函数复用，法线约定和原许可记录不变。

API 参考：[Three.js r185 离屏 Worker 示例](https://github.com/mrdoob/three.js/blob/r185/examples/webgl_worker_offscreencanvas.html)、[MDN 画布转交](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen)、[可转移对象](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)。
