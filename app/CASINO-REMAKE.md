# Level 5.1「恐怖旅馆赌场盛大开幕」重制文档（阶段 1–4）

来源：https://backrooms-wiki-cn.wikidot.com/level-5-1 · 方案 /workspace/work/casino/plan.md（v2 + ZAN 11-03 02:23 定稿）。
内部 level id **119**（displayId 5.1），布局 `content/casinoLayout.ts`，场景 `renderer/casinoScene.ts`，员工模型 `renderer/casinoStaff*.ts`。

## 阶段 4b：桌面 / 机器上实体进行（不暂停、不用菜单）

| 模块 | 文件 |
|---|---|
| 实体演出时间线（纯函数，渲染与 check 共用）：入座锚点、转轴 / 拉杆 / 硬币、轮盘格序 / 球、骰子四元数 / 骰盅、发牌表 / 翻牌、筹码堆、（价目牌选行 4c 已删） | `src/game/engine/casinoShow.ts` |
| 实体牌局渲染（入座时在该桌 / 机建，起身销毁；替换场景里同位置的静态拉杆 / 屏幕 / 装饰转盘） | `src/game/renderer/casinoTables.ts` |
| 入座输入 + 键位提示（屏幕下方一行，不是菜单） | `src/components/CasinoSeat.tsx` |
| 接线 | `casinoAI.ts`（seat / show / deal / drinkT / xch，`casinoOpenMenu` 改为入座，只有兑换台与结局画面仍发 casinomenu）、`renderer.ts`（镜头过渡 + 饮用晃动 + syncCasinoTables）、`CasinoHud.tsx` |
| 实机截图 | `scripts/verify-casino-4b.mjs` → `reports/casino/game4b/`，拼图 / GIF `scripts/casino-stage4b-sheet.py` → `stage4b.jpg`、`tables.gif` |

- **入座**：走到某台老虎机 / 某张桌前按 X → 镜头 0.7 s 平滑过渡到就座视角（朝向按过渡进度插值，与帧率无关），脚步锁定（`casinoMoveMul` = 0）、头照样能转，员工照常活动，游戏不暂停。Esc / X 起身（上瘾 ≥ 30 时先问「再来一把？」Y / N）。
- **结果先算**：`casinoSlot / casinoBjDeal… / casinoRoulette / casinoDice` 照旧按 casinoGames 的分布与 RTP 出结果并立即记账，然后生成时间线；时间线终点精确落在结果上（转轴：终角 = 落点格 + 整圈，末段回弹；轮盘：球相对转盘角二次减速 + 落格阶段相邻格间弹跳、幅度衰减到 0；骰子：盅内翻滚四元数 → 揭盅前 slerp 吸附到「点数朝上」的四元数）。无头接口不变。
- **老虎机**：每轴 16 格（樱桃 3 · 7 2 · TH 1 · BAR 2 · 铃 3 · 空 5，每种符号至少一格紧挨 7 / TH，供近失演出），canvas 矢量画（樱桃 / 铃 / BAR / 多边形 7 / TH 金币，不靠 emoji 字体）；拉杆 0.18 s 拉下 + 弹簧回弹；三轴 1.25 / 1.75 / 2.3 s 逐个停（近失轴再多 0.35 s 并冲过一格再退回）；赢线灯闪、LED（CR / BET / WIN）、出币口硬币逐枚落进托盘（min(赢, 24) 枚实体）。
- **21 点 / 野兽**：牌靴 → 桌面滑 0.42 s + 翻面 0.25 s，P D P D 首发，庄家暗牌结算前背面；下注圈筹码堆，结算时输了滑向庄家收走、赢了庄家推来赔付。H / S / D 键位提示在屏幕下方。野兽坐在 VIP 牌桌北侧 1.1 m（就座视角正对，不再被菜单挡）。
- **轮盘**：实体转盘按美式真实格序（0-28-9-26…-2，37 = 00）绘制；准星对准桌面下注区（12×3 号码 + 0 / 00 + 红 / 黑 / 单 / 双）的格子，Space / 左键放筹码。
- **骰宝**：骰盅摇 1.4 s → 放下 → 揭开抬起，3 颗 3D 骰子（canvas 点数面）朝上点数 = 结果；桌布下注区（小 / 单 / 双 / 大 + 点数 1–6）。
- **兑换台（4c 改回虚拟 UI 菜单）**：在兑换台前按交互键 X → 打开阶段 4 原版 `CasinoMenu` 兑换台模式覆盖层（换筹码：物品 / 理智 / 记忆；奖品；稀有池；紫筹码兑回普通筹码），键盘 + 鼠标，打开即暂停（与原版一致，App `casinomenu` 覆盖层），Esc 关闭；不入座、无镜头过渡。实体价目牌与准星俯仰选行已移除（`casinoTables` 不再生成价目牌 / 递交方块，`CasinoSeat` 无兑换键位，`casinoShow.boardRow` 删除）。成交后 Louie 仍播 `exchange` 片段。遮罩类名 `cm-m-cashier`，与内容块 `.cm-cashier`（grid 两栏）不重名。其他游戏（老虎机 / 21 点 / 轮盘 / 骰宝 / 野兽 21 点 / 送酒）保持实体进行不变。
- **免费饮料**：连输 3 把 → 侍应把杯子送到桌边（serveTo = 座位旁）→ Y 拿起喝（杯子举到镜头前，镜头仰起 + 晃，1.6 s）。
- **筹码实体**：玩家面前的筹码堆按面额拆（绿 20 / 黄 10 / 蓝 5 / 红 1，每摞 20 枚），实体枚数合计 = 余额；演出没播完时奖金还没落袋（`casinoShownChips`）。
- **负数拦门**：玩家停在门内 2.6 m（`CA.blockY`），Louie / 假肢人 / 门口保安站门内 2.0 m，门口加 3 盏实时暖光（`casino-door-fill`）。
- **竖向明暗分界（已修，根因确认）**：旧截图 ⑤⑥⑦ 那条线正好在屏幕 x = 640（1280 宽的一半），左半暗、右半亮。根因不是阴影：覆盖层遮罩的类名是 `'cm-' + mode`，轮盘 / 骰宝模式下遮罩带上 `cm-rou` / `cm-dice`，和内容块规则 `.cm-pay, .cm-rou, .cm-dice { max-width: 640px; opacity: .85 }` 重名 → 遮罩被截成左边 640 px（菜单也居中在左半屏），右半没有遮罩；送酒那张是在轮盘桌上弹的，同样中招；结局画面 `cm-ending`（max-width 560）同理。修复：遮罩改 `cm-m-<mode>`（`.cm-veil.cm-m-ending` 同步改名）；check:casino 加一项静态检查；verify-casino-4b 拍结局遮罩并实测宽 = 视口宽。（之前「暂停时手电阴影不刷新」的推断不成立：手电阴影暂停时也有心跳刷新。）
- 入座后不再显示「【X】坐到…」交互提示（`casinoAct` 已入座返回 null）。
- 验收：`npm run check:casino` 126 项（含竖线根因静态检查）；实机截图残留：兑换台图 Louie 被价目牌挡住、拦门图手持物挡中央、骰子 / 轮盘球在就座视角偏小；此前 125 项（4b 新增 19 项：入座 / 不暂停 / 镜头朝向 / 400 把转轴 / 近失 / 硬币 + 筹码 / 拉杆 / 逐轴停 / 起身 / 400 把轮盘 / 球减速 / 下注格 / 400 把骰子 / 骰盅 / 200 手发牌 / 筹码面额 / 经济守恒 / 野兽对桌 / 送酒 / 兑换台递交 / 价目牌选行）。

## 阶段 4：机制

| 模块 | 文件 |
|---|---|
| 数值表 CA / 营业 / 入口 / 经济 / 兑换台 / 菜单接口 / 上瘾 / 拦门 / 野兽挑战 / 结局 / 存档 | `src/game/engine/casinoAI.ts` |
| 四种游戏纯规则 + 数值表 CG（RTP） | `src/game/engine/casinoGames.ts` |
| 员工 AI（A* 栅格、状态机）+ 数值表 CS | `src/game/engine/casinoStaff.ts` |
| 员工渲染接入（LOD / 剔除 / 片段）、野兽坐到 VIP 牌桌 | `src/game/renderer/casinoStaffRender.ts` |
| Louie 脸异步分块烘焙 | `src/game/renderer/casinoStaffLouieFace.ts`、`casinoStaffMat.ts` |
| 覆盖层菜单 / HUD | `src/components/CasinoMenu.tsx`、`CasinoHud.tsx`、`CasinoMenu.css` |
| 接线 | `engine.ts`（事件 casinomenu）、`App.tsx`（overlay）、`HUD.tsx`、`engine/special.ts`（X 交互）、`engine/movement.ts`（离场减速）、`engine/level.ts`（takeExit 拦门）、`renderer/renderer.ts`、`content/items.ts`（寂静汁液 / 神秘蛋） |
| 验收 | `npm run check:casino`（106 项）；实机截图 `scripts/verify-casino-game.mjs` |

### 员工
- 主角 4：Louie（兑换台后，x 54.3 y 33.5）、假肢人（前厅招揽，拦门）、Billy（1 号 21 点桌发牌）、酒保 E164（环形吧台内横移 / 擦杯 / 倒酒 / 递酒）。
- 背景 13：荷官 7（21 点 4 桌 + 轮盘 2 + 骰宝 1）、侍应 3（沿主通道巡逻、送免费饮料）、保安 3（门口 / VIP / 员工门）。
- 状态机：work → watch（5 m 内盯你 3 s）→ warn（禁区：发牌区 / 吧台内 / 员工门 / 未受邀 VIP，冷却 3.5 s）→ expel（第 4 次警告或滞留 8 s：最近的保安走过来，把你送回前厅）；patrol / serve / block（紫筹码为负 + 你离门 5 m）/ gather（野兽挑战围桌）。
- 寻路：0.5 m 栅格 A*（碰撞盒外扩 0.28 m、8 邻接禁切角、视线平滑）；避让玩家（0.8 m 内停，停 1.2 s 侧移半步）。
- 渲染：< 8 m LOD0 / < 18 m LOD1 / 其余 LOD2（±1 m 迟滞），> 42 m 不画；每帧最多新建 1 个 LOD；片段 inPlace（位移由 AI 给）。
- Louie 脸：材质先用 256² 预览（同步，约 1/64 成本），2048² 在 requestIdleCallback 里每片 ≤ 8 ms 分块烘焙，完成后换图（之前首次同步 15–20 s）。

### 数值表 CA（engine/casinoAI.ts）
| 键 | 值 | 说明 |
|---|---|---|
| openSec / closedSec | 960 / 480 | 营业 16 分钟 / 打烊 8 分钟 |
| enterDepth | 0.62 | 贴门 0.62 m 面朝北进入 |
| purpleDebt | −50 | 关注度第二次满被拖进来：紫筹码 −50 |
| closeKickSec | 30 | 打烊后 30 s 清场 |
| chip | 红 1 / 蓝 5 / 黄 10 / 绿 20 | 面额 |
| purpleFloor | −400 | 紫筹码最低可欠 |
| beastDebt | −200 | ≤ −200 野兽到场 |
| closeWork / closeWorkSan | 30 / 8 | 欠账遇打烊：加班抵债 30、理智 −8，不放出门 |
| sell | 杏仁水 2 · 皇家口粮 20 · 巴别润唇膏 40 · 记忆汁液 4 · 火盐晶体 10 · 盒装火盐 25 · 瓶装水 1 · 能量棒 1 · 绷带 2 · 电池 2 | 物品 → 筹码（维基价；先抵紫筹码的债） |
| sanSell / sanSellChips / sanSellMin | 10 / 5 / 25 | 理智 −10 → 5 红；理智 < 25 不收 |
| memSellChips | 8 | 一段记忆（每次来访一次）→ 8；忘掉读过的旅馆告示 |
| prize | 杏仁水 3 · 瓶装水 2 · 能量棒 2 · 绷带 3 · 电池 3 · 火盐晶体 14 · 巴别润唇膏 48 · 记忆汁液 8 · 皇家口粮 30 · 高级医疗箱 40 | 筹码 → 奖品（负债时不卖） |
| rare | 寂静汁液 500（头奖）· 神秘蛋 150 · 迁跃浆果 120 | 稀有池 |
| earlyN / earlyFlip | 5 / 0.5 | 前 5 把输局 50% 重来一次（新手运） |
| seeSan | 70 | 理智 ≥ 70 能看出动手脚（字幕） |
| drinkStreak / drinkSan / drinkAfterSan / drunkSec / drunkBetMul / barDrinkCost | 3 / +8 / −4 / 150 / ×2 / 2 | 连输 3 把送酒；醉意期间默认下注 ×2；吧台第一杯免费 |
| addictPlay / addictNear / addictWin | 2.5 / 6 / 4 | 上瘾值增量 |
| addictDecay / addictDecayOut | 0.02 / 0.1 每秒 | 场内 / 场外衰减 |
| addictSlow / slowR | 0.35 / 12 m | 上瘾 100 时离门 12 m 内移动 −35% |
| againAt / againSan | 30 / 3 | 关菜单先问「再玩一把？」；硬走 −3 理智 |
| voiceAt / voiceGap | 35 / 16–30 s | 心声字幕 |
| timeWarp / warpDrain | 1.6 / 0.012 每秒 | 场内无钟：时间感 ×1.6，饥渴额外流失；离场提示外面过去多久 |
| beastReward / beastBoon | 150 / 皇家口粮 | 赢野兽：清债 + 150 + 一磅皇家口粮 |

### 游戏 CG（engine/casinoGames.ts）
| 游戏 | 规则 | 最低 / 最高 | RTP |
|---|---|---|---|
| 老虎机 | 三轴，权重 TH 1 / 7 3 / BAR 6 / 铃 10 / 樱桃 12 / 空 32；三连 TH 2000× · 7 200× · BAR 50× · 铃 25× · 樱桃 10×；两樱桃 4×；一樱桃 1× | 1 / 5 | 精确 0.9448 |
| 21 点 | 无限牌靴，软 17 要牌，黑杰克 1:1，要牌 / 停牌 / 加倍（不分牌） | 5 / 100 | ≈ 0.968（简化基本策略 10 万局） |
| 轮盘 | 美式 0 / 00；红黑 / 单双 1:1，单号 35:1 | 5 / 100 | 0.9474 |
| 骰宝（第四游戏） | 三骰；大小 / 单双 1:1 围骰通杀；点数 1/2/3 颗赔 1/2/3 | 5 / 100 | 0.9722 / 0.9213 |
| 野兽双人 21 点 | 三局两胜；第一局让你赢（20 对 17），之后 85% 被操纵（理智 ≥ 80 时 70%） | — | 玩家胜率 ≈ 13% |

近失：输局里前两轴同为 TH / 7 时第三轴显示擦边（另有少量擦边演出），只改展示、不改分布。

### 经济规则
- 普通筹码 ≥ 0；紫筹码（拖进来才有）中心数字可负，下注先扣普通筹码、不够从紫筹码欠；有紫筹码时赢的进紫筹码；数字回到 0 时紫筹码消失（维基彩蛋）。
- 兑换所得先抵债。紫筹码为负：Louie + 假肢人 + 门口保安堵门，玩家被挡在门内 1 m，takeExit 与打烊清场都不放人；清零后放行。
- 守恒：筹码 + 紫筹码 = 初始债 + 兑入 − 奖品 − 下注 + 返还 + 加班 + 野兽奖励 − 吧台（`casinoLedgerOk`）。

### 野兽挑战与结局
- 紫筹码 ≤ −200（强制）或老虎机头奖 TH×3（邀请，可婉拒）→ 野兽坐到 VIP 牌桌对面，员工围桌，菜单不能关。
- 赢：清债 + 150 + 皇家口粮。输：专属结局「赌场员工」画面 → 确认后 `eng.die(…, true)` 游戏结束，`hotel.casino.ending = 1` + localStorage `br.casinoEnding`。

### 存档 hotel.casino
`purple drags visits chips pchip addict again drinks plays streak drunkT memSold ending beastWon jackpots warpSec stats{slot,bj,rou,dice:[下注,返还]} ledger{exIn,prizeOut,bets,rets,debtIn,work,boon,bar}`；阶段 1 旧档自动补 pchip 与初始债。

### 操作
X：入座兑换台 / 老虎机 / 21 点（1 号桌 Billy）/ 轮盘 / 骰宝 / 吧台（4b 起不弹菜单）。入座后：Space 拉杆 / 发牌 / 放筹码 / 成交，1 / 2 老虎机投 1 / 5，H 要牌、S 停牌、D 加倍，← → 下注，准星选格 / 选行，Y / N 饮料、邀请、再来一把，Esc / X 起身。CasinoMenu 覆盖层只留结局画面（`ending`）。
无头接口：`casinoOpenMenu / casinoSlot / casinoBjDeal / casinoBjHit / casinoBjStand / casinoBjDouble / casinoRoulette / casinoDice / casinoDrink / casinoSell / casinoBuy / casinoBeastDeal / casinoBeastHit / casinoBeastStand / casinoEndingConfirm`。

### 已知简化 / 残留
- 筹码在牌桌上是实体堆（4b），但仍是钱包余额，不能丢到地上 / 放进背包格。
- 「一段记忆」的代价只清空已读旅馆告示。
- 时间扭曲只作用于饥渴流失与离场提示，不改全局 eng.time（避免打乱营业时钟）。
