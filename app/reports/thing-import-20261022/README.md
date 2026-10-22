# 七层之物接入验收 · 2026-10-22

**已完成**用户补充四阶段包的接入，主开发目录为 `E:\ZAN\backroom\app`。七层之物使用新模型、八段动画和配套机制，`thingmeat` 显示名改为“彼物之肉”。机制与来源见 [接入说明](../../THING-REMAKE.md)；最终机器记录见 [acceptance.json](acceptance.json)。

## 自动检查

| 命令 | 结果 |
| --- | --- |
| `npm run check:thing` | **56/56**：不可杀、真实近战计时、割肉、休眠、气味、焦油字、原点平移、非近战唤醒 |
| `npm run check:thing-anim` | **31/31**：八段动画、头颈连接、体节间距与 LOD |
| `npm run check:thing-integration` | **799/799**：有限数值／UV、两种材质模式、独立几何与材质、共享纹理保护、分帧／取消、动画原点平移 |
| `npm run check:l7-cliffs` | **20/20** |
| `npm run check:l7` | **2433/2433** |
| `npm run check:tiny` | **87/87** |
| `npm run check:melee` | **131/131** |
| `npm run check:entity-preparation` | **17/17** |
| `npm run check:entity-forms` | **252/252**，49 形态／10 父实体 |
| `npm run check:tiny-arms` | 退出码 0 |
| `npm run check:jerry` | **120/120** |
| `npm run check:item-batches` | **29/29** |
| `npm run check:refined-items` | **2050** 项通过，54 个静态细化物品，最高 980 三角形／3 批次 |
| `npm run check:texture-images` | **96/96** |
| `npm run build` | **通过** TypeScript 与生产构建 |

日志按命令保存在本目录的 `check-*.log` 和 [build.log](build.log)。原包的即时近战 fixture 已适配当前前摇命中、卡帧与冷却；保留原行为断言，追加垂直距离、真实近距脱追、流式原点及非近战伤害检查。

## 实际游戏与截图

使用真实 App，独立内存存档、世界种子 **424242**、**1920×1080**、固定画质／关闭动态分辨率。Chrome 实际启动参数为 `--headless=new`；WebGL 识别为 **NVIDIA GeForce RTX 4060 Laptop GPU / ANGLE D3D11**。每轮独立端口和浏览器资料，零运行时错误、零失败网络请求。

真实光影 [realistic-accepted/result.json](realistic-accepted/result.json) **26 项**、经典光影 [classic-final/result.json](classic-final/result.json) **25 项**通过。覆盖头部与躯干、实际扑咬片段、三次前摇刀击取得一份肉、物品食用、关灯静止并允许被推开后的持续脱追、惊逃片段、三平面海床、焦油字与回收。

| 取景 | 真实光影 | 经典光影 |
| --- | --- | --- |
| 头部近景 | [close.png](realistic-accepted/close.png) | [close.png](classic-final/close.png) |
| 下颌扑咬 | [bite.png](realistic-accepted/bite.png) | [bite.png](classic-final/bite.png) |
| 躯干与伤口 | [side.png](realistic-accepted/side.png) | [side.png](classic-final/side.png) |
| 三次刀击割肉 | [harvest.png](realistic-accepted/harvest.png) | [harvest.png](classic-final/harvest.png) |
| 关灯静止脱追 | [still.png](realistic-accepted/still.png) | [still.png](classic-final/still.png) |
| 海床 | [seabed.png](realistic-accepted/seabed.png) | [seabed.png](classic-final/seabed.png) |
| 贴合海床的焦油字 | [tar.png](realistic-accepted/tar.png) | [tar.png](classic-final/tar.png) |

头心初始世界坐标 **(−340, −240, −103.4554)**，面朝 +X。近景玩家 **(−328, −232, −104.2554)**，朝头心附近取景；精确相机算法和每一步参数保存在 [自动游戏脚本](../../verifier/thing-import-check.ts) 及各轮 JSON。

初轮截图发现气泡靠近相机时放大成整块矩形：[修复前](realistic-first/overview.png) → [修复后](realistic-accepted/overview.png)。最终使用屏幕尺寸上限、圆形柔边及近裁面淡出。开发过程中的 first／second／third／fourth 目录保留用于排错，最终验收以 accepted／classic-final 为准。

## 受控性能与回收

固定头部近景，等待区块及部位 LOD 准备完成后，连续 **5 轮、每轮 120 帧**。以下为五轮中位数的中位数，以及五轮 P95 的中位数；逐轮原值见 JSON。

| 模式 | 帧间隔中位数 | P95 | 样本 |
| --- | --- | --- | --- |
| 真实 | 4.10 ms | 5.20 ms | 600 |
| 经典 | 4.10 ms | 5.60 ms | 600 |

经典五轮记录另见 [classic-metrics/result.json](classic-metrics/result.json)。这是原生 GPU 无头浏览器的 `requestAnimationFrame` 间隔，不能作为 GPU 独立耗时或真实显示器持续帧率；本轮未做旧模型 A/B、全海域长时间压力或 Android 真机测试。没有将后处理最后一遍的 `renderer.info.render.calls` 当作全帧绘制调用。

同一窗口连续创建／移除第二只实体三轮，第一只始终保留：

- 真实模式每轮结束 **800/170、800/170、800/170**（几何／贴图数量）。
- 经典模式每轮结束 **685/145、685/145、685/145**。
- 两种模式切回 L4 后，七层之物场景模型均移除。本轮浏览器、服务和临时 profile 已清理；记录保存进程归属与清理结果。

## 复现与保留

```powershell
cd E:\ZAN\backroom\app
npm run verify:thing -- --label=repeat-realistic
npm run verify:thing -- --classic --label=repeat-classic
npm run verify:thing -- --classic --perf-only --label=repeat-classic-metrics
```

原文件备份及阶段合并记录位于 `.cache/thing-stage3-20261022`，包括共享模块、物品改名和根说明备份；补丁及原始参考永久保存在 [来源目录](../../assets/sources/thing-remake-20261022/SOURCE.json)。原包没有提供完整作者／许可、四张 AI 海床纹理的原始提示词，来源清单明确记录缺项，没有假定额外开源授权。

当前依赖与原有 npm 命令保持不变；[文件哈希](files.json)、[保留检查](preservation.json) 可核对。封闭的三份联机实现文件哈希与前轮最终基线一致；未更新联机、app-lite 或 GitHub 副本。
