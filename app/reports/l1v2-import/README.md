# L1 v2 C、D 接入验收

验收日期：2026-10-19。实现和来源见 [接入说明](../../L1-V2-IMPORT.md)。本目录是当前项目实际运行结果；`assets/l1v2-*-import/upstream-report` 为原作者历史报告，不能用其 SSIM 或截图代替本次验收。

## 检查范围与命令

- `npm run check:l1-v2`：448 项通过；三种种子的区段面积、12–30 米小径带、两种种子的通路洪泛、门与侧室、400 个实际区块的确定性及内容密度。
- `npm run check:l1-d-import`：理发椅几何／UV／旋转／独立资源／实际座面、三种种子的房间朝向及桌椅避让、衔尾杂物标记、实际烘焙中低矮地被法线。逐顶点检查数不等同于独立功能用例数，详细结果见 [JSON](checks/l1-d-import.json)。
- L1 现有回归：`check:l1`、`check:l1-props`、`check:l1-services`、`check:l1-detail`、`check:l1-exposure`、`check:l1-bake`、`check:l1-vault-mesh`、`check:l1-room-dressing`、`check:l1-offline` 均通过，日志在 [checks](checks/)。旧检查中已被 BSP 布局替代的固定条带／宏中心断言更新为真实大厅、门与房间的约束。
- `check:seating` 310 项，`check:jerry` 120 项、`check:partygoers` 113 项、`check:l0-testfield` 70 项通过。
- `npm run build` 通过，[构建日志](build.log)。仍有既有字体路径、Browserslist、PostCSS 和包体积警告。`dist` 与 `public` 的预烘焙清单哈希一致，修订 14、99 个区块。

实际游戏脚本：

```powershell
node scripts/verify-l1v2-import.mjs after classic
node scripts/verify-l1v2-import.mjs after realistic
```

脚本进入生产 App 的“继续游戏”，使用独立内存存档、随机服务端口、CDP 端口及浏览器 profile。实际启动参数含 `--headless=new`，GPU 必须通过未掩码驱动信息检查；不是 SwiftShader。种子／地图种子均为 `20261006`，1920×1080、DPR 1、原生分辨率、纹理高档、关闭动态分辨率和动态曝光、手电关闭。完整相机、场景、烘焙队列和异常记录保存在各轮 `result.json`。

覆盖出生点、各区段、实际金属门开关、停电／恢复、v4（包括已有旧迁移标记）升 v5、背包和已记录身份保留、新墙覆盖旧落点的安全挪位，以及生成的理发椅坐下／起身。资源阶段额外固定 NPC 位置与对白计时，重复跨区并等待超过四秒的纹理交接窗口。检查常驻几何、着色程序、纹理引用、待回收队列及 GPU 总纹理数。

原有 `structures.ts` 会在区块重建时，从固定共享图库随机选择涂鸦。诊断确认数量波动来自匿名 256² 贴图；最终脚本通过 `graffitiTextures()` 的对象身份标记实际使用的变种，将这组有限贴图单独记录。最近三轮的几何、着色程序、非涂鸦 GPU 纹理与常驻引用数必须完全相同，回收队列必须为空；涂鸦数量不得超过固定图库。没有修改生产资源回收逻辑，也没有用任意容差掩盖其他纹理的增长。经典模式的早一轮完整检查使用总数量收敛断言，最终三轮也完全相同。

## 截图

| 场景 | 真实光影 | 经典光影 |
| --- | --- | --- |
| 天鹰段 | [画面](after-realistic/parking-common.png) | [画面](after-classic/parking-common.png) |
| 圆柱／积水／暗区 | [圆柱](after-realistic/parking-round.png)、[积水](after-realistic/parking-water.png)、[暗区](after-realistic/parking-dark.png) | — |
| 跃金／哥特 | [跃金](after-realistic/storage.png)、[哥特](after-realistic/gothic.png) | [跃金](after-classic/storage.png)、[哥特](after-classic/gothic.png) |
| 衔尾杂物／花园地被 | [衔尾](after-realistic/ouroboros.png)、[花园](after-realistic/garden.png) | [花园](after-classic/garden.png) |
| 小径／办公室 | [走廊](after-realistic/path-corridor.png)、[侧室](after-realistic/path-room.png) | [侧室](after-classic/path-room.png) |
| 理发椅房／坐姿 | [房间](after-realistic/barber-room.png)、[坐下](after-realistic/barber-seated.png) | [房间](after-classic/barber-room.png)、[坐下](after-classic/barber-seated.png) |
| 传说段／停电 | [传说](after-realistic/fabled.png)、[停电](after-realistic/power-out.png) | [传说](after-classic/fabled.png)、[停电](after-classic/power-out.png) |

改造前：[天鹰段](before-realistic/parking-common.png)、[跃金段](before-realistic/storage.png)、[原始记录](before-realistic/result.json)。`before` 参数只在改造前运行，不会自动回退源码。中间 C 阶段及首次 D 检查保留在 `stage-c-*`、`stage-d-first-realistic`，便于对照修正过程。

## 数据与限制

最终采样摘要见 [summary.json](summary.json)，逐轮原始数据见 [经典模式](after-classic/result.json) 与 [真实模式](after-realistic/result.json)。每轮预热后记录五组、每组 90 个 RAF 间隔，同时记录 CPU 渲染提交耗时；没有使用 GPU timer query，不能将这些数字当作独立 GPU 耗时。

| 指标 | 改造前真实模式 | 当前经典模式 | 当前真实模式 |
| --- | --- | --- | --- |
| 可进入附近场景 | 2.49 秒 | 2.28 秒 | 2.20 秒 |
| 当前窗口完整预热 | 7.70 秒 | 3.95 秒 | 3.81 秒 |
| 功能／资源脚本检查 | 9 项 | 57 项 | 72 项 |
| RAF 间隔中位数，各轮 | 4.2 ms | 4.2 ms | 12.6–16.6 ms |
| RAF 间隔 P95，各轮 | 8.2–8.5 ms | 4.3–8.3 ms | 24.9–29.1 ms |
| CPU 渲染提交中位数 | 未采集 | 2.4–3.5 ms | 9.4–11.3 ms |
| CPU 渲染提交 P95 | 未采集 | 2.9–4.2 ms | 19.2–23.1 ms |
| 整帧绘制调用，采样帧 | 229 | 281 | 303／624 |
| 整帧三角面，采样帧 | 139,036 | 107,177 | 141,862／285,666 |

三轮均使用 RTX 4060 Laptop 的 ANGLE／D3D11 原生 GPU，未丢失上下文；无运行异常或实际资源加载失败，仅开发服务的 `favicon.ico` 返回 404。脚本结束后专属浏览器、服务端和临时 profile 已清理，另查无本轮遗留进程。当前真实模式有低频水面反射刷新，采样帧恰好执行反射时会计入额外绘制；这里记录整帧数量，不只记录最终后处理三角形。

经典模式最后三轮资源为 679 个几何、141 张 GPU 纹理、80 个程序。当前真实模式最后三轮为 772 个几何、89 个程序、108 个非涂鸦常驻纹理引用、178 张非涂鸦 GPU 纹理，回收队列为零；实际使用的涂鸦为固定 10 张图库中的 4–5 张，GPU 总纹理相应为 182–183。此检查是有限次往返收敛检查，不代表长时间全地图资源压力验收。

进入时间从点击主菜单“继续游戏”计起，包含选档操作，到附近场景可玩；完整预热另记录全部当前窗口和异步构建安定的时间。不含初次打开浏览器时的模块下载，不代表所有种子或全部层级都在同样时间完成。

当前真实模式的中位数满足 16.7 ms 的筛查目标，但 P95 高于 20 ms，性能目标**尚未全部达到**。此前批次中同机 RAF 中位曾出现约 9.6 ms、38.2 ms 的波动，原始数据保留，不能仅凭静止取景证明长期稳定 60 FPS。构图也没有完成逐图像素级复刻，花园、衔尾和干燥区仍有原包已注明的构图／色调差异。未做 Android 真机、长时间全地图压力测试或本轮无关的其他层级完整验收；联机按项目要求保持封闭。

一次开发服务依赖加载超时发生在游戏启动前，没有浏览器运行异常；已更换为只预扫描当前 L1 入口的独立服务重跑，原记录见 [bootstrap-timeout.json](bootstrap-timeout.json)。总纹理数及总引用数严格相等的失败数据分别保存在 [resource-exact-count-failure.json](resource-exact-count-failure.json) 和 [resource-owner-count-failure.json](resource-owner-count-failure.json)；进一步追踪的原始记录见 [资源诊断](resource-diagnostic-realistic/result.json)。诊断运行以原断言失败结束，保存用于说明其原因，不能当作本次最终通过记录。仅重跑资源场景可用 `node scripts/verify-l1v2-import.mjs after realistic --resources-only`。
