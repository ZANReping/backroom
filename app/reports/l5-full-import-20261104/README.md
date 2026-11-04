# Level 5 完整包接入（2026-11-04）

两个附件包含相同的 c3bb0ce 补丁，共 324 条文件路径。较大附件提供的完整文件用于逆向还原基线，再与 E 盘原项目三方合并。

- 旅馆新增 B1 至 12F、电梯和维护电梯、关注度、换班、住客须知、贝弗莉室与口袋房间。楼层导览图保留各层已探索区域。
- 接入员工重制、发条兔、小尾巴事件、留声机、房卡、命运之骰和赌场物品。Level 5.1 接入营业时段、筹码账本、兑换和四种游戏。
- 后台区块任务携带实际楼层，按楼层隔离同种子的区块。电梯优先使用对应楼层的固定电梯出口，存档取当前地图已载入的楼层。
- 据点、赌场与口袋房间通过统一返程记录回到来源楼层、种子与门前位置。赌场读档恢复员工与筹码。发条兔在玩家已走到身边时会接着领路。
- 赌场入口在 1F 贝弗莉室，黑门在 B1。附件列为待定的规则、操作与数值采用现有实现。

## 验证

- 28 组脚本检查通过，覆盖旅馆生成、楼层导览、事件、物品、员工、赌场、存档、原有据点与前厅逻辑。详见 [最终回归列表](verified-checks.json)。
- 独立无界面 Chrome 使用 RTX 4060 Laptop GPU 和 1080p。真实光影 44 项通过，经典光影 44 项通过。验证包含实际电梯按钮、B1 及多个楼层、地图、6F 据点返程、营业门禁、下注、赌场读档、债务拦门及口袋办公室返程。两次均无游戏运行时或 WebGL 错误，测试进程与独立资料目录已清理。
- 从标题继续测试档到 Level 5 可操作，真实光影 4.66 秒，经典光影 3.88 秒。每模式单次记录。
- 生产构建通过。附件说明中列出的迎宾女郎裙摆阴影、少见事件交叠和移动端真机操作未单独复验。

[真实光影结果](realistic/result.json) · [经典光影结果](classic/result.json) · [生产构建日志](build.log)

[维护电梯](realistic/elevator-0.png) · [楼层导览](realistic/floor-map.png) · [赌场](realistic/casino.png) · [野兽办公室](realistic/office.png)

## 复现

在 E:\ZAN\backroom\app 下运行。

~~~powershell
npm run check:l5hotel
npm run check:l5-integration
npm run check:casino
npm run check:outpost-return
node scripts/verify-l5-full-import.mjs --label=realistic
node scripts/verify-l5-full-import.mjs --classic --label=classic
npm run build
~~~
