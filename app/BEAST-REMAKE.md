# 第五层的野兽 Entity 18（The Beast of Level 5）重制说明

L5 恐怖旅馆的主人。不可击杀，全楼只有一位，只在 L5（含 117 办公室口袋房间）出现。分三个阶段：建模、动画、机制与接入。
设计稿：`/workspace/work/beast/plan.md`（ZAN 10-31 17:51 定稿：6 个待定全按推荐；好处池去掉「免死一次」和「指出本层出口」）。
参考：https://backrooms-wiki-cn.wikidot.com/entity-18 （绅士口吻 ↔ 受害者遗书两重叙述）。

## 提交

| 阶段 | 提交 | 内容 |
|---|---|---|
| 1 建模 | d6eca78 · fa57b81 · 5f6fb6d | 墨鱼头 SDF（外套膜 + 鳍、W 形瞳孔、中缝 / 真身裂缝、喙）、10 条触须扫掠管、老板体型西装、真身 setBeastForm、道具（契约 / 钢笔 / 画像贴图）|
| 2 动画 | cb84951 · 27df14b · 1d7a48f · 5578244 | `beastAnim.ts` 14 片段、触须避让、桌面接触、捏笔、缠抓、beastVanishState |
| 2 色素 v2 | 005f29f · 9b4228c · 77f4e97 | 头足类色素细胞皮肤（扩张 / 斑块 / 云纹 / 变白 / 眼环 / 镶边）|
| 3 机制 | 675999f（WIP）· 见 git log（收尾）| `beastAI` / `beastRender` / 契约界面 / HUD / 画像换脸 / 活画像 / 全部接入 |

## 模型（阶段 1，`renderer/beastRig/Body/Head/Mesh/Props.ts`）
- 身体沿用行李员人体骨架（前 54 根骨名 / 顺序一致），warpBH 形变成老板体型：宽肩、厚胸、略有将军肚；戗驳领近黑酒红西装、白衬衫、黑细领带、口袋巾、三枚戒指。
- 头：墨鱼头 SDF（外套膜向上后方拉长、两片波浪肉鳍、两侧大眼 W 形瞳孔），绅士形态无缝头 / 真身带「拉链」裂缝头两套网格，`setBeastForm(rig, 0..1)` 切换。
- 触须：8 腕 + 2 长触腕，每条 9 节骨，垂在领口像胡须；真身时长触腕拉到 2.35–2.6 m。
- LOD0 约 5.8–6.0 万三角形、LOD1 约 1.4–1.5 万。几何 / 材质按 LOD 缓存（第二个实例只建骨骼）。**本阶段没有改头部几何、头发（无）、色素外观。**

## 动画（阶段 2，`renderer/beastAnim.ts`）
14 个片段（秒，L = 循环）：idle 6 L、seatedIdle 6 L、talk 4 L、beckon 2.6、handshake 3.6、pourTea 7、signContract 6.4、peripheralStill 4 L、vanish 2.4、portraitGaze 6 L、doubtFreeze 4.4、reveal 3.6、tentacleGrab 3.6、colorFlash 2.4。
阶段 3 唯一的动画改动：`BeastAnimOpts.shakeP` —— handshake 的掌心目标由 AI 给（省略时仍是 `BEAST_SHAKE_P`）。

## 机制（阶段 3，`engine/beastAI.ts`）
### 117 办公室：交易
- 灯光同时闪烁 → 墙上浮出木门 → 117 办公室。他坐在书桌后（seatedIdle，面朝门，书桌近沿在他正前方 0.27 m，坐姿桌面道具落在桌上）。不再是空椅（l5pocket 文案同步改了）。
- 你走到 6.5 m 内：起身招手（beckon，0.8 s 起身混合）→ 说话（talk）。**对话只用字幕**（BeastHud 底部字幕条，不配音；状态变化时清掉旧字幕队列）。
- 走到书桌前 2.8 m 内按 X「谈生意」：每次来访第一次先倒茶推杯（pourTea 7 s），然后打开契约界面（BeastDeal，暂停游戏）。
- 契约界面：**三份契约，好处池三项各一份**，每份配一个不同的限时任务；点一份 = 签约（signContract 推契约递笔 → handshake 握手；握住的 1.3 s 好处兑现、任务开始计时）。下方「婉拒」「我凭什么相信你？」（= 怀疑他）；Esc = 再想想；数字键 1–3。
- **握手握点**：AI 每帧按玩家手的真实位置（玩家身前 0.45 m、1.05 m 高）换算到他的 root 空间，两人之间取中点（隔着桌子各伸一半），夹到他够得着的范围（x −0.30–0.12、y 0.95–1.20、z 0.32–0.48 m）。实测掌心到握点误差 < 1 cm。
- 同一时间最多一份未了的契约（BE.maxActive），未了时他不给新的（「我们之间还有一份没了结的契约。先把它办完。」）。

### 好处池（只有三项）
| id | 名称 | 效果 |
|---|---|---|
| calm | 一次宽恕 | 关注度清零 |
| fearless | 再也不会感到恐惧 | 理智回满（到当前上限），此后 600 s 内任何掉理智都被顶回去；HUD 右侧显示剩余时间 |
| rare | 一件小礼物 | 稀有物品池随机一件：夜视眼镜 / 高级医疗箱 / 皇家口粮 / 幸运豆奶 / 氙弹珠 / 幸运兔脚（背包满了放脚边）|

### 任务（代价，限时，超时 = 违约）
| id | 内容 | 时限 |
|---|---|---|
| letter | 把「绅士的情书」交给行李员 E135（签约时他把信交给你；10F 行李房那封就此取走，不重复给）。完成判定 = `bellhop.loved`（走行李员已有的递信流程，行李员同时获得本局永久友好）。行李员已经收到过信时不出这个任务 | 15 分钟 |
| still | 在酒店里连续 240 s 不奔跑（一奔跑进度清零；只在 L5 里累计）| 12 分钟 |
| flip | 把一幅会看人的画像翻过去（l5Hotel 翻画时记一次）| 10 分钟 |
| tea | 请行李员喝一杯茶（`bellhop.n.tea` 增加）| 15 分钟 |
- 剩 60 s 时日志里「有人用指节轻轻叩了三下桌面」。完成：关系 +8、「远处有人满意地合上了一本账簿」。
- 隐藏代价：契约未了期间，余光门槛失效、出现频率 ×1.6（「我会一直看着你的——这是服务的一部分」）；画像也一直是他。

### 余光
- 门槛：关注度 ≥ 50 或 理智 < 40（契约未了时门槛失效）。只在 L5 地图里，进图 20 s 后。
- 间隔 45–90 s ÷ 频率系数：理智 < 40 时 × (1 + 1.5 × (40 − 理智) / 40)、关注度 ≥ 75 再 × 1.5、契约未了 × 1.6。
- 位置：你视线左右 35°–70°、6–14 m、可站、有视线。他静立盯着你（peripheralStill，头眼目标 = 你），余光里色素按你的恐惧加深。
- 在你视线 ±54° 内、有视线、停留 0.25 s = 「被看见」：理智 −3、关注度 +3（每次出现一次）。
- 一转头正视（±17°）：后退一步、变暗、淡出（vanish，beastVanishState），2.4 s 后移除。离开余光（或被遮挡）3 s 悄悄消失；最长停留 12 s。
- 余光 / 隐入暗处永远只用 LOD1（不为它建 LOD0）。

### 画像
- 关注度 ≥ 25 或契约未了：L5 会看人的肖像换成他的脸（beastPortraitTexture，眼白 / 瞳孔挪到墨鱼眼的位置），只在画像不在跟视范围时换（不当面换脸）。盯着他的画像额外 +1.5 关注度 / 秒。
- 117 办公室那幅是活的：离屏渲染一只 LOD1 的他（portraitGaze，头眼跟着你转，冷青侧光暗场），10 Hz 写进画布；渲染前后保存 / 恢复全局 BEAST_CHROMA。

### 惩罚
- 触发：关注度满 100（取代旧的全屏注视；30 s 冷却内退回旧注视）/ 违约 / 怀疑他 / 动手打他（不受伤）。
- L5 里：熄灯（灯光压到 4%、手电熄灭、HUD 黑幕）1.2 s → 他（真身）出现在你身后 1.45 m，触腕缠住你的躯干（tentacleGrab，缠抓点 = 你的躯干，AI 每帧给）；1.3 s 缠住时镜头转过去对着他、被拖向他 → 3.6 s 拖进 117 办公室（口袋返程记下原楼层原地图）→ 一到就强签。
- 办公室里怀疑 / 动手：doubtFreeze（「你为何要怀疑我？」「哦。」「呃…？」）→ colorFlash → reveal（变真身）→ tentacleGrab → 强签。违约时人在办公室：直接 reveal → 缠抓。在别的层违约：记下，回到 L5 20 s 后执行。
- 苛刻契约（二选一，界面不能关）：**交出一件物品**（快捷栏选中的非关键物品，否则第一件；情书 / 行李牌 / 关键物品不拿）或 **理智上限永久 −20**（累计最多 −40）。强签后关注度落到 60。
- 冒犯计数 strikes：第 1 次强签，**第 2 次直接死亡**（BE.deathAt = 2；dev.god 下不死）。
- 婉拒：关注度 +10，他恼怒闪色（colorFlash 叠加在坐姿上）。

### 接入
- l5Staff beast 条目习性改写；HotelLedger 员工卡加统计行（来访 / 签约 / 履行 / 违约 / 婉拒 / 余光 / 冒犯 / 苛刻契约 / 理智上限）。
- l5Hotel：updateHotel 开头 `stepBeastGlobal`（任何层级：契约计时、理智锁 / 上限、余光、惩罚、办公室待客）；117 时 `beastPress`；hotelAddAttn 满 100 → `beastAttnFull`；翻画 → `beastNoteFlip`；盯画 → `beastPortraitStare`；hotelPocketArrive → `beastOfficeArrive`；HotelState.beast + restore。
- 行李员：情书任务完成判定读 `bellhopSave(eng).loved`；签约时把 `bellhop.letter` 置 1（行李房不再出信）。茶任务读 `bellhop.n.tea`。
- entityAI 分派 / 不听响动；combat.killCheck → beastKillGuard；special 提供「谈生意」；movement → beastControlsPlayer（熄灯 / 缠抓时接管）；humanoid 定义 + 图鉴；spawns；codexScores；entitiesMesh / entityArchiveModel / archiveViews（图鉴四姿态：绅士 / 说话 / 余光 / 真身）；renderer（实体动画 + gz、画像换脸 / 活画像、LOD1 预热）；App 'beastdeal' 覆盖层；HUD 挂 BeastHud。
- 存档 `eng.hotel.beast`：strikes、next、contracts（id / boon / task / item / limit / left / prog / base / state / reminded，保留最近 12 份）、harsh、fearT、sanCut、pending、forced、flips、n（visit / deal / decline / doubt / peri / seen / vanish / grab）。坏数据 / 旧档不报错。

## BE 数值表（`engine/beastAI.ts` 顶部，ZAN 可直接改）
| 键 | 值 | 含义 |
|---|---|---|
| periAttn / periSan | 50 / 40 | 余光门槛 |
| periEvery | 45–90 s | 基础间隔 |
| periSanK / periAttnK / periContractK | 1.5 / 0.5 / 1.6 | 频率系数（理智 / 关注度 ≥75 / 契约未了）|
| periCone / periR | 35°–70° / 6–14 m | 出现位置 |
| directCone / seenCone / seenDelay | ±17° / ±54° / 0.25 s | 正视即隐 / 余光看见判定 |
| seenSan / seenAttn | 3 / 3 | 被余光看见 |
| periLife / periLost / periFirst | 12 / 3 / 20 s | 停留上限 / 离开余光消失 / 进图后最早 |
| portraitAttn / portraitStareAttn | 25 / 1.5/s | 画像换脸 / 盯画加关注 |
| greetR / dealR | 6.5 / 2.8 m | 起身招手 / 谈生意距离 |
| declineAttn | 10 | 婉拒 |
| shakeReach / shakeGrip | 0.48 m / 1.3 s | 握点最远 / 握住时刻 |
| maxActive | 1 | 同时未了契约 |
| boonFearless | 600 s | 理智锁 |
| rare | 6 件 | 稀有物品池 |
| task.letter / still / flip / tea | 900 / 720（need 240）/ 600 / 900 s | 任务时限 |
| remind | 60 s | 叩桌提醒 |
| deathAt | 2 | 第几次冒犯死亡 |
| blackLen / behindR / grabHold | 1.2 s / 1.45 m / 1.3 s | 熄灯 / 背后距离 / 缠住时刻 |
| harshSanCut / sanCutMax | 20 / 40 | 苛刻契约理智上限扣减 |
| afterAttn | 60 | 强签后关注度 |
| pendingDelay | 20 s | 别的层违约，回 L5 后多久执行 |
| attnFullCd | 30 s | 两次「关注度满」惩罚最短间隔 |

## 文件（阶段 3）
- 新：`src/game/engine/beastAI.ts`、`src/game/renderer/beastRender.ts`、`src/components/BeastDeal.tsx` / `BeastDeal.css` / `BeastHud.tsx`、`scripts/check-beast.ts`、`scripts/verify-beast-game.mjs`、`scripts/beast-stage3-sheet.py`、`BEAST-REMAKE.md`。
- 改：`package.json`（check:beast）、`App.tsx`、`components/HUD.tsx`、`components/HotelLedger.tsx`、`game/engine.ts`（事件 beastdeal）、`engine/l5Hotel.ts`、`engine/entityAI.ts`、`engine/combat.ts`、`engine/special.ts`、`engine/movement.ts`、`entities/humanoid.ts` / `spawns.ts` / `types.ts` / `archiveViews.ts`、`content/l5Staff.ts` / `codexScores.ts`、`levels/l5pocket.ts`、`renderer/beastAnim.ts`（shakeP）、`renderer/l5Portrait.ts`（setPortraitBeast）、`renderer/entitiesMesh.ts` / `entityArchiveModel.ts` / `renderer.ts`、`scripts/check-l5hotel.ts`（关注度满的断言改为野兽现身 + 旧注视退路）。

## 检查
- `npm run check:beast`：108 项（定义 / 数值表 / 办公室流程 / 三项好处 / 四种任务含情书对接行李员 / 婉拒 / 怀疑 / 动手 / 强签两种 / 第二次死亡 / 违约熄灯缠抓拖进办公室 / 别的层违约 / 关注度 100 / 余光门槛 · 角度 · 被看见 · 正视 vanish · 悄悄消失 · 频率 / 画像门槛 / 字幕 / 预热 / 存档往返 / 渲染 LOD · 握点 · 淡出 · 真身）。
- 不回退：check:bellhop 83/83、check:l5hotel 180/180（原 179 项 + 改写注视那项拆成两项）、check:concierge 74/74、check:maid 64/64。tsc（tsconfig.app.json）0 错。
- 实机截图：`node scripts/verify-beast-game.mjs`（vite 3503 / CDP 9503 / .cache/beast-qa-game，?cpu=1），输出 `reports/beast/game/*.png`；汇总 `reports/beast/stage3.jpg`（`python3 scripts/beast-stage3-sheet.py`）。

## 与规格不同的地方 / 判断
- 好处池按定稿只有三项，没有另补「同级别」好处（plan 允许补，留给 ZAN 决定）。
- 「拒绝」= 婉拒，只加关注度 +10、闪色，不算冒犯（plan 早期写过「拒绝 → 关注度拉满」，定稿只列了关注度 100 / 怀疑 / 违约）。动手打他算怀疑。
- 关注度满 100 也计一次冒犯（定稿把它和怀疑 / 违约并列，「第二次再犯才死亡」）。
- 苛刻契约做成「二选一」让玩家挑（交出物品 / 理智上限 −20），身上没有可拿的东西时只剩理智上限。理智上限是新机制：每帧把理智夹到 100 − sanCut（HUD 理智条满格仍按 100 画）。
- 理智锁实现为「每帧把理智顶回上限」，覆盖所有掉理智的来源，不改各系统。
- 余光被看见的判定用 ±54°（屏幕可见范围），出现位置 35°–70° 里超出屏幕的部分只能靠转身时扫到。
- 办公室里他在你走近时是站起来招手 / 说话的（beckon / talk 是站姿片段），走到书桌前坐回去，握手 / 怀疑 / 真身是站姿；起身 / 坐下靠 0.8 s 姿态混合，没有专门的起身片段。
- 情书：签约时他把信交给你；行李员原有的 10F 行李房那封就不再出现（同一封信）。
- 计划里的受害者遗书物品、图鉴折叠「所以这到底是怎么回事？」、管家 / 看门人在签约期间更宽容没有做（不在这次 ZAN 列的机制里）。

## 已知问题
- 起身 / 坐下只是 0.8 s 姿态混合（腿会滑一下），没有专门的起身片段；握手、怀疑时他从椅子上直接站起，椅子不挪。
- 余光生成要找「两侧 35°–70°、6–14 m 有视线的可站点」，窄走廊里常常找不到，就 2 s 后再试——实际出现间隔会比表里长。
- LOD1 首次构建约 1.3–1.5 s（node），浏览器里更久；已在关注度 ≥ 40 / 理智 < 50 / 契约未了时预热，但预热本身仍是一次性卡顿。LOD0 约 3.5 s（阶段 1 实测），只在办公室 / 惩罚缠抓时建，惩罚那一下有卡顿风险（在黑幕里）。
- 活画像每 0.1 s 离屏渲染一只 LOD1（约 1.5 万三角形），只在 117；SwiftShader 下很慢。画框里的他是固定机位胸像，画布有轻微自发光。
- 字幕是队列（每句按时长轮流显示），连续多句时可能晚于动作；关键状态切换会清队列。
- 缠抓：玩家只是被逐帧拉向他（没有挣脱条）；缠抓点是躯干高度，第一人称下看到的是触腕朝镜头伸来。
- BEAST_CHROMA 仍是全局 uniform：同屏只有一只（余光 / 惩罚时会先移除旧的）；活画像渲染前后保存 / 恢复。
- 画像换脸只在画像不在跟视范围内时换，近距离盯着的那幅要等你走开才换。
- HUD 理智条按 100 画，理智上限扣减后满不了格（没有画上限刻度）。
- 实机截图在 SwiftShader + CPU 蒙皮下帧率很低，片段时刻是把 AI 的 modeT 直接拨过去截的（不是连续播放）；字幕可能是上一句。
