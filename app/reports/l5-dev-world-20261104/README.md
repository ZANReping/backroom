# 开发者面板世界页验收

在原项目 app 目录运行。

~~~powershell
node scripts/verify-l5-staff-probe.mjs --dev-world --label=final
npm run build
~~~

无头 Chrome 使用 RTX 4060 Laptop GPU，1920×1080，真实光影。L5 起始地图种子为 515151.25。完整浏览器记录及截图见 final 目录。

- 关注度锁定可覆盖正常加减和衰减。锁定时仍能手动设值，解锁后恢复变化。
- 实际传送到电梯、已显现的大堂门及看门人和厨师身旁，检查站立净空。2F 的赌场门指令自动抵达 1F，并落在门的入口一侧。
- 从赌场走返程出口，恢复进入前的楼层及坐标。迎宾女郎和野兽的定位使用大堂和办公室的正常转场。
- L0 显示 L0.2 的世界页分区，L5 与实际 L0.2 隐藏它。L0.2 状态页保留崩塌调试。
- 构建通过。相关回归包括 check:l5hotel、check:l5map、check:l5-integration、check:l5tails、check:beast、check:concierge、check:spokes、check:jazz、check:hound-l02-integration、check:l02-round5。

