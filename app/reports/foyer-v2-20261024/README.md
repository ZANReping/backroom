# 前厅 v2 实际游戏验收

2026-10-24，E:\ZAN\backroom。固定种子 424243，1920×1080 / DPR 1、原生分辨率，关闭动态分辨率、动态曝光、颗粒和震动，textureQuality=2。Chrome --headless=new，ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)；未使用软件 GPU。每轮自建独立端口、浏览器配置与内存存档，结束后均已清理，见原始 result.json 的 command、pids、cleanup。

## 功能结果

- 两种光影完整通过：首局前厅 → 新闻 → 论坛首页／深浅色／帖子／评论折叠／返回 → 手机（保持游戏运行）→ 背包／手电／饮食 → 电脑椅／沙发／马桶实际按 E 坐下及按移动起身 → 防盗门／下楼 → 街道七名 NPC → 后巷调查／实拍／回帖 → 两轮回程 → 现实破碎 → L0 找回五类随身物品并恢复 HUD。真实模式跳过过场，经典模式完整播放 3D 过场。
- 新模型的背包、水、能量棒世界坐标正确；NPC 模型在家中隐藏、街上显示，五名行走且两名驻足，异常后清空。新增图标和贴图没有 404。
- 防盗门前后新增着色器程序：真实 0、经典 0。加载预热包含 7 个 NPC、112 张贴图，耗时真实 1965ms、经典 1539ms。开始游戏到可操作：真实 **9.15s**、经典 **7.40s**；首次加载承担街道及人物预热。
- 控制台／着色器异常为 0；测试服务仅 favicon.ico 404 被明确排除。CDP 原生键盘事件可正常打开交互和关闭文档。

## 短时性能

每视角预热后 5 轮，每轮 60 个 RAF 帧间隔；中位数取五轮中位数，P95 取五轮较大值。绘制调用／三角面为 renderer.info.autoReset=false 的整帧数（含阴影及后处理），不是只统计最后一个 pass。采样时未并行运行构建和 CPU 回归。

| 模式 / 场景 | 中位数 ms | P95 ms | 调用 | 三角面 | 几何 / 贴图（五轮范围） |
| --- | ---: | ---: | ---: | ---: | ---: |
| 真实 / 卧室 | 4.20 | 12.50 | 130 | 48097 | 798 / 237 |
| 真实 / 街道 | 4.20 | 8.40 | 280 | 39949 | 799 / 245 |
| 经典 / 卧室 | 4.20 | 4.30 | 116 | 48083 | 791 / 220 |
| 经典 / 街道 | 4.20 | 8.40 | 266 | 39935 | 792 / 228 |

这些固定视角满足桌面中位 16.7ms / P95 20ms 目标，五轮内各视角资源数不变。帧间隔受显示刷新率与系统调度影响，不是 GPU timer。未做重复整段序章／跨层回收的长时泄漏压力测试、Android 真机、音效主观试听或 2D 回退的故障注入测试；不据此推断这些未覆盖项通过。

## 自动检查

[12 项最终结果](checks.json)全部退出码 0：11 组回归及生产构建。包括前厅 v2（225 项）、前厅／Ferren 存档兼容、座椅、NPC 待机、L1 交互、69 件细化物品、枪械、前轮四包接入、物品合批、贴图图片、模型预热。构建仍保留原有字体路径、PostCSS、Browserslist 和大包提示。首次类型检查发现重复的无障碍标签后已修正，诊断保留在 build-initial.log，最终见 build.log。

## 截图与原始证据

- [真实模式](accepted-realistic/result.json)、[经典模式](accepted-classic/result.json)、[汇总](summary.json)。realistic/ 是定位空碰撞交互问题的中间运行，最终使用 accepted-*。
- [论坛暗色](accepted-realistic/02b-forum-dark.png)、[浅色](accepted-realistic/02c-forum-light.png)、[帖子](accepted-realistic/02d-forum-post.png)、[手机](accepted-realistic/03-phone.png)。
- [家具](accepted-realistic/04-home.png)、[电脑椅坐姿](accepted-realistic/04-seat-desk_chair.png)、[沙发坐姿](accepted-realistic/04-seat-sofa.png)、[马桶坐姿](accepted-realistic/04-seat-toilet.png)、[防盗门门洞](accepted-realistic/04b-doorway.png)。
- [街道与新路人](accepted-classic/05-street.png)、[异常回程](accepted-classic/06-return.png)、[三维过场](accepted-classic/07-realitybreak.png)、[L0 着陆](accepted-classic/08-level0.png)、[找回物品](accepted-classic/08b-recovered.png)。

复现命令、合并说明与来源见 [前厅 v2 接入记录](../../PROLOGUE-FOYER-V2-IMPORT.md)。
