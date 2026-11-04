# 迎宾女郎 Entity 28（The Spokeslady）重制说明

方案 `/workspace/work/spokes/plan.md`；ZAN 定稿（11-01 11:05）：写实兔头、及膝裙、**机械兔引路终点随机（员工手里 / 餐厅）**、**照片解放支线要做**。
文字风格参照中文维基 entity-28（pingd 译）：「跑吧！如果你留在这里的话会死的，就像我一样！」、洞 A → 宜居地带、洞 B → 无垠城市、老板拍肩看照片（棕发棕眼、侦探服装）。

## 提交
- 阶段 1 建模：18a557f 017e8a3 c491557 b6bc334，修订 47f6099 dba9aef d559331 a735bfe b038a14 59bb5a1 b1257e3 95399bf 491013f 2aa7436
- 阶段 2 动画：a1b6a49 508378d d41ca32 861a173 1c781df 86d7b1f 3853bdb，鞋修复 7f70d20 3c592b0 74359c1 a402edb 282f5a3
- 阶段 3 机制：274e498（引擎 + 验收）、4667238（渲染 / 物品模型 / UI）、之后的截图与文档提交见 `git log`

## 机制（阶段 3，`engine/spokesAI.ts`）
### 位置与日程（118 大堂 + 她的办公室，摆放 `content/spokesLayout.ts`）
- 大堂北墙 x 16 新开一个门洞，后面是 9 × 7 m 的办公室：胡桃木书桌（桌面 0.74 m，近边 = 座位 + 0.24 m）、皮椅（椅面 0.44 m）、铭牌「Spokeslady」、木壳收音机、一叠画好的海报；北墙一块投递洞面板（洞口中心 0.8 m）：A → Level 1、B → Level 11。
- 她站在前台后面（原来的空椅子撤掉；她自由之后放回去）。只在你在大堂时走日程：
  前台待客（35–55 s）→ 走回办公室 → sitDesk 坐下 → seatedIdle（8–14 s）→ 站着 drawPoster（10–16 s）→ 走到洞 A 或 B 前 → dropPoster → 走到前台南面的地毯上 → windRabbit 放兔子 → 回前台。
  你站在她 4 m 内她不会走开。走路 0.82 m/s（= walk 片段速度），所有站位都按动画约定对齐（坐姿桌近边 0.24、站写 0.2、洞口 root [0.02, 0.8, 0.5]、兔子 root [−0.17, 0, 0.36]）。
- 前台：走近 5.5 m 转圈迎宾（greetSpin）；之后随机按着音箱推销（speakerTalk）；你在 3.2 m 内每 50 s 鞠躬伸手邀请一次（bowInvite）。X「搭话」= 一对新字幕。

### 双字幕
- 上行（黄铜粉边条）= 领口音箱的推销，24 条，全是反话（「这里一点也不危险！」「13 楼的风景是全酒店最好的！」…），偶尔按你的状态换一句（关注度高 / 理智低 / 有契约 / 兔子）。
- 下行（斜体灰字，括号）= 被困的心声，18 条求救 + **每两条里一条真线索**。线索从你**推开大堂门那一刻在 L5 拍的快照**（`hotel.spokes.snap`，存档）实算：
  - 最近的出口（电梯 / 古典楼梯 / 黑门 / 深色木门，用出口自己的名字）：「出门后的 正前方 / 左手边 / 右手边 / 身后，大概 N 米」（5 m 取整）；
  - 最近的死亡飞蛾巢穴 / 锅炉房（60 m 内）；管家、行李员、看门人前台的位置；
  - 厨师食物的真相（固定真话：吃一口就会一直想要下一口）；你和野兽的契约还剩几分钟；关注度 ≥ 50 的提醒；照片支线没开始时：「他办公室的地上有一张照片」。
- 方向词：出门后的朝向 = 推门时的朝向 + 180°（与 returnAnchor 一致），右手边 = 地图坐标叉积 > 0。check:spokes 用独立算法逐条核对。

### 发条兔（实体 `windup`，可在图鉴看到）
- 来源：① 她在大堂放的（跳向大堂正门，不等人；你在它身边 3 s 内 / 它出门 25 s 内跟出大堂门，回到 L5 它从你脚边跳出来接着带路）；② L5 里迷路太久（进图 300 s 后，每 240–420 s）前方 4–8 m 出现一只，停下回头等你走近。
- 终点随机（权重：看门人 1、管家 1、行李员 1、餐厅 1.5）。员工不在窗口里就在 18–32 m 外一个走得到的地方把他放下；餐厅取窗口里最近的餐厅（只有部分楼层有），没有就换别的终点。瓦片 BFS + 拉直。
- 到达（你在 5 m 内）：看门人 = 眨眼出现在你身后（conciergeIntercept）；管家 = 听见你（maidHear）；行李员 = 摇恼怒长铃（会叫来别的员工）；餐厅 = 烤肉香味、饥饿 −15。都加关注度（员工 +10、餐厅 +12；接受邀请的 ×1.5）。之后兔子停摆，60 s 后消失。
- 你站着不动 2.4 s、背着它走 0.9 s、或落后 6.5 m → 它停住回头（rabbitStop），关注度 +2（8 s 冷却）；你重新跟上它继续；你在 24 m 外超过 20 s → 发条走完、停摆。
- 抓住（1.5 m 内 X）或砸坏（攻击，6 HP）：得到「发条零件」，关注度 +3（她听得见）。

### 邀请「参观」
- 鞠躬伸手到 2.4 s 弹出邀请卡（暂停）。**接受**：关注度 +8，她绕出前台放一只带「参观」标记的兔子——终点一定是员工，并先绕到 45 m 内的死亡飞蛾巢穴 / 锅炉房（危险路线）。**婉拒 / Esc**：她继续推销，心声「做得好。就是这样。别跟我走。」

### 照片解放支线（设计）
1. **侦探照片**：117 野兽办公室书桌前的地上（老板拿来问过她），以及她办公室桌边的地上——没给她看过就一直在。背面：「你不觉得她很面熟吗？」
2. **给她看**（大堂里 X「给她看照片」，照片收走）：photoRecall；心声第一次清晰（白色正体 16 s）——「棕色头发。棕色眼睛。那是我。」+ **一次关键提示**：出了大堂门最近的出口在哪个方向、多远（同快照实算）；然后「我是侦探……我的证件被看门人收走了——他没收的东西，都交给走廊尽头那个摇铃的保管。」此时「侦探证件」放进行李员的代管物（`bellhop.held`）。
3. **领回证件**：L5 找行李员，X「领回代管的东西」（沿用领钥匙的规则：要付一点关注度，先请他喝茶就免）。
4. **还给她**：必须在**她的办公室**（前台「太多眼睛」）、酒店关注度 **< 40**、老板不在场（「他在看。等酒店安静下来」）。她接过证件 → photoRecall（手里换成证件）→ 摘下领口的音箱（模型隐藏）→ 自己走出大堂正门，从此不在。
   - 奖励：幸运兔脚；**以后 L5 里遇到的发条兔都把你带到最近的出口**；登记簿 / 名录统计「她自由了」。
   - 代价：下一次回到 L5，关注度 +20（「有人用很大的力气合上了一本账簿」）。之后大堂前台只剩那把空椅子。

### 与野兽联动
- **汇报**：关注度 ≥ 60 时她看见你（隔着前台也算，只挡墙）或她的兔子看见你 → `beastAI.beastTip`：下一次余光无视门槛、4 s 后出现（一次；90 s 冷却）。心声道歉。
- **拍肩**：你在大堂、她站着（前台 / 画海报）时每 70–140 s，野兽实体出现在她右后方（mode `visit`，handshake 片段，握点 = 她右肩 root [−0.13, 1.375, −0.03]，每帧按她的真实位置给），她 shoulderTap；音箱「老板好！」，心声「别碰我」；3.6 s 后他隐入暗处。拍肩时关注度 ≥ 60 也会汇报。在大堂里打他 = 怀疑（回到 L5 后执行惩罚）。
- 老板手已经用野兽实体，不再是占位模型。

### 不攻击
- 不可击杀：打她 = innerFreeze，音箱「哎呀！客人真调皮！」心声「再用力一点。求你了。让它停下来。」关注度 +6。

### 迎宾海报（物品）
- L1（权重 2）/ L11（权重 4）的物品池。阅读（1.5 s）：海报文案 + 「从 Level 4 年久失修的古典楼梯一直往下走；或者在 Level 3 修好那部电梯」（与 l3 / l4 出口定义一致）+ 背面铅笔字「别来」。
- 读过之后：下一次在 L5 待 45–90 s，视野里的墙上浮出一扇「大堂」门（一次，寿命 60 s，同野兽木门的事件门机制；一出现就能推）。

## SK 数值表（`engine/spokesAI.ts` 顶部，ZAN 可直接改）
| 项 | 值 | 说明 |
|---|---|---|
| greetR / talkR / inviteR / inviteCd | 5.5 / 9 / 3.2 m / 50 s | 迎宾 / 听得见 / 邀请距离与间隔 |
| inviteAttn | +8 | 接受邀请 |
| hitAttn | +6 | 打她 |
| clueEvery | 2 | 每几条心声一条真线索 |
| deskT / seatT / drawT | 35–55 / 8–14 / 10–16 s | 日程 |
| rbSpeed / rbNear | 1.1 / 1.6 m/s | 兔子跳行速度（你在 3 m 内跳快一点） |
| followR / stopIdle / awayT | 6.5 m / 2.4 s / 0.9 s | 停下回头的判定 |
| stopAttn / stopCd | +2 / 8 s | 停下回头 |
| lostR / giveUp | 24 m / 20 s | 停摆 |
| catchAttn | +3 | 抓住 / 砸坏 |
| staffAttn / diningAttn / diningHunger | +10 / +12 / −15 | 终点代价（接受邀请 ×1.5） |
| dest 权重 | 看门人 1 / 管家 1 / 行李员 1 / 餐厅 1.5 | 终点随机 |
| wildAfter / wildEvery | 300 s / 240–420 s | L5 迷路遇兔 |
| reportAttn / reportCd | 60 / 90 s | 汇报老板 |
| tapEvery | 70–140 s | 老板拍肩 |
| freeAttnMax / freeCost / freeGift | 40 / +20 / 幸运兔脚 | 解放 |
| posterDoor | 45–90 s | 读海报后大堂门浮出 |
| BE.tipDelay（beastAI） | 4 s | 汇报后余光出现 |

## 文件（阶段 3）
- 新：`engine/spokesAI.ts`、`content/spokesLayout.ts`、`renderer/spokesRender.ts`、`renderer/spokesItemModels.ts`、`components/GreeterHud.tsx`、`components/GreeterInvite.tsx`、`components/Spokes.css`、`scripts/check-spokes.ts`、`scripts/verify-spokes-game.mjs`、`scripts/spokes-stage3-sheet.py`、本文件。
- 改：`world/mapgenOutpost.ts`（大堂办公室）、`core/types.ts`（spokesprop）、`engine/beastAI.ts`（tip / visit / 预热）、`engine/l5Hotel.ts`（存档、步进、快照、到达、大堂邀请门）、`engine.ts`（事件 greeterinvite、事件门 pocket）、`renderer/l5Notice.ts`（事件门可以是大堂门）、`entities/humanoid.ts`（greeter / windup 定义 + 图鉴）、`entities/types.ts`、`entities/spawns.ts`、`engine/entityAI.ts`、`engine/combat.ts`、`engine/special.ts`、`engine/inventory.ts`（读海报）、`engine/bellhopAI.ts`（领回证件的文案）、`content/items.ts`（4 件物品）、`content/l5Staff.ts`、`content/codexScores.ts`、`levels/l1.ts` `levels/l11.ts`（海报）、`renderer/itemsMesh.ts` `viewmodel.ts` `entitiesMesh.ts` `entityArchiveModel.ts` `structures.ts` `renderer.ts`、`entities/archiveViews.ts`、`App.tsx` `HUD.tsx`（图标 + 字幕）`HotelLedger.tsx`、`scripts/check-l5hotel.ts`（大堂礼物断言排除侦探照片）。

## 检查
- `npm run check:spokes`：139 项（定义 / 摆放 / 状态机 / 双字幕与线索正确性 / 日程 / 邀请两分支 / 兔子终点随机与四种到达 / 停下回头 / 停摆 / 抓住 / 砸坏 / 迷路遇兔 / 汇报 / 拍肩握点 / 打她 / 照片支线四步 + 自由 + 代价 + 自由后去出口 / 海报 / 存档往返 / 渲染与物品模型）。
- 不回退：check:beast 108、check:bellhop 83、check:l5hotel 180、check:concierge 74、check:maid 64、check:item-models 681（+20 = 4 件新物品）、check:spokes-anim 75/84（与阶段 2 相同：9 段裙穿腿原本超限）。tsc 0。

## 已知问题 / 待定
- 起身（seatedIdle → drawPoster / photoRecall）只是 0.8 s 姿态混合，没有起身片段。
- 118 大堂本身极稀有（每个大厅格 4 × 0.4%）；所以加了两个入口：迎宾海报的邀请门、L5 迷路遇兔。是否还要别的入口待定。
- 餐厅终点：厨师 E800 还没做，现在只有香味 + 饥饿 + 关注度；厨师做完再接「被厨师看见」。
- 兔子寻路只看瓦片和实心结构，会从桌子下钻过去；L5 窗口平移时路点用绝对坐标，跨窗口很远的终点（> 70 m）不找。
- 拍肩：野兽 handshake 片段的手是「握手」手形，搭在肩上像是要握手；她的 shoulderTap 0.5 s 时肩膀上抬与他的手落下没精确对时。
- 照片 / 证件在 photoRecall 里共用照片道具，证件只换了贴图（没有皮夹厚度）。
- 汇报 / 拍肩 / 兔子的心声只在大堂里有字幕；L5 里遇到的兔子只有日志文字。
