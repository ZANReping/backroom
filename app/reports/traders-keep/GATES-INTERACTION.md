# 电弧体与商人之家大门/交互 · 2026-10-21

原项目 E:\ZAN\backroom，修改 app 与项目说明，保留既有内饰、NPC、业务与单人开发范围。

## 修改

- 电弧体标记 naturalSpawn:false。有限地图普通/上层生成及无限区块实例化均执行禁用判断，即使旧生成器或 worker 缓存返回电弧体也不会自然实例化。当前注册池本已无显式条目，本轮增加生成出口保证；移除L3晦暗区仍提示自然遭遇的旧文案。定义、模型、图鉴、手动召唤及已手动创建的实例保留。
- 西/北/东主入口由一米普通门改为贴合4.8×3.3米洞口的双扇门，补齐金属门框/门挡、固定侧窗、上亮窗、护板、夹丝网格、把手、合页、闭门器和出口标识。校准门向和实际墙洞位置，保留E返回与原场景切换。磨砂窗采用不透明近似，无实时折射、新外部世界或额外场景灯。每门1794三角面、11材质批次，取消构建释放部分缓冲，共享材质由世界统一释放。
- 误交互来自装饰复用trade_counter后被旧类型规则判断为业务设施。现在仅settlementstation或data.facility触发业务；花盆、导视、公告、栏杆、普通工作台/货物和固定展品不再显示无业务的“贸易设施”。保留八个真实工位、坐椅、任务证据和异常货物机制。

模型为项目参数化几何，复用既有材质和标牌图集，见[来源记录](../../TRADERS-KEEP-SOURCES.md)。

## 实际画面对照

1920×1080、DPR1、原生分辨率、FOV72、地图种子424242。西门(9,109)，北门(214,9)，东门(419,109)，斜角(9.2,107.2)。

| 取景 | 修改前 | 最终 |
|---|---|---|
| 西门 | [原门](traders-gates-before-20261021/west-gate.png) | [正面](traders-gates-final-20261021/west-gate.png) · [斜角](traders-gates-final-20261021/west-gate-oblique.png) |
| 北门 | [原门](traders-gates-before-20261021/north-gate.png) | [最终](traders-gates-final-20261021/north-gate.png) |
| 东门 | [原门](traders-gates-before-20261021/east-gate.png) | [最终](traders-gates-final-20261021/east-gate.png) |

基线仅比较门模型：误交互修正在基线拍摄前已应用。旧窄门侧面瞄准无法选中，新门已通过三门各三个站位的选中检查。

## 验证

生产构建及10项相关回归全部通过：[构建](gates-build-20261021.log)、[日志](gates-regressions-20261021.log)、[退出码](gates-regressions-20261021.json)。专项对三个种子注入旧电弧体生成数据，实际有限/无限地图均无电弧体，其他实体与手动创建有效；还验证门几何、UV/法线数值、合批、取消和通行净空。相关回归涵盖商人之家业务/内饰、据点碰撞、合批/预热、L1交互、L3建筑/玻璃。

[真实模式实际游戏](traders-gates-final-20261021/runtime.json)39项通过，含入口/返回、地图、开门碰撞、存读档/迁移及跨区回收。另验证三个门的9个选中站位、5类装饰无误提示、真实柜台实际派发facility事件。脚本/控制台错误0；仅已有favicon404。首次可操作5.99秒，往返回收几何/纹理漂移均0。RTX4060Laptop代表大厅五轮帧间隔中位4.0–4.3ms，P95为5.0–6.0ms；不作为全部场景或移动端结论。

复现：npm run check:traders-gates；npm run build；node scripts/verify-traders-keep.mjs --label=traders-gates-final-20261021 --gate-review。经典复验追加 --classic --renderer-only，使用独立label。脚本使用生产Engine/Renderer、独立端口/配置、--headless=new，不使用截图专用材质。

[经典光影检查](traders-gates-classic-20261021/runtime.json)同样通过：三门选中、装饰提示与真实业务派发正常；[经典画面](traders-gates-classic-20261021/west-gate-oblique.png)。两轮最终测试均已清理专属浏览器、服务与配置目录。
