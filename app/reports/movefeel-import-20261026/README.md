# 玩家移动优化接入 · 2026-10-26

已接入原项目 `E:/ZAN/backroom`。保留已有工作区改动；本轮改动限于 `app` 和根项目说明。

## 来源与实现

用户包：`C:/Users/ZANRe/Downloads/movefeel-full.zip`。SHA-256：`4b7a02c3746115990f0967f066460979129ca0b04a40bc726d81fde168f32790`。

逐文件合并补丁，保留现有猎犬位置控制、游泳、箱沿脱困、实体、商店及仓库更新。新增集中参数表 `src/game/engine/moveTuning.ts`，接入：

- 轻惯性加减速、前/侧/后方向限速；前向冲刺渐入、耗尽后的短暂喘息。
- 门框/小凸角让位、沿墙滑动、被墙阻挡后扣除速度；原碰撞、嵌入恢复算法保持。
- 0.1 秒边缘起跳宽限、0.12 秒跳跃缓冲、下落与落地反馈。
- 按实际位移同步步伐、镜头和左右脚音效参数；顶墙停止步伐与冲刺 FOV。
- 默认简化真实行走视角；“设置 → 画面 → 氛围”可关闭真实行走视角或选完整幅度。图形预设、旧设置及自定义预设兼容新增幅度字段。

本项目适配额外补齐：新开局/读档不复用上一局移动状态；水平及垂直传送清理惯性；暂停后不残留滑行；满推摇杆按实际 0.4 秒计时，松杆/暂停取消，推过半径仍保持满推输入。旧自定义预设保留原完整摇晃或关闭选择。

主存档仍为 v1，移动速度、喘息及积分器为瞬态，不写入存档。既有走速 3.4、跑速 6.0、起跳速度 5.4 和噪音间隔/半径保持；方向限速与冲刺锥按包内方案调整。

源包、旧文件、最终差异分别见 `incoming/`、`before/`、`diff/`；[逐文件哈希与保留项](import-manifest.json)。详细参数见 [移动手感说明](../../MOVEFEEL.md)。

## 验证

| 检查 | 结果 |
| --- | --- |
| `check:movefeel` | 87/87；30/60/144 FPS；含新积分旋转/叠箱 240 场景 |
| `check:swim` / `check:swim-integration` | 89/89、60/60 |
| `check:player-recovery` | 原积分 240 场景、56,669 断言通过 |
| `check:dev-flight` / `check:seating` | 19、310 项通过 |
| `check:arms` | 81/81，含移动瞬态不入档 |
| `check:l0-experience` | 通过，含原版预设和自定义预设回归 |
| 真实/经典实际 App | 各 22 项 + 1 项引擎曲线补查，各 9 张截图，0 控制台/网络错误 |
| `npm run build` | 通过，最终 Vite 阶段 54.90 秒；已有大包/PostCSS 等警告保留 |

确定性引擎回归：到 95% 走速在 30/60/144 FPS 分别约 0.167/0.150/0.153 秒；走速急停约 0.192 米、0.133 秒；冲刺约 0.25 秒达到 98% 跑速；后退 2.448、侧移 3.06 m/s；120 Hz 平地跳跃顶点约 1.323 米、滞空约 0.90 秒。不同实验初始状态下的急停距离略有不同，详见日志和曲线数据。

实际 App 流程：标题继续游戏 → 真正的 L0 建筑中原生 W/S/D、冲刺、蹲伏、跳跃 → 贴墙镜头/FOV → 暂停及真实设置 UI 的幅度切换 → 844×390 原生触控死区/细推/满推保持/越界/释放/暂停 → v1 存档整页重载。Desktop 1920×1080，固定种子 424242；世界落点 `(15.5,15.5,0)`，yaw=0，在真实地图找到 7.5 米净空路线；完整参数在运行 JSON。

修正了两处已有旧夹具：L0 实际为三件补给（flashlight/bandage/almond），旧脚本仍要求四件；手臂快照漏记原先已有的 Ferren、爬菌及任务字段。只调整测试约定，没有改变补给生成或存档键。暂停菜单的裸 Fragment 被检查插件注入非法属性，已作 React.Fragment 等价替换，消除实景测试时的控制台警告。

早期诊断采集仍保留：急停起点曾包含截图等待时继续行走的距离；设置/暂停按钮含序号和副标题，QA 改用对应选择器；Space 使用正常 80ms 按下时长。最终通过数据为 `delivery-realistic` 和 `delivery-classic`，不将早期中断算作通过。

本轮为桌面原生 GPU 无头 Chrome 和触控模拟。未作 Android/iOS 真机手感、主观音效试听、全层级 FPS 性能验收；图中的旧行为虚线为包内旧逻辑/解析对照，不是同设备历史整游戏帧率。验证浏览器、服务及配置目录均已回收。

[验证汇总](validation-summary.json) · [真实模式完整数据](delivery-realistic/runtime.json) · [经典模式完整数据](delivery-classic/runtime.json) · [最终构建日志](build.log)

## 视觉记录

| 场景 | 截图 |
| --- | --- |
| 站立/行走 | [站立](delivery-realistic/01-idle.png) / [行走](delivery-realistic/02-walking.png) |
| 冲刺/蹲行 | [冲刺](delivery-realistic/03-sprinting.png) / [蹲行](delivery-realistic/04-crouching.png) |
| 真实墙面阻挡 | [贴墙停止位移及步伐](delivery-realistic/05-wall-contact.png) |
| 设置 | [简化/强烈真实行走视角](delivery-realistic/06-movement-settings.png) |
| 移动端 | [真实模式](delivery-realistic/07-touch-sprinting.png) / [经典模式](delivery-classic/07-touch-sprinting.png) |
| 存档重载 | [重进后静止](delivery-realistic/08-restored-idle.png) |
| 引擎曲线 | [速度、方向、喘息、跳跃、碰撞、步伐](delivery-realistic/09-movement-curves.png) |

主模型已检查冲刺、蹲行、设置、移动触控、墙面接触和曲线截图；时间连续性另由 `phases` 原始逐帧数据验证。

## 复现

在 `E:/ZAN/backroom/app`：

```powershell
npm run check:movefeel
npm run check:swim
npm run check:swim-integration
npm run check:player-recovery
npm run check:dev-flight
npm run check:seating
npm run check:arms
npm run check:l0-experience
npm run verify:movefeel -- --label=recheck-realistic
npm run verify:movefeel -- --label=recheck-classic --classic
npm run build
```

验证脚本使用独立动态端口、独立配置目录，检查 `--headless=new` 与进程归属，结束后只回收自己创建的资源。调参入口为 `MV`，不需要改存档或重新生成地图。
