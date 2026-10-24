# 序章修正与手机锁电验收 · 2026-10-24

在原项目 `E:\ZAN\backroom` 完成并验证七项修改。实现原因、文件关系、来源说明见 [FOYER-FIXES.md](../../FOYER-FIXES.md)。保留已有工作区改动；本轮没有修改 app-lite 或解封联机。

## 验收结果

| 项目 | 结果与证据 |
| --- | --- |
| 卫生间墙角及墙顶 | 墙体并集闭合、吊顶无共面重叠；同机位的 [修改前](before-realistic/wall-bath-corner.png) / [修改后](final-realistic/wall-bath-corner.png)，[墙顶近景](final-realistic/wall-ceiling-join.png)。 |
| 柜体内部 | 衣柜、冰箱和抽屉改为板件构成的内部空间，拾取物回到柜内；[衣柜](final-realistic/container-wardrobe.png)、[抽屉](final-realistic/container-nightstand.png)、[冰箱](final-realistic/container-fridge.png)。背包、手电、水和能量棒实际交互拾取通过。 |
| 切入 L0 前卡顿 | 六面抓取分帧离屏完成，异步 GPU 读取，3D 动画提前预热；完整裂纹、碎片、低头、迷宫、落地及物资找回流程通过。[裂纹](final-realistic/07-realitybreak.png)、[碎片](final-realistic/07-shatter.png)、[低头](final-realistic/07-self.png)、[迷宫](final-realistic/07-maze.png)。 |
| 跳过序章物资 | 实际标题页新开局：手机×1、瓶装水×1、能量棒×2，地面固定手电筒/绷带/杏仁水，取消额外随机消耗品；手机碎屏/无信号且可打开。[开局截图](skipped-prologue/skip-foyer-start.png)、[手机界面](skipped-prologue/skip-foyer-phone.png)。 |
| 安全通道门 | 模型移回室内渲染组，正面射线先命中门叶；E 下楼和室内/街区裁剪通过。[门可见截图](final-realistic/04c-stair-safety-door.png)。 |
| 寻人启事 | 纸张、照片、失联信息、联系方式、手写补注及可撕条；打开动画、自动聚焦、Esc/按钮关闭、再次打开均通过。[桌面海报](final-realistic/05b-missing-person-notice.png)、[390×740 触控模拟](final-classic/05c-notice-mobile-simulation.png)。 |
| 手机状态锁定 | 实际点击开发者“状态锁定”，12% 恢复 100%，关闭后 50% 恢复正常消耗；经典/真实均通过。待机、屏幕、拍照和手电锁电，开发者模式关闭后不锁电，未有手机不生成手机。[面板截图](final-realistic/03-phone-stat-lock.png)。 |

附带回归：电脑新闻、论坛主题/折叠/详情、室内座椅坐下起立、街区七名路人、线索调查和拍照、回程异常、五件散落物找回、九件遗物模型。门口切换新增着色器数为 0；完整过场为真实 3D 路径，图集有效且 GL error 为 0。

## 性能与边界

实际 Chrome `--headless=new`，ANGLE / RTX 4060 Laptop / D3D11；1920×1080、DPR 1、原生分辨率、贴图质量 2，关闭动态分辨率、动态曝光、颗粒和震动。固定种子 424243，使用隔离的内存存档。桌面触控模拟只验证海报布局，不代表 Android 真机性能。

| 切入指标 | 原实现 · 真实 | 修正后 · 真实 | 修正后 · 经典 |
| --- | --- | --- | --- |
| 抓图调用同步时间 | 6733.3 ms | 1.0 ms | 0.9 ms |
| 六面分帧 + 异步读取总历时 | 同步阻塞 | 132.6 ms | 126.9 ms |
| 每面提交耗时范围 | 未分帧 | 1.3–4.1 ms | 1.6–4.9 ms |
| 切入前/裂纹阶段最大记录 RAF 间隔 | 6737.3 ms | 112.5 ms | 75.0 ms |
| 3D 动画最大 draw 提交时间 | 109.6 ms | 1.6 ms | 1.4 ms |

动画准备在回程中提前完成（真实 366.1 ms，经典 301.7 ms），不放在切入调用中等待。上表 RAF 最大值包含 CDP 截图、脚本操作及其他阶段构建的扰动；它证明秒级阻塞已消除，不代表整段动画始终低于 16.7 ms。保留逐帧原始样本供复查。

固定机位预热 1.8 秒，每处连续五轮、每轮 60 个 RAF 间隔；每帧绘制调用和三角面累计所有游戏渲染 pass。以下为浏览器帧间隔，非 GPU timer；资源列为几何数/贴图数，五轮内保持稳定。

| 场景 | 五轮中位数 ms | 五轮 P95 ms | 调用 | 三角面 | 几何/贴图 |
| --- | --- | --- | --- | --- | --- |
| 真实 · 家中 | 4.2 / 4.2 / 4.2 / 4.2 / 4.2 | 4.3 / 4.3 / 4.3 / 4.3 / 4.3 | 131 | 50429 | 796/236 |
| 真实 · 街区 | 4.2 / 4.2 / 4.2 / 4.2 / 4.2 | 12.4 / 8.4 / 8.4 / 8.4 / 8.4 | 280 | 39949 | 797/244 |
| 经典 · 家中 | 4.2 / 4.2 / 4.2 / 4.2 / 4.2 | 4.3 / 4.3 / 4.3 / 4.3 / 4.3 | 117 | 50415 | 789/219 |
| 经典 · 街区 | 4.2 / 4.2 / 4.2 / 4.2 / 4.2 | 4.3 / 4.3 / 4.3 / 8.3 / 4.3 | 266 | 39935 | 790/227 |

从实际“开始游戏”按钮至可操作：真实序章 11.51 s，经典序章 9.21 s，跳过序章 3.69 s。真实模式序章冷启动本次仍超过 10 秒；本轮解决切入前同步阻塞，未将此数据表述为所有层级都已在 10 秒内。

## 自动检查

墙体/捕获生命周期 130 项、跳过序章物资 86 项、手机锁电 20 项、序章 v2 230 项均通过，另通过已有相关回归和生产构建。

| 命令 | 结果 | 用时 | 日志 |
| --- | --- | --- | --- |
| check:foyer-shell | 通过 | 0.9 s | [日志](check-foyer-shell.log) |
| check:skip-foyer-supplies | 通过 | 3.2 s | [日志](check-skip-foyer-supplies.log) |
| check:phone-stat-lock | 通过 | 2.0 s | [日志](check-phone-stat-lock.log) |
| check:foyer-v2 | 通过 | 17.4 s | [日志](check-foyer-v2.log) |
| check:ferren-foyer-integration | 通过 | 2.1 s | [日志](check-ferren-foyer-integration.log) |
| check:seating | 通过 | 0.8 s | [日志](check-seating.log) |
| check:item-batches | 通过 | 0.8 s | [日志](check-item-batches.log) |
| check:texture-images | 通过 | 5.8 s | [日志](check-texture-images.log) |
| check:model-warmup | 通过 | 0.7 s | [日志](check-model-warmup.log) |
| build | 通过 | 59.3 s | [日志](build.log) |

## 复现

在 `E:\ZAN\backroom\app` 执行（先安装项目既有依赖）：

```powershell
npm run check:foyer-shell
npm run check:skip-foyer-supplies
npm run check:phone-stat-lock
npm run check:foyer-v2
npm run check:ferren-foyer-integration
npm run check:seating
npm run check:item-batches
npm run check:texture-images
npm run check:model-warmup
npm run build
node scripts/verify-foyer-fixes.mjs --perf --label=final-realistic
node scripts/verify-foyer-fixes.mjs --classic --poster-mobile --perf --label=final-classic
node scripts/verify-foyer-fixes.mjs --skip-foyer-start --label=skipped-prologue
```

脚本启动独占端口/浏览器临时配置，使用实际 App 和标题按钮；交互通过实际键盘事件，摄影机与剧情进度由隔离 QA 夹具推进。预览和存档不写入用户游戏。三个最终运行均无 JS/运行时错误，无失败游戏资源；只有 favicon.ico 404。运行结束已关闭所属浏览器和服务器并移除临时配置。

原始数据：[真实](final-realistic/result.json)、[经典](final-classic/result.json)、[跳过序章](skipped-prologue/result.json)、[检查汇总](checks.json)、[精简机器数据](summary.json)、[本轮源码清单与哈希](source-changes.json)。

## 诊断记录与来源

`before-realistic` 是改动前基线；`final-realistic`、`final-classic`、`skipped-prologue` 为本轮最终验收。`after-realistic-initial`、`transition-debug*` 保留了中途发现的黑图集/纹理存储错误及测试选择器问题；已修复后重新完成最终整段流程。`transition-fixed` 是快速跳转诊断，不用于冷启动性能结论；`accepted-realistic` 是新增门/海报/锁电前的一次通过记录。早期未使用导入导致的构建失败也保留，最终 build.log 与 checks.json 对应修正后通过版本。

本轮没有引入外部图片、模型或纹理。海报照片为源码中的原创 SVG，虚构联系方式及人物信息沿用现有剧情；家具和建筑沿用既有序章材质及其许可记录。
