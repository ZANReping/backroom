# 据点进入加载优化验收 · 2026-10-14

已优化 app 的据点进入流程。以下结果来自生产 Engine/Renderer 的真实无头 Chrome，不使用简化模型。截图对照见 [浏览报告](index.html)。

## 耗时

| 据点 | 首次进入：优化前 → 后 | 再次进入：优化前 → 后 | 首次缩短 |
|---|---:|---:|---:|
| Alpha 基地 | 46.27 → 6.68 秒 | 29.92 → 3.00 秒 | 86% |
| 商人之家 | 18.39 → 7.37 秒 | 10.58 → 1.74 秒 | 60% |
| Gemma 基地 | 5.24 → 4.28 秒 | 2.11 → 1.54 秒 | 18% |
| Omega 基地 | 3.60 → 2.79 秒 | 1.92 → 1.45 秒 | 23% |
| Tom 餐馆 | 3.88 → 2.78 秒 | 2.93 → 1.65 秒 | 28% |

配置：Chrome/154.0.8037.98，ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)；1920×1080、DPR 1、真实光照、中等纹理、100%细节、16盏灯、1盏场景阴影、手电阴影、AO与泛光开启；加载预算6ms、活动预算3ms。未降低画质或缩减场景。

计时从调用正常 enterOutpost 开始，到整张据点模型、近处 NPC、手电和 GPU 预热完成且首次完整画面已绘制为止，包含入口过渡的引擎时间。再次进入是在同一页面加载另一据点后返回。每个首次测试刷新页面、重建 Renderer；同次 Chrome 的磁盘/驱动缓存仍可复用，不能视为操作系统级完全冷启动。数值是一轮基线与最终复测；另一次优化复测在 optimized-1/ 中，首次 Alpha 6.70秒、商人之家8.73秒，首次驱动编译存在波动。

新开局种子424242、入口相机yaw/pitch为0。正常进入路径仍按游戏时间推导目的地图种子，实际mapSeed逐次保存在JSON；直接加载/资源循环使用固定mapSeed 424242。五个对比据点的结构、灯具、NPC、可见网格、实例及材质总数逐项相等。Alpha保留6825个结构、4657个网格、78507个实例、488盏灯与29个NPC。

## 改动与原因

- Alpha/Trade装饰的碰撞体使用随结构对象释放的WeakMap缓存。坐标、尺寸、类型、实心标记和data（含原地修改的数组）变动会重新计算，碰撞公式与部件保持一致。
- Alpha完成固体布局后立即启用空间索引，NPC选址和入口加载期间的视线检测不再遍历并重建整座基地的装饰碰撞体。Alpha地图生成从3.34秒降到0.079秒。
- 据点加载使用原有6ms预算处理更多轻量步骤，活动游戏仍保留原步数上限。
- 被加载遮罩覆盖时继续构建和预热，暂停无意义的场景及后处理绘制。首次完整画面仍在就绪后正常绘制，未提前开放操作。
- 据点着色器编译和GPU上传使用实际composer目标，避免普通画布与HDR路径重复准备。经典光照继续使用画布路径。

## 验证

- check:outpost-colliders：992项，覆盖91个Alpha和30个Trade原型、旋转及编辑失效。
- check:alpha：55163项；五个新版据点的通行、屋顶及服务可达检查通过。
- check:model-warmup：83项；check:program-completion：58项；TypeScript及生产构建通过。
- 真实光照测试五个代表据点的首次/再次进入与360°环视；经典光照测试全部16个现存据点（含Level 274）。
- 实际React游戏界面：从存档继续、Alpha/商人之家/Gemma进入、键盘行走、返程、Alpha存档刷新恢复，共11项通过。实际UI的Alpha首次完整场景4.70秒、可操作5.97秒；界面时间另含原有过场展示。
- 中途取消加载8项通过：909个已提交编译的材质在编译完成后各释放一次，取消的场景不发布，下一据点正常就绪。
- 三轮Alpha/Tom循环后，几何数166 → 166 → 166，纹理数131 → 132 → 132，未持续增长。
- 浏览器未捕获JS/着色器错误；网络记录包含验证页favicon.ico的404。已查看入口、环视及真实游戏截图，未见场景内容缺失。
- 独立动态端口、独立profile，命令行验证--headless=new。所有本次QA浏览器、服务器及profile均已清理，见cleanup-audit.json。

未验证移动设备或其他GPU的绝对耗时。首次驱动着色器编译仍有开销，本次没有更改NPC玩法、据点布局、存档格式、app-lite或联机实现。构建保留字体运行时解析、Browserslist、PostCSS及包体积等警告，详见static-checks.json。

## 复现命令

在app目录执行：

```powershell
npm run check:outpost-colliders
npm run check:alpha
npm run check:settlements
npm run check:model-warmup
npm run check:program-completion
npm run build
npm run verify:outpost-loading -- --label=final --transition --revisit --regressions --app
npm run verify:outpost-loading -- --label=classic-all --classic --levels=101,102,103,104,105,106,107,108,109,110,111,112,113,114,116,274
node scripts/summarize-outpost-loading.mjs
```

原始JSON及截图在baseline/、final/、classic-all/。baseline-profile/101.cpuprofile与optimized-profile/102.cpuprofile保留根因采样。当前代码上的重复运行不能重建修改前基线。
