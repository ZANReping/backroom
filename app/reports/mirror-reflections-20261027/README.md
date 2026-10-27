# 镜面反射验收（2026-10-27）

原项目为 E:\ZAN\backroom；本轮仅修改 app 与根 info.md，保留既有改动。工作区备份在 app/.cache/mirror-reflections-20261027/before，前后文件哈希见 [source-files.json](source-files.json)。

审计与接入范围：

| 表面 | 位置/工厂 | 验证 |
|---|---|---|
| 玄关镜、洗手台镜柜 | foyerHome | 正面、斜视、蹲姿、经典/真实 |
| 两面洗手台镜 | l02Props | 正面、近景、手电、共面共享 |
| 卫生间洗手台镜 | tradersDressingMeshes | 两镜同框、低档、反射开关、触屏降级 |
| 通用镜、镜面出口 | structures | 工厂替换，保留框体/交互 |
| 旧黑色镜面窗、现版封闭玻璃 | structures / l11Batch | 近 LOD 共面共享，真实街道可见取景 |
| 镜中人胸前/背后碎镜 | entitiesMesh | 正反方向及实例释放数值检查 |

视觉对照见 [三阶段截图画廊](comparison.html)：原占位镜片 → 初版清晰反射 → 按反馈加入的柔化/擦拭质感。图为真实游戏 WebGL 截图。L11 最终取景经过身体净空和射线命中校验；先前 final-realistic/city.png 落在室内、不能证明可见反射，已排除，采用 visible-city-third/city.png 与 accepted-classic/city.png。

原生 GPU 为 ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)，Chrome --headless=new，1920×1080、DPR 1、渲染 100%、质量 2、FOV 72，动态分辨率/曝光关闭。主种子 424242；前厅/商人之家/L11 场景种子 20261027，L0.2 为 20261025。前厅取景地图坐标 (6,12.55,0)，朝向镜面 (4.02,12.55,1.65)。L11 最终取景参数保存在各 result.json 的 city.fixture。

五轮固定前厅测试，每轮至少 120 帧且持续不少于 1.5 秒，待着色器工作完成后再预热 5 秒。计数覆盖完整主帧与离屏捕获，不采用后处理最后一个全屏三角形的假“1 draw call”。帧时间来自 RAF，CPU 为整次游戏渲染提交，不是 GPU 时间戳。

| 模式 | 帧中位数范围(ms) | P95范围(ms) | 完整帧绘制中位数 / P95 |
|---|---:|---:|---:|
| 改动前真实模式 | 4.2–4.2 | 4.5–5 | 62–62 / 62–62 |
| 真实模式+柔化镜面 | 4.1–4.2 | 6.2–6.5 | 62–62 / 137–137 |
| 经典模式+柔化镜面 | 4.2–4.2 | 4.9–5 | 48–48 / 123–123 |

镜面更新帧会增加实际绘制工作；上述固定视角仍在 16.7 ms 中位数/20 ms P95 内，不代表全层级或 L11 最重视角均达 60 FPS。早期 before-realistic 采样未使用完整帧计数，保留作截图基线，不用于这张性能表。完整五轮数据见 [summary.json](summary.json)。

169 项镜面检查通过，涵盖反射眼位/裁剪、侧面开口投影、共享纹理、合批与取消、低档和多平面预算、实例独立释放、失败恢复、角色步伐/蹲姿/装备和镜中人方向。静态合批/颜色、L0.2 第五轮、前厅墙体/入场、人物入场回归及生产构建通过，见 [checks.json](checks.json)、[unit-check.json](unit-check.json)。

真实模式流程 139 项检查，加最终 L11 街道补验 9 项；经典模式完整流程 148 项。均无运行时、着色器或 WebGL 错误；请求中的 favicon.ico 404 与游戏无关。触屏 390×844 为 Windows 桌面模拟，验证 256 像素/单平面降级，不当作 Android 真机性能结果。

三轮 L0/前厅往返记录：真实 [{"geometries":751,"textures":278,"mirrorTargets":1},{"geometries":787,"textures":285,"mirrorTargets":1},{"geometries":787,"textures":287,"mirrorTargets":1}]；经典 [{"geometries":744,"textures":262,"mirrorTargets":1},{"geometries":780,"textures":269,"mirrorTargets":1},{"geometries":780,"textures":271,"mirrorTargets":1}]。离开镜面后缓冲归零，重新靠近最多两个，后两轮几何数量一致。整场景纹理计数还包含原有异步预热，短循环仍有少量变化，不据此声称长期显存绝不增长。改动前相同往返记录为 [{"geometries":704,"textures":241,"mirrorTargets":0},{"geometries":800,"textures":250,"mirrorTargets":0},{"geometries":800,"textures":252,"mirrorTargets":0}]，可作资源变化对照。

所有验收浏览器均用独立端口、配置目录和真正无头参数启动，结束后关闭本任务浏览器/服务器并移除配置目录。原始调试记录保留，最终采用 final-realistic（排除旧 city 取景）、visible-city-third、accepted-classic、before-realistic-steady。

来源与许可：[镜面贴图记录](../../assets/mirror-surface/SOURCES.md)、[运行纹理清单](../../public/textures/mirrors/manifest.json)、[Three.js Reflector 官方说明](https://threejs.org/docs/pages/Reflector.html)。实现与命令见 [MIRRORS.md](../../MIRRORS.md)。
