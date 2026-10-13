# Level 5 加载修复（2026-10-09）

用户现象：停在加载／层级介绍界面。本机复现了明显过长的场景准备等待；普通样本最终可以进入，没有复现永久不结束的状态。

## 修复

- Level 5 区块、飞蛾模型和手电按实际后处理的 HDR 输出目标预热，避免预热 canvas 程序后在正式绘制时同步编译另一个版本。手电预热键包含是否使用后处理。
- 酒店巢穴光照保留原有衰减、遮挡、BRDF 和灯光数量。仅阴影采样灯保持常量索引展开，其余点光使用动态循环，避免最多 96 盏灯重复展开整套 PBR 运算和临时遮挡数组。
- 加载卡片遮挡酒店且附近场景尚未就绪时，继续构建、编译、上传资源，暂停反复绘制不完整酒店与后处理。附近区块和模型全部就绪后，仍先绘制完整帧，再允许加载界面退出。
- 保留原有场景就绪检查，没有采用超时强制放行或删除模型的办法。

## 实际游戏验证

命令行脚本使用 Chrome `--headless=new`、独立目录 `.cache/l5-entry-01a105d1`、Vite 3188、CDP 9388；启动前验证端口空闲，结束后关闭所创建进程。`cleanup.json` 确认两个端口关闭。

画幅 1440×900、DPR 1、原生分辨率、关闭动态分辨率、游戏种子 424242。正常出口调用 Level 4 的 `oldstairs` 定义，经实际引擎切层、过场和 LevelIntro 进入酒店；随后保存、刷新、加载酒店标题背景、点击继续游戏并通过键盘移动。

| 模式 | 检查结果 | 截图 |
| --- | --- | --- |
| 经典，16 灯槽 | 9 项通过，运行时异常／shader 编译错误 0 | `level5-entry-classic.png`、`level5-continue-classic.png` |
| 真实，48 盏场景灯＋远处灯光（96 灯槽） | 9 项通过，运行时异常／shader 编译错误 0 | `level5-entry-realistic-ultra.png`、`level5-continue-realistic-ultra.png` |

两组截图已人工检查，能看到正常房间、家具、灯光和 HUD；加载与介绍层已消失。真实模式 JSON 中截图名沿用最初无 `-ultra` 后缀的文件，两套文件内容一致。

一次分阶段高灯光对照：仅 shader/HDR 修正后，出口请求到恢复操作为 **87.36 秒**；再取消加载期间重复绘制后为 **22.10 秒**。对应地图种子分别为 424904.4088 / 424904.3787；正常切层种子包含运行时间，原始值、状态采样和区块数量都在 JSON 内。经典模式样本为 16.34 秒。上述结果包含过场、首次资源准备与约两秒采样误差，不是五轮统计、整体 FPS、冷缓存保证或 Android 真机结论。

## 复现命令（在 app 中）

```powershell
node scripts/verify-l5-entry.mjs --classic
node scripts/verify-l5-entry.mjs --ultra
npm run build
npm run check:model-warmup
npm run check:program-completion
node node_modules/esbuild/bin/esbuild scripts/check-l5-exits.ts scripts/check-l5-meshes.ts scripts/check-l5-moths.ts scripts/check-l5-nest-lighting.ts scripts/check-l5-rooms.ts --bundle --platform=node --format=esm --external:@napi-rs/canvas --outdir=.cache/l5-entry
node .cache/l5-entry/check-l5-exits.js
node .cache/l5-entry/check-l5-meshes.js
node .cache/l5-entry/check-l5-moths.js
node .cache/l5-entry/check-l5-nest-lighting.js
node .cache/l5-entry/check-l5-rooms.js
```

生产构建通过；模型预热 66 项、程序完成等待 58 项、Level 5 出口／25 类模型／飞蛾行为／巢穴光照／房间生成检查全部通过。构建保留已有字体路径、包体大小与 Browserslist 提示，浏览器真实模式保留 Three.js PCFSoftShadowMap 弃用提示。

## 范围与限制

没有读取用户的浏览器存档，未覆盖其具体存档或所有随机地图。正常出口测试调用真实出口逻辑，但未包含在 Level 4 中寻找并完整走下楼梯的操作。首次驱动编译仍可能耗时，未设置强制跳过加载。初始高灯光探测还发现 Level 0 标题背景存在长等待；那次探测未用于 Level 5 的通过结论，已核实进程所有权后清理，本次未扩展为全层级性能改造。
