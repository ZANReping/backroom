# NPC 待机动作（活人气息）

基线：upstream 8b9a720。全部为客户端本地行为，不改联机协议（NPC 不在 net/ 同步）。

## 三层
1. **常驻生命层**（所有非敌对 NPC，含 Alpha/traders 值守者；30 m 内）：对立式站姿换重心（左右交替，脚由腿 IK 钉地、单脚挪步完成）、胸肩呼吸、「扫视—停留」视线 + 慢漂移、手臂放松微动。
2. **小动作**（engine/npcIdle.ts 选择，15 m 内渲染）：环顾、伸懒腰、揉后颈、看手表、挠头、抱臂、叉腰、背手、打哈欠、换脚、擦汗、拍裤腿；按职业/装备：翻写字板/看书、对讲机、扶安全帽、扶耳机、捋挎包带、清点工具/擦手、检查医疗包、警戒环顾、蹲下看地面、清点货物。按性格（personality → plain/calm/warm/wary/loud/busy）调整频率与幅度。
3. **情境层**：坐长椅/椅子（复用 seatsFor + applySeatedPose；玩家不能坐 NPC 正坐的座位）、靠墙站（自动找够宽的墙面）、两人闲聊（面对面，一问一答气泡台词 content/npcChatLines.ts，按团体分组 + 通用组；说话者手势、听者点头）、注视玩家、首次靠近点头/挥手、奔跑经过侧目、被盯久了回望/躲开/挥手。

## 不接管
敌对、BRC 工作循环、乔伊弹奏、杰瑞信众传教、Alpha/traders 值守逻辑（只叠第一层）；定点 NPC（固定朝向或 wanderRadius<1）不离岗，只做原地动作，可被动参与闲聊。

## 文件
- engine/npcIdle.ts — 待机状态（WeakMap）、模式、动作选择、玩家反应；调试 npcIdleForce/ForceSeat/ForceLean
- content/npcChatLines.ts — 闲聊对话组
- renderer/npcIdlePose.ts — 站姿/呼吸/视线/双骨手臂 IK（在手位置+肘朝向上混合，过渡不甩臂）/各动作姿势
- renderer/humanoidMotion.ts — HumanoidFrame.idle；落脚偏移与髋部偏移
- renderer/renderer.ts — NPC 循环构建 IdleFrame、平滑注视/靠墙/落座
- engine/npc.ts、engine/seating.ts — 接入点
- scripts/check-npc-idle.ts（npm run check:npc-idle，12100 项：60 s 内每 3 s 均有微动、≥2 次换重心、脚不滑不穿地、每个动作可见且手到位并能回正、注视跟随、坐姿/靠墙）
- proto-npc-idle.html?mode=acts1|acts2|life|compare（无头 SwiftShader 需加 &cpu=1）
- reports/npc-idle/ — 截图与 check.json

## 已知
- 原型页里闲聊气泡不显示（气泡是游戏内 sprite）；游戏内会正常冒泡。
- 靠墙靠的是身体后倾 + 脚前移，墙面距离按格子边估算，个别斜墙/细柱附近可能略悬空或轻微贴墙。
- 抱臂在少数体型上手略浮在胸前。
