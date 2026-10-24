# 三组附件接入验收

2026-10-23，原项目 E:\ZAN\backroom。固定种子 **424243**，桌面 **1920×1080 / DPR 1**，native 分辨率，关闭动态分辨率、动态曝光、颗粒及震动，textureQuality=2；Chrome --headless=new，ANGLE / RTX 4060 Laptop，未使用 SwiftShader。所有存档为内存副本。

## 实际游戏结果

真实与经典模式均通过：首局进入前厅 → 电脑新闻 → 领取手机／背包／手电／饮食 → 手机界面不暂停 → 下楼进入街区 → 后巷调查与手机实拍 → 回帖／两次回程循环 → RealityBreak → L0 着陆 → 五类物品逐一 E 拾取 → HUD 恢复 → 九件遗物地面及手持显示 → 商人之家 Ferren 睡眠／快速 X 盖被子。经典模式还用 900×600 桌面触控模拟点击实际情境按钮，午睡被子与好感变化通过。

真实模式验证跳过过场，经典模式播放完整 3D 过场。3D 过场用 480 个碎片与 5503 个迷宫实例；保留附件 2D 回退，但没有强制模拟 WebGL 初始化失败。无运行时或着色器异常，无新增资产请求失败；仅测试站 favicon.ico 404 被明确排除。每次自建浏览器、服务和配置目录均已清理，见 result.json 的 command、pids、cleanup。

前厅从“开始游戏”至可操作：真实 **5.13s**，经典 **6.15s**。从 L0 切换并准备 Ferren 所在据点窗口：真实 **7.26s**、经典 **4.21s**（包含测试脚本固定 1.5 秒等待）。这只覆盖本轮场景，不代表全部层级的冷启动成绩。

## 五轮性能

各固定场景等待可操作后采样 5 轮；前厅完成预热，Ferren 周围据点仍有后台资源准备。每轮 60 个 RAF 帧间隔；中位数取五轮中位数，P95 取五轮较大值。调用／三角面通过 renderer.info.autoReset=false 按完整渲染帧统计，包含阴影与后处理。帧间隔不是 GPU timer；有系统调度与显示刷新率影响。采样期间未并行构建或跑 CPU 回归。

| 模式 / 视角 | 中位数 ms | P95 ms | 调用 | 三角面 | 几何 / 贴图（五轮范围） |
| --- | ---: | ---: | ---: | ---: | ---: |
| 真实 / 前厅卧室 | 4.20 | 4.30 | 139 | 48997 | 781 / 208 |
| 真实 / 前厅街区 | 4.20 | 4.30 | 272 | 26739 | 781 / 208 |
| 真实 / Ferren 笼前 | 4.20 | 12.50 | 204 | 144203 | 892–1113 / 108 |
| 经典 / 前厅卧室 | 4.20 | 8.30 | 125 | 48983 | 774 / 191 |
| 经典 / 前厅街区 | 4.20 | 8.30 | 258 | 26725 | 774 / 191 |
| 经典 / Ferren 笼前 | 8.20 | 12.50 | 190 | 144189 | 899–1075 / 79 |

这六个固定视角的短时帧间隔均满足本项目桌面 16.7ms / P95 20ms 的目标。前厅卧室与街区五轮资源数不变；Ferren 笼前的几何资源仍随周围据点后台准备而增加（真实 892→1113，经典 899→1075），不能据此判定资源长期稳定或不存在泄漏，需另做充分预热后的长时复测。未做长时跨层泄漏压力测试、Android 真机或完整全层级性能复测。

## 接入时修正

- 保护新增商店／市场／枪械模型、售货机／窗户、NPC 待机、游泳与 L7 地图优化；联机保持冻结。
- 修正快速按下并松开 X／触屏点按可能丢失；实景确认被子真的出现。
- 保存家具打开状态，重建时碰撞跟随；保存坠落队列、幂等散落，恢复时既不复制物品也不丢失保底手电。
- 防止未拿可选背包造成 HUD 永久锁死；给根层动画 key 加命名空间，消除伤害与过场同为数字 1 的 React 冲突。
- 保留遗物／市场共 69 件细化模型；UV、有限数值、实例释放检查 2672 项，单件最多 1108 三角面、3 批次。最终检查及生产构建日志见本目录 checks-final.json / *.log。

## 最终自动检查

全部 13 项退出码为 0（[原始结果](checks-final.json)）：Ferren、69 件细化物品、前厅存档与交互接入、管道蠕虫禁用、前轮四包接入、市场物品、枪械、游泳、L7 地图缓存、物品合批、贴图图片、模型预热，以及生产构建。构建仍有字体路径、PostCSS、Browserslist 数据和大包提示，未将其当作失败或在本轮扩展修改。

## 截图和原始数据

- [真实模式结果](accepted-realistic-final/result.json)、[经典模式结果](accepted-classic/result.json)、[汇总](summary.json)。真实模式旧 runner 的 seed 标签已按 fixture 实际 seed 424243 更正，说明保留在 metadataCorrection；场景与测量原值未改。
- [卧室](accepted-classic/04-home.png)、[电脑](accepted-classic/02-computer.png)、[手机](accepted-classic/03-phone.png)、[街区](accepted-classic/05-street.png)、[回程](accepted-classic/06-return.png)、[过场](accepted-classic/07-realitybreak.png)。
- [L0 醒来](accepted-realistic-final/08-level0.png)、[物品找回](accepted-classic/08b-recovered.png)、[遗物地面及手持](accepted-classic/08c-relic-in-game.png)、[Ferren 睡觉](accepted-classic/09-ferren-sleep.png)、[Ferren 被子](accepted-classic/10-ferren-tucked.png)、[桌面触控模拟](accepted-classic/11-ferren-touch.png)。

复现命令与来源署名见 [接入记录](../../FERREN-RELIC-FOYER-IMPORT.md)。initial-smoke / game-* / accepted-realistic 是定位问题时的中间运行，最终验收使用 accepted-realistic-final 与 accepted-classic。
