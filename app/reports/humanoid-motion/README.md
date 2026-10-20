# 角色行走与攻击动画

已接入无面灵、NPC 与窃皮者人形伪装。真实位移驱动步频与步幅，支撑脚锁定，髋膝踝联动，停步依次收脚；暂停、受阻、坐标重定位和传送不会持续原地迈步。攻击包含蓄力、躯干转动、出手与收势，手持工具随手腕活动。NPC 近战在 0.32 秒蓄力结束后检查距离、楼层和视线，命中后收势 0.28 秒。

运动学：16050 项通过。浏览器：Chrome/155.0.8059.40，ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)，1920×1080。真实游戏验证自然无面灵和据点 NPC 的移动；近战开始不造成提前伤害、命中只结算一次、蓄力期间离开范围可躲避。BRC 工具跟随手腕且合批保留关节。

命令：

- npm run check:humanoid-motion
- npm run verify:humanoid-motion
- npm run build
- ./scripts/check-humanoid-motion-cleanup.ps1

实现入口：src/game/renderer/humanoidMotion.ts、renderer.ts；NPC 战斗时序：src/game/engine/npc.ts；共享命中阶段：src/game/core/humanoidMelee.ts。

渲染器传入绝对世界坐标与模拟时钟，避免区块重定位被误计入步幅。每个骨架只持有一个控制器，未新增模型、材质或贴图；原有工作、演奏与死亡表现继续保留。测试生成的浏览器、服务和配置目录已清理。
