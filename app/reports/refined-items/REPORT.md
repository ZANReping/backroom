# 55 件物品模型导入验收

日期：2026-10-07。来源为用户提供的 backroom-refined-items.zip，见 [导入及许可记录](../../assets/refined-items/import/IMPORT.md) 和 [55 件清单](../../REFINED-ITEM-MODELS.md)。

## 交付

55 件全部接入 buildItemMesh(type, { halo })，使用包内参数化模型及四套颜色/法线/粗糙度图集；经典/真实光影走现有材质工厂。未新增运行时 OBJ 解析或其它依赖。扳手、木板调整竖持姿态；其它物品复用原默认握持。地面、投掷模型入口和拾取光环保持。

修复原包盘绳分段截面不一致造成的裂缝，以及未知 ID 的原型属性误分派。盘绳仍为 960 三角面/1 批次。未修改物品 ID、用途、数值、掉落或存档格式；修改仅限 app 与根说明，联机继续冻结。

55 个原始 OBJ、55 个 MTL 和对应贴图已保留，可在 Blender 中编辑；游戏运行时不加载这份来源副本。

## 检查结果

| 检查 | 结果 |
|---|---|
| check:refined-items | 2,084 项通过；55 件 × 两种材质模式 |
| 三角面/材质批次 | 每件最大 1,200/3；55 件合计 27,280 三角面、81 批次，不含光环 |
| UV/法线/几何 | 数值有限，法线归一化，无零面积三角形；UV 在有内缩的图集分区内；绳身无多余开放边 |
| 实例与贴图 | 实际 dispose 事件不释放其它实例或共享图集 |
| 贴图实载 | 经典加载 8 张图集，真实加载 12 张，尺寸/颜色空间正确，无 1×1 占位残留 |
| 单机交互 | [165 项通过](runtime.json)：逐件丢弃、准星识别、拾取；欢迎纸条仍进入文档而非背包 |
| 实际游戏模型 | 每种光影 [169 项](game-realistic.json)：全部 55 件地面模型、快捷栏切换、12 项手持缓存和 24 项地面池限制 |
| 既有回归 | check:six-items、check:item-batches（29）、check:texture-images（96）、check:model-warmup（66）通过 |
| 生产构建 | npm run build 通过；仍有现存字体路径、Browserslist、PostCSS 和大包提示 |

浏览器验证无未处理异常，见同目录 *-errors.json。欢迎纸条的初始验收断言曾错误地要求它进入背包；已根据其原有文档归档行为修正验证，未修改游戏逻辑。

展示页连续重建 8 次后：经典稳定为 81 几何/11 纹理/3 程序，真实为 81/15/3，包含环境图资源。实际 Level 0 连续 3 轮回收、重建 55 件并逐件切换手持后，经典稳定为 260/37/31，真实为 267/66/43，详见 [经典](game-classic.json)、[真实](game-realistic.json)。这些是固定场景总量，不能与只有模型的展示页直接比较。

## 视觉对照

以下均为真实 WebGL 截图；原包软件光栅预览另存为来源资料，不作为游戏截图。

| 视角 | 经典 | 真实 |
|---|---|---|
| 导入前总览 | [截图](before-classic-all.png) | [截图](before-realistic-all.png) |
| 导入后总览 | [截图](after-classic-all.png) | [截图](after-realistic-all.png) |
| 工具正/反/手持 | [正](after-classic-tools-front.png) · [反](after-classic-tools-back.png) · [手持](after-classic-tools-held.png) | [正](after-realistic-tools-front.png) · [反](after-realistic-tools-back.png) · [手持](after-realistic-tools-held.png) |
| 装备正/反/手持 | [正](after-classic-gear-front.png) · [反](after-classic-gear-back.png) · [手持](after-classic-gear-held.png) | [正](after-realistic-gear-front.png) · [反](after-realistic-gear-back.png) · [手持](after-realistic-gear-held.png) |
| 食物正/反/手持 | [正](after-classic-food-front.png) · [反](after-classic-food-back.png) · [手持](after-classic-food-held.png) | [正](after-realistic-food-front.png) · [反](after-realistic-food-back.png) · [手持](after-realistic-food-held.png) |
| 纸物糖果正/反/手持 | [正](after-classic-paper-front.png) · [反](after-classic-paper-back.png) · [手持](after-classic-paper-held.png) | [正](after-realistic-paper-front.png) · [反](after-realistic-paper-back.png) · [手持](after-realistic-paper-held.png) |
| 暗处手电 | [截图](after-classic-torch.png) | [截图](after-realistic-torch.png) |
| Level 0 实景与管钳 | [截图](game-classic-wrench.png) | [截图](game-realistic-wrench.png) |
| Level 0 木板 | [截图](game-classic-timber.png) | [截图](game-realistic-timber.png) |
| Level 0 透明水瓶 | [截图](game-classic-citywater.png) | [截图](game-realistic-citywater.png) |

保留原包低多边形外形与贴图风格。标签和纸面正常显示，无缺图或明显图集串色；盘绳接缝已修正。金属高光和玻璃在实际黄室灯光下比展示页更暗，属于场景受光差别，没有新增物品补光。小物件细字远处不可读，透明壳不使用真实折射。

## 性能

设备：Windows、RTX 4060 Laptop、Chrome headless、ANGLE D3D11。渲染画幅 **1920×1080**，DPR 1，关闭动态分辨率。同一背景、灯光、环境图和布局，每种物品 10 件，共 **550 件**，不含光环、场景建筑和后处理。导入前使用保存的两个原工厂快照，不是旧模型估算值。

每种模式/版本各 5 轮，每轮预热 30 帧、采样 120 帧。GPU 使用 EXT_disjoint_timer_query_webgl2，CPU 为 renderer.render() 时长。下表为五轮对应统计值的中位数，单位毫秒，原始逐轮记录同目录 before/after-<mode>-performance.json。

| 模式 | 版本 | 调用 | 三角面 | RAF 中位/P95 | CPU 中位/P95 | GPU 中位/P95 |
|---|---|---:|---:|---:|---:|---:|
| 经典 | 前 | 1,970 | 38,680 | 12.50 / 16.70 | 11.20 / 15.10 | 8.82 / 12.28 |
| 经典 | 后 | 810 | 272,800 | 4.20 / 4.30 | 3.00 / 3.70 | 1.80 / 2.45 |
| 真实 | 前 | 1,970 | 38,680 | 12.50 / 16.70 | 11.40 / 15.40 | 8.57 / 12.27 |
| 真实 | 后 | 810 | 272,800 | 4.20 / 8.30 | 4.10 / 5.50 | 2.71 / 3.93 |

绘制调用下降约 **58.9%**。后版本五轮最差 GPU P95：经典 2.87ms、真实 4.07ms。几何量和贴图占用增加，但合批减少了此场景的提交成本。

**首次构建代价增加**：同步创建 550 个全新实例，经典约 33.9→338.4ms、真实约 27.1→336.8ms；这是整批构建总耗时，不是稳态帧时间，也不是单件加载延迟。游戏继续使用原有逐帧创建预算、预热及有界缓存，没有将 550 件同时塞入正常场景。未宣称冷加载没有卡顿。

这是物品压力场景和指定 Level 0 的检查，不是全部层级性能验收，没有 Android 真机结论。headless RAF 节奏受浏览器调度影响，不应只据其数字推算显示器 FPS。

## 复现

在 app 中运行：

```powershell
npm run check:refined-items
npm run check:six-items
npm run check:item-batches
npm run check:texture-images
npm run check:model-warmup
npm run build
$env:L0_VERIFY='1'
npm run dev -- --host 127.0.0.1 --port 3007 --strictPort
```

手动查看 http://127.0.0.1:3007/verifier/refined-items.html?mode=realistic&atlas=tools 。atlas 支持 tools/gear/food/paper/all，追加 &held 查看握持，追加 &baseline 对照导入前。

自动验证使用专用 Chrome 配置和 CDP **9238**，不要连接正常浏览器。可用 REFINED_ITEM_URL、REFINED_ITEM_CDP 指定本机验证服务及专用浏览器。

```powershell
node scripts/verify-refined-items.mjs visuals realistic after
node scripts/verify-refined-items.mjs visuals classic after
node scripts/verify-refined-items.mjs visuals realistic before
node scripts/verify-refined-items.mjs visuals classic before
node scripts/verify-refined-items.mjs runtime
node scripts/verify-refined-items.mjs game realistic
node scripts/verify-refined-items.mjs game classic
node scripts/verify-refined-items.mjs bench realistic before
node scripts/verify-refined-items.mjs bench realistic after
node scripts/verify-refined-items.mjs bench classic before
node scripts/verify-refined-items.mjs bench classic after
```

game 复用隔离的 Level 0 验证页：展示种子 20261006、yellow 取景点，内存存储，不写正式存档。原图集保持导入原貌；生成器跨环境字节差异及当前模型 OBJ 导出方法见导入记录。

