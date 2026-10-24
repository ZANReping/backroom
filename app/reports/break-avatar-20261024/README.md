# 入场动画复用玩家形象 · 2026-10-24

修改并验收原项目 E:\ZAN\backroom 的 app。序章回程切入 Level 0 时，身体由玩家现用的 buildAvatarModel 工厂构建，复用体型、肤色、上衣、裤子、鞋子、UV、材质与共享贴图；当前穿戴通过与坐姿身体相同的装备映射传入。

## 实现

- 删除过场固定的胶囊体身体。沿用生产人物的 19 骨骼，驱动双臂张开、双腿非对称弯曲、手脚轻摆与呼吸；身体朝向保持跟随原下坠镜头。
- 第一人称只剔除头颈三角面，保留其余顶点属性与材质分组，避免贴近相机的头部遮挡。手机与手电的漂浮演出保留。
- 衣料使用 3～6 mm 的顶点摆动。位移取决于位置而非分片法线，UV 接缝两侧的重合顶点保持相同位移；已根据实景细线修正这一点。
- 仍在回程异常阶段提前建模、等待贴图、编译和预热，动画开始复用准备好的场景。每帧只更新骨骼与少量制服参数，不重新建模。
- 过滤后的几何、原始几何、骨架及材质由实例释放，形象图集保留在共享池；退出、跳过及正常结束沿用已有清理路径。

本轮复用项目现有复古人物资产及许可记录，见 [Retro NPC](../../RETRO-NPC-PROTO.md) 与 app/art-source/npc-retro/manifest.json；没有引入第三方模型或新生成贴图。

## 实际游戏验收

使用独立 profile、独立服务器及 CDP 端口的 Chrome --headless=new。RTX 4060 Laptop / ANGLE D3D11，1920×1080、DPR 1、原生分辨率、贴图质量 2，种子 424243；关闭动态分辨率及动态曝光。两次都通过原版开始、序章操作、回程、完整三维现实破碎、L0 苏醒及物品找回流程。

| 光影与形象 | 身体三角面 | 身体材质组 | 提前准备 | 动画 render() CPU 平均 / 最大 | 截图 |
| --- | --- | --- | --- | --- | --- |
| 真实 / 男性风衣、工装裤、靴子 | 1592 | 4 | 364.4 ms | 0.34 / 2.00 ms | [下坠身体](final-male-realistic/07-self.png)、[接近迷宫](final-male-realistic/07-maze.png) |
| 经典 / 女性深肤、背心、短裤、运动鞋 | 1228 | 3 | 274.2 ms | 0.26 / 1.00 ms | [下坠身体](final-female-classic/07-self.png)、[接近迷宫](final-female-classic/07-maze.png) |

以上时间是单次功能验收的 CPU 提交时间与提前准备耗时，不是完整 GPU 帧时间或五轮性能结论。画面中的身体已分别核对服装、肤色和鞋子；头部未穿入镜头。图像对照：[旧固定身体](before-fixed-body.png)、[新男性形象](final-male-realistic/07-maze.png)、[新女性形象](final-female-classic/07-maze.png)。截图处于约 7.4～7.9 秒的低头阶段，原截图和新截图并非同一帧。

两次实际模型配置都与保存的玩家形象逐字段一致，贴图尺寸有效且全部就绪，GL 错误为 0；正常结束时过滤几何、骨架及 7 个独立材质各释放一次，共享图集释放次数为 0。无 JS 运行时异常或失败游戏资源，只有 favicon.ico 的 404。所属浏览器、服务器和临时 profile 均已回收。

前期 male-realistic / female-classic 是首次检查，发现轻摆接缝后已修正；最终结论以 final-male-realistic / final-female-classic 为准。

## 自动检查与复现

新增 86 项检查覆盖四套形象、装备快照、生产 UV/顶点色/蒙皮属性、头颈过滤、材质分组、多个动画时刻、实例隔离和重复释放。现有序章墙体、座椅、模型预热及开场回归通过，生产构建通过。

| 命令 | 状态 | 用时 | 日志 |
| --- | --- | --- | --- |
| check:foyer-shell | 通过 | 0.58 s | [日志](check-foyer-shell.log) |
| check:seating | 通过 | 0.68 s | [日志](check-seating.log) |
| check:model-warmup | 通过 | 0.64 s | [日志](check-model-warmup.log) |
| check:foyer-entry | 通过 | 1.18 s | [日志](check-foyer-entry.log) |
| check:break-avatar | 通过 | 0.96 s | [日志](check-break-avatar.log) |
| build | 通过 | 65.81 s | [日志](build.log) |

在 E:\ZAN\backroom\app 执行：

```powershell
npm run check:break-avatar
npm run check:foyer-shell
npm run check:seating
npm run check:model-warmup
npm run check:foyer-entry
npm run build
npm run verify:break-avatar -- --label=final-male-realistic
npm run verify:break-avatar -- --classic --female --label=final-female-classic
```

原始数据：[男性真实模式](final-male-realistic/result.json)、[女性经典模式](final-female-classic/result.json)、[精简汇总](summary.json)、[源码与哈希](source-changes.json)。本轮未进行 Android 真机测试。
