# Object 70 v83 接入验收

2026-10-17。接入范围、外观阶段和许可见 [实现说明](../../OBJECT70-REMAKE.md)；包内原截图保存在 `source/`，不是本轮游戏验收结果。

## 实际游戏

完整生产 App 从真实标题页继续存档进入 Level 1，没有插入截图用尸体。种子／地图种子 `20261017`，自然生成尸体世界坐标 `(-10,-23)`，玩家 `(-9.5,-20.8,0)`，yaw `0`、pitch `-0.6848212459`，FOV `72`；1920×1080、DPR 1、真实光影、贴图质量 2、手电开启、主手收起。验证页将读写存储替换为页内 Map，不读写玩家存档。

- [改动前](before/closed.png)／[改动后](after/closed.png)
- [搜索中](after/searching.png)、[完成搜索与真实战利品面板](after/opened.png)
- [取空后读档](after/looted-restored.png)、[手持便当](after/bento.png)

[游戏运行结果](after/result.json) 中 **37 项**通过，覆盖 E 选择自然尸体、搜索动画、中断与重搜不重抽、开盖、取物、实际 v1 存读档、空容器不重复奖励、便当手持与食用、Alt 收起拦截以及经典／真实模式重建。浏览器运行错误为 0；忽略浏览器自动请求的无关 `favicon.ico` 404。

## 模型对照与资源

补充原型截图：[三种外观](after/proto-stages.png)、[西装配色](after/proto-lineup.png)、[开箱过程](after/proto-search.png)、[头部](after/proto-close-view-head.png)、[公文包](after/proto-close-view-case-k-1.png)。与包内参考逐项检查俯卧轮廓、衣料、脸池、箱盖和内容物；这些是模型补充视图，不替代上述游戏检查。

静态检查 **37 项**通过：阶段分布、生成保留率 49.4%、模型预算、贴地、位置／法线／UV 有限数值、部件及开箱状态、掉落登记、实例释放隔离和自然生成 SID。代表模型为 2,522／2,536／2,554 三角面，20／21／23 个网格；网格数与绘制调用不同，模型有多材质组。详见 [检查日志](check.log)。

完整 25 区块窗口构建并完成回收后，三轮经典→真实重建资源为：几何 333→335→335、贴图 141→142→142、程序 107→107→107。前两轮补齐共享资源后保持稳定；没有把入场后仍在后台流式构建的资源增长误判为泄漏。这是资源回收检查，不是 FPS 基准或 Android 真机性能结论。

## 生成与回归

[生成对照](generation.json) 对 Level 0、1、2、4、7、601，各取种子 83 和 20261017，与修改前快照比较：**36 项**通过。主层瓦片、非尸体结构的位置／尺寸／碰撞标记保持一致，尸体列表恰为哈希保留的子集。比较脚本保存在 `.cache/object70-generation-compare.ts`，依赖本轮基线快照。

其它回归：物品合批 **29**、细化物品 **2,050**、人物模型 **2,441**、固定 NPC 面部校准 **549**、模型预热 **111** 通过；Level 1 建筑／区域／异常／容器持久化／积水检查通过。对应日志与 [生产构建日志](build.log) 保存在本目录。

## 复现和导入记录

```powershell
npm run check:object70
npm run verify:object70
npm run verify:object70 -- --before
npm run build
```

`verify` 自动创建独立端口和用户目录，核验实际 `--headless=new` 启动参数，并在成功或失败后回收所属进程。`--before` 加载 `.cache/object70-v83-before/src` 旧源码，与当前游戏使用同一地图种子及相机位置。前后初始截图在近处完成后拍摄，远处背景可能仍在流式构建。

[附件原文件哈希](assets.json)、[初始文本增量](text-import.json) 与 [最终文件清单](final-manifest.json) 分开记录；兼容修正后的源码哈希见最终清单。保留检查见 [preservation.json](preservation.json)。
