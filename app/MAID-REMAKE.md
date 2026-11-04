# 管家 Entity 111 重制（L5 恐怖旅馆员工）

参考：backrooms-wiki-cn.wikidot.com/entity-111 + ZAN 提供的附图（黑泡袖长裙、白围裙、白翼领、白帽黑带，肉色螳螂头）。

## 阶段 1 建模
- `renderer/maidMesh.ts`：身体、裙摆（每实例形变）、围裙、泡袖、人手、清洁车（水桶拖把、扫帚、垃圾袋、毛巾、失物招领箱）。
- `renderer/maidHead.ts`：附图轮廓多边形浮雕头 + Canvas 手绘贴图；附图风格眼、两根淡色扁獠牙（mandL/mandR）、两根触须（antL/antR）。
- 预览 `proto-maid.html?view=…`，截图 `node scripts/verify-maid.mjs`。

## 阶段 2 动画（`renderer/maidAnim.ts`）
14 个动作：idle 待机 · push 推车行走 · turn 转向 · park 停车松手 · sweep 扫地（双手握扫帚，右手 CCD IK）· wipe 擦拭 · pick 捡物入车 · watch 转头注视 · greet 欠身问候 · shush「嘘」· sigh 叹气 · approach 缓步逼近 · clean 打扫 · tidy 整理帽子围裙。
裙摆 / 围裙按步态与下沉形变；触须与獠牙随头部角速度做弹簧惯性。预览 `proto-maid.html?clip=<名>`，`node scripts/verify-maid.mjs anim` + `python3 scripts/maid-gif.py`。

## 阶段 3 机制（`engine/maidAI.ts`，调参表 `MD`）
- 孤例：每张 L5 地图最多 1 个；进层 90 s（关注度「关照」档以上 54 s）后在玩家视线外 14–24 m 出现，推车巡楼 1.1 m/s。
- 打扰值 0–100（隐藏）：响动按距离衰减累加，隔墙也听得见（听距 = 响度半径 ×1.6，最多 30 m）。
  开枪/爆炸 70 · 破门 45 · 重击 28 · 近战 18 · 冲刺每步 7 · 走路/蹲行 0。安静 1 s 后每秒 −6。
- ≥30：转头注视 →「嘘」+ 字幕「现在您能安静一下了吗？您这样对大家都没好处。」（冷却 14 s）。
- ≥60：「……唉。」停车，1.3 m/s 缓步走向噪音源（看得见 / 4 m 内直接走向玩家）；途中降回 30 以下就回去推车。
- 接触时仍 ≥60 → 打扫：HP 压到 10（本来不到 10 只扣 1，不致死）、理智 −18、体力清零、拖着走 8 s；
  背包里的东西（关键物品除外）全部进她的失物车；之后 30 s 宽限。快捷栏不动。
- 不可击杀：任何伤害都会回满，并把打扰值拉满（直接停车走来）。
- 关注度 ≥2 档：阈值 ×0.7（21 / 42）。
- 首遇安静的住客：欠身「您好，酒店服务！」，员工名录解锁。巡逻时捡走 8 m 内住客丢下的东西（进失物车）。
- 对平静的她按 X：一件件要回失物（先还最早收走的），每件关注度 +3。
- 存档：`hotel.maid = { cart, warn, clean, reclaim, greeted }`；登记簿员工页显示次数。
- 不做：低理智尖叫、黑猫（ZAN 定）。

## 接入点
entityAI（分派 + noiseEvent）· combat.killCheck（maidKillGuard）· special.ts（X）· l5Hotel.updateHotel（stepMaidWorld / maidPress）·
entities/humanoid.ts（定义 + 图鉴）· spawns（L5 事件生成）· codexScores · entitiesMesh / renderer（maidRender.animateMaidEntity）· HotelLedger · l5Staff。

## 验收
`npm run check:maid`（64 项）· `npm run check:l5hotel` 回归 · 实机截图 `node scripts/verify-l5hotel-game.mjs game-maid game-maid-approach`。

## 已知
- 推车挂在身前 1.02 m，不做碰撞：拐角处车头可能短暂穿墙。
- 推车把手对齐靠固定姿势，没有手部 IK。
- 不管联机（与 L5 扩展一致）。
