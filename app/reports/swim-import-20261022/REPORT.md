# 游泳重制验收记录

2026-10-22；目标 E:/ZAN/backroom/app；附件 SHA256：94c4f8567a571d9202a665f6dc6903bb1044d6672ceba5dce64d57fa717ecfba。

三阶段游泳代码增量合并，原工作区近期改动保留。追加水流真实碰撞、新近战动作时序、张开的左右划水掌、手持冲突处理、移动端按住升降及传送/飞行状态清理；缺氧效果复用已有 WebGL 后处理，HUD 不变暗。来源见 [SOURCE.json](../../assets/sources/swim-remake-20261022/SOURCE.json)，操作见 [说明](../../SWIM-REMAKE.md)。

## 检查结果

| 命令 | 通过数 |
|---|---:|
| check:swim | 89/89 |
| check:swim-integration | 60/60 |
| check:melee | 131/131 |
| check:retro-hands | 13,756 |
| check:l7-cliffs | 20/20 |
| check:thing-integration | 799/799 |
| check:l7-seams | 829 |
| check:l7-chart | 24,633 |

生产构建 tsc -b && vite build 通过。现有构建提示仍包括字体在运行时解析、PostCSS from、L11 动静态重复导入和大包大小，未新增依赖。分项日志位于 [checks](checks/results.json)；最后补入的两个传送保护行为已另行复跑游泳 89/89 与集成 60/60（早期汇总日志中集成数为 58）。最终汇总为 [acceptance.json](acceptance.json)。

## 实际游戏

- [真实光影核心验收](realistic-final/result.json)：34 项，运行错误 0、失败请求 0。
- [经典模式完整验收](classic-accepted/result.json)：40 项，运行错误 0、失败请求 0；另包含真实设置保存和桌面触控操作。
- 固定种子 L7=424242；L11 运河=20261006。L7 取景为世界 (-10,15,-5)，yaw=-π/2、pitch=-0.24；1920×1080、DPR=1、原生分辨率、关闭动态分辨率。测试关闭 AI，保留实际物理和渲染。
- 实际键盘输入覆盖起步、松手滑行、俯仰方向、水平模式、上浮、下潜和冲刺；实际模型覆盖双掌、手电跟随、近战优先、收手、打火机互斥。
- 缺氧检查覆盖收缩、褪色、变暗、出水恢复及 HUD 可读；L11 运河使用同一游泳控制，无 L7 水压和减压惩罚。
- 移动端按住下潜、触摸取消、按住上浮、松开均通过，详见桌面触控数据。触控模拟不代表 Android 性能。
- 画面和截图经人工查看；音效触发通过自动检查，但浏览器验收静音，没有进行主观听感验收。

## 固定场景帧节奏

硬件为 NVIDIA RTX 4060 Laptop GPU，Chrome --headless=new，未使用 SwiftShader。预热后五轮，每轮 60 帧；表中中位数为五轮中位数的中位数，P95 为五轮 P95 的中位数，最坏 P95 单独保留。

| 模式 | 中位数 ms | P95 ms | 最坏 P95 ms | 实际 GPU 绘制/帧 | 三角形/帧 |
|---|---:|---:|---:|---:|---:|
| 真实 | 8.8 | 15.1 | 17.8 | 345.43 | 235171 |
| 经典 | 9.6 | 11 | 13.7 | 153.6 | 83368 |

绘制和三角形统计直接计数 WebGL draw 调用，含阴影、反射和后处理；原始 status.calls 是最终后处理单次 render 的值，不代表整帧。真实模式会按周期刷新阴影，所以五轮调用数存在差异。

反复收手/取出后的资源：真实模式几何体 341→341、贴图 181→181；经典模式几何体 259→259、贴图 156→156。没有逐帧重建手部。跨层清理后游泳、缺氧和攀岸状态归零。

这些是接入后的无头固定场景帧节奏，不是完整游戏/GPU 时间分析。没有旧版游泳的同条件性能对照，不能据此宣称整体提速或所有层级均达 60 FPS；冷启动加载也没有单独作性能承诺。此前保存的源码基线位于 app/.cache/swim-import-20261022/before，仅用于保留工作区与合并核对。

## 截图

- [双手划水](realistic-final/ocean.png)
- [惯性及方向控制](realistic-final/controls.png)
- [手持与手电](realistic-final/hands.png)
- [屏气反馈](realistic-final/breath.png)
- [缺氧但 HUD 可读](realistic-final/blackout.png)
- [出水恢复](realistic-final/recover.png)
- [L11 运河](classic-accepted/canal.png)
- [桌面触控下潜](classic-accepted/touch-dive.png)、[桌面触控上浮](classic-accepted/touch-ascend.png)
- [截图总览](comparison.html)

## 复现及清理

从 app 运行说明中的 npm 命令。verify:swim 使用独立内存存档、临时 profile 与空闲端口，断言 --headless=new 及原生 GPU，结束关闭自己启动的浏览器/服务，并在真实路径位于报告目录内时清理临时 profile；两组最终运行均已清理。开发注入器会在 React.Fragment 上添加不支持的 code-path，当前独立验收服务省略该注入器，游戏源码和正常开发配置未改写。

中间失败运行目录保留作诊断，其中包括已修复的着色器声明、无水区域夹具、菜单定位和开发注入器错误；它们不作为通过记录。联机未测试或修改，app-lite 和 GitHub 副本未修改。
