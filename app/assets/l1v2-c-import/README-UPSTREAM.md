# Backroom L1 重制 v2 — 阶段 C

基于：上次交付的阶段 B（7a63c9a）。分支 l1v2，提交 0d8d04e。

应用方式（二选一）：
- 在阶段 B 上：git apply incremental-vs-B-7a63c9a.patch
- 在你的 c60b1b1 上：git apply full-vs-upstream-c60b1b1.patch
- 或直接把 overlay/ 覆盖到仓库根目录

主要改动：
1. 参考床位：原仓库 l1ReferenceCases 的 18 个案例（尺寸、隔墙、积水、灯光状态、解算机位）放回 v2 区段大厅中心（l1Spatial.l1RegionReference / l1FindReference，锚点对齐区块中心，影响 ±56 m，其余部分保持程序生成）。
2. 截图自由机位：window.__camOverride（位置/高度/朝向/FOV/隐藏手），window.__expMul；截图会等烘焙队列清空再拍，并隐藏 HUD 和小地图。只在开发时设置，正常游戏不受影响。
3. 外观调整：普通天鹰段加红色喷淋主管、天花压暗；跃金段原木色立柱、锈棕色桁架和顶板；哥特段整体压暗、去掉白色柱墩；衔尾段米色地面、脏柱面、白色保温风管；花园段补光、苔藓提亮；传说段提亮；小径走廊顺着走廊装灯管；停电时保留 4% 残余烘焙光（参考「闪烁事件后」）。
4. 参考图以外的烘焙修正：灯管不再装在死胡同或墙角（之前墙面会过曝），房间灯管离墙更远。L1_BAKE_REVISION 改为 13。
5. 验证：check:l1-v2 448/0，tsc 无错误。报告在 app/reports/l1-v2-C（对照图、指标、随机抽查图、工具）。
