# 2026-10-26 当前接入状态

已将用户提供的 `hound-full.zip` 合入原项目，当前为三形态蒙皮模型、16 段动作、8 网格、群猎／扑倒挣脱版本，并适配现有分帧准备和资源回收。当前操作、兼容与限制见 [猎犬与 L0.2 接入说明](HOUND-L02-IMPORT.md)，实际经典／真实游戏证据见 [本轮验收](reports/hound-l02-import-20261026/README.md)。

下文保留原包阶段设计与旧 v62 接入历史，其中旧网格数、旧性能结论、原型命令和联机描述不作为当前验收结论。联机仍按项目要求封闭，本轮没有更新联机逻辑。完整原包说明另保存在 [来源目录](assets/hound-full-import/HOUND-REMAKE.md)。

---

# 猎犬（Entity 8）重制 · 2026-10 重做

方案与 ZAN 定稿：`/workspace/work/hound-remake/plan.md`（10-25 14:54）。
- 做尾巴；蜂巢卵 / 幼犬只写进图鉴（阶段 3 已写）；群猎包抄 + 扑倒挣脱（阶段 3 已做）；保留 hostile / neutral / ambusher 三形态；单独开工作副本 hd-wt（干净 main 032a79a 子集，基线 25e8bd7）。
- 参考：中文维基 Entity 8 附图（chompgwenarts 速写，CC BY-SA 4.0，仅作造型参考，未使用其图像）。

## 阶段 3.2：第一人称被扑倒实机测试与修复（2026-10-25）
- **测试台**：`verifier/hound-pin-app.html?cpu=1&level=0`（`hound-pin-app.tsx`：生产 App + 生产引擎 / 渲染器，存档换成内存，不碰玩家存档；`window.hdPin` 提供 `aim / spawn / step / settle / free / press / bite / state`，引擎与渲染锁步推进，画面可定格）；`node scripts/verify-hound-fp.mjs [--level=0] [--gif] [--held=crowbar] [--label=]` 用真实玩家相机（游戏实际第一人称，眼高 `PIN_EYE 0.32`，不是原型的后退镜头）在准星前 2.6 m 生成一只冲锋中的敌对猎犬，拍四个时刻：① 扑中后 0.2 s ② 自然撕咬的那一口（红闪）③ 连按 5 下（挣脱 55%）④ 挣脱成功 0.27 s 后的硬直；`--gif` 另存逐帧，`python3 scripts/hound-fp-sheet.py <目录> <jpg> [gif]` 合成 2×2 标注图 / GIF（≤ 6 MB）。成果：`reports/hound/fp/l0/{1-hit,2-bite,3-half,4-stagger}.jpg`、`reports/hound/fp/hound-fp-pin.jpg`。
- **实机发现并修复**：
  - **扑中那一帧镜头钻到下巴底下**：扑击前摇 0.3 s × 7 m/s 会冲到玩家脚下 0.3–0.5 m，pin 再慢慢滑回 1.2 m。现在前冲停在压人距离（`pinOffOf`：`PIN_OFF 1.2`，ambusher `PIN_OFF_L3 1.28`），`startPin` 扑中即落位；扑击 → 压住的交叉淡入 0.22 → 0.1 s（`PIN_FADE`），镜头倒地 ×9 → ×14（≈0.07 s）。
  - **脸没对着镜头 / 露下巴底**：`PIN_POSE.headZ` −0.8 → −0.98；撕咬蓄力改为脖子后仰但吻部压低（`headZ −0.08·w`），前探时头部回正（`+0.28·k`）——吻部轴线与「脸 → 镜头」夹角平时 ≤ 21°、蓄力 ≤ 20°（原来最大 41°）。
  - **嘴一直大张、口腔像一块红板**：AI 在 pin 时把 `s.jaw` 拉到 1，`animateHound` 的 `max(P.jaw, s.jaw×0.6)` 把嘴撑成常开；pin 改为自己按撕咬节拍开合：平时半张龇牙（≤ 15°），蓄力大张（34°），咬下去前 0.05 s 仍张着、0.17 s 合拢再狠狠咬合。
  - **挣脱面板压住嘴、下面还叠一行「【X】挣脱」**：桌面面板顶边 `min(74%, calc(100% − 190px))`（移动端仍 64%），压制时不再显示特殊交互提示；镜头上仰 `PIN_LOOK_UP` 0.36 → 0.22，脸落在准星上方、嘴在面板之上；侧倾 `PIN_ROLL 0.24`。
  - **挣脱后只看到画面底边的背毛**：硬直加掀开初速（`STAGGER_SHOVE 1.05 × def.speed`，0.16 s 衰减，0.3 s 退开 0.62 m，整段约 1.2 m）；`stepEntity` 会把朝向拧到移动方向，面朝玩家后退时保留朝向（原来侧身对着镜头）；起身时视线 0.6 s 内低头跟着踉跄的猎犬（renderer `houndLookT`）。
  - 被压住时手持物 / 副手模型 / 打火机收起（`stowK`），手电光源贴近镜头照它的脸；视线拧向压在身上的猎犬、俯仰回正。
- **穿模复查**（`check:hound`「第一人称压倒镜头」+「第一人称实机复查」两节，镜头 = 玩家头部、近裁剪面 5 cm）：双眼离镜头 37–51 cm（咬时前探到 37 cm）；嘴 / 头 ≥ 21 cm、躯干 / 四肢 ≥ 35 cm、指爪 ≥ 25 cm、头发 ≥ 35 cm；扑中淡入 0.3 s 内双眼 ≥ 37 cm；前爪落在玩家胸口（头前 `HOUND_PIN_CHEST_FWD 0.34 m`、离地 0.22 m，误差 < 12 cm）；AI 的头部位置（`PIN_HEAD`，直视 / 手电判定用）与模型双眼差 6–8 cm。地面：镜头 0.32 m，地面在画面下缘，未见穿地。
- **验收**：`check:hound` 97 → 121 项（「第一人称压倒镜头」12 项 + 面板位置 1 项 + 「第一人称实机复查」11 项：扑中那一帧就在压人距离 ×2、扑中淡入不贴脸 ×2、吻部朝向 ×2、嘴的开合 ×2、挣脱后掀开、后退时面朝玩家、起身视线跟随）。

## 阶段 3.1：扑倒压制挣脱进度条 HUD（2026-10-25）
- **数据**：`houndAI.ts` 新增 `houndPinOverlay(eng)` → `HoundPinHud | null`（没被压住时 null，HUD 据此隐藏）：`progress`（= `houndPinProgress`，0..1）/ `struggle` / `need`（8，ambusher 10）/ `left`（`PIN_MAX 7 − pinT`）/ `max` / `bite`（被咬红闪 0..1：每口撕咬与扑中那一下记 `hd.biteAt`，`PIN_BITE_FLASH 0.45 s` 内线性消退）/ `flash`（本帧手电正照脸，`F.pinFlash`）/ `kind`。规则未改（连按 +1、衰减 1.2/s、手电 +2.5/s、打中 +3）。
- **组件**：`components/houndPinHud.tsx`（`HoundPinHud` 读快照 + 纯展示 `HoundPinBar`），HUD.tsx 里 `// [hound]` 一行接在 `ArachnidHud` 后。屏幕中下方 `top 64%` 居中的 `hud-panel`，里面是 HUD 状态条同款 `hud-bar-track / hud-bar-fill`（`--bar-c = var(--blood)`，25% 刻度），填充宽度 `transition: width 0.16s linear`，衰减平滑；提示文字按实际键位 `bindLabelFor(interact / attack / jump / special)` 生成（默认「连按 E / 左键 / 空格 / X 挣脱」，未绑定的键略过），移动端「连点「挣脱」/「攻击」挣脱」；下方「挣脱 xx%」（手电照脸时追加「· 手电照脸」）与「压制 x.xs」倒数（< 2 s 变琥珀色）；被咬时全屏血色暗角 + 面板红色描边外发光 + 填充变亮红。
- **移动端不重叠**：面板宽 `min(260px, 100vw − 2 ×（安全区 + 22 + 64 + 14 px）)`，两侧对称让开 TouchControls 的「挣脱」情境按钮（距边 22 px、64 px 宽，左手模式在左），任何高度都不会与按钮横向相交（390 px 竖屏实测面板 190 px，与按钮间隔 14 px）。
- **预览**：`proto-hound-pinhud.html?cpu=1`（第一人称压倒视角 + 真实 `HoundPinBar`；`&mobile=1` 按 TouchControls 位置画「挣脱」按钮并在 `__info.overlap` 报告是否重叠；`&p= &bite= &left= &flash=1 &theme=`）；`node scripts/verify-hound.mjs pinhud pinhud-mobile` → `reports/hound/pinhud.png` / `pinhud-mobile.png`，合成 `reports/hound/pinhud.jpg`（左桌面 1280×720，右移动端 390×844）。
- **验收**：`check:hound` 81 → 97 项，新增「挣脱进度条 HUD」一节：未压住为 null；压住时 need / max 正确、扑中即红闪；按键后进度上升、松手后逐帧单调衰减（1 s ≈ 1.2 / need）、每口撕咬红闪、剩余时间倒数；整段压制进度始终在 0..1 且与 `houndPinProgress` 一致；挣脱成功 / 压满 7 s 松口 / 压人的猎犬死亡后隐藏；手电照脸标记；组件服务端渲染（未压住不渲染、桌面 / 移动端提示、移动端宽度表达式、320–768 px 不与按钮重叠）。`tsc`、`check:hound-integration`、`check:hounds`、`check:entity-forms`、`check:hound-anim` 全过。

- **HD 表**（`houndAI.ts` 顶部）集中全部调参：速度倍数（× def.speed 3.4 m/s：游荡 0.4 / 搜寻 0.8 / **潜行 0.45**（原 0.75）/ 冲锋 1.55、L3 1.7 / 包抄 0.9 / 徘徊 0.32 / 拖尸 0.34）；直视 `GAZE_T 4`、`GAZE_NOISE_T +2`、`HABIT_T 6`、`GAZE_CONE 0.2 + atan(HEAD_R 0.28 / 距离)`、`GAZE_R 10 / 暗处 5.5 / 手电 14`、`FLASH_CONE 0.32`、`DUR_FLASH ×1.5 / DUR_DARK ×0.6`、`TRIGGER_DARK 0.4 s`；群猎 `PACK_R 8 / PACK_MAX 3 / LEAD_HOLD 6 / LEAD_MIN 3 / FLANK_WIDE 6.5 / FLANK_SIDE 3 / FLANK_BEHIND 2.5 / FLANK_MAX 9`；搜寻 `SEARCH_T 12 / SEARCH_R 4`、徘徊 `LINGER_T 9 / LINGER_R 2.5`、追丢 `LOST_STALK 3.5 / LOST_CHARGE 4`；扑倒 `PIN_OFF 1.2（L3 1.28，阶段 3.2；原 0.86）/ PIN_BITE 6 每 1 s / PIN_MAX 7 / PIN_NEED 8（L3 10）/ PIN_DECAY 1.2/s / PIN_HIT +3 / PIN_FLASH +2.5/s / STAGGER_T 1.4 / REPIN_CD 8 / PIN_EYE 0.32`；尸体 `CORPSE_SENSE 16 / FEED_T 20 / FEED_CD 45 / DRAG_R 7 / DRAG_T 3 / FEED_SIGHT_K 0.35 / FEED_HEAR_K 0.4 / FEED_NOTICE_R 2.4 / FEED_SPRINT_R 4`；LOD `LOD1 12 / LOD2 22 / 回差 1.5 / LOD2_EVERY 2`。
- **直视要看到脸**：`Engine.crosshairRay()`（眼高 1.55，蹲 −0.55，被压倒 0.32；方向 = 渲染层发布的准星中心射线 `combat.crosshairDirection`）与「眼睛 → 头部」（`houndHeadPos`：身前 0.68 m、离地 0.5 m，伏低 / 压人时更低，ambusher 0.74 / 0.44）的夹角 < `GAZE_CONE + atan(HEAD_R / 距离)`（5 m ≈ 0.26 rad，2.5 m ≈ 0.31 rad）且在起效距离内才算；看身子 / 脚、偏到头旁都不算，近处平视看不到脸要低头。手电（开着且有电）光锥罩住脸：14 m 内起效、威慑 ×1.5（≈6 s）、扑倒时持续帮你挣脱；暗处（猎犬所在处 `isLit` 为假且没被手电照到）：5.5 m 内、要先盯 0.4 s、维持 ×0.6（≈2.4 s）。持续噪音 +2 s、习惯后 6 s 无效、L3 无时限照旧。没有 `crosshairRay` 的简化模拟引擎退回旧的 `lookingAt`。
- **群猎包抄**：敌对个体在游荡 / 搜寻时就近合群（8 m 内、最多 3 只；嚎叫那一刻也把身边还没编组的同类拉进来）。头犬首次目击嚎叫后留在正面 ≈6 m 低伏吸引（近于 6−0.6 m 后退、近于 3 m 才扑）；其余成员 `flank`：左右各一，先横向绕到玩家侧面 6.5 m（落在玩家视野 ±0.6 rad 内就再外推 2.5 m），再到侧后方（横 3 m、后 2.5 m）就位；两翼都就位或超时 9 s 后全体收拢冲锋。头犬追丢 → 两翼转为徘徊。高智能（L3）与中立个体不编组。
- **嚎叫搜寻期**：不在同一群、25 m 内的同类朝嚎叫者位置（世界坐标）前去，到了在声源 4 m 内来回嗅探，直到 12 s 搜寻期结束；听到玩家响动同样进入搜寻。**躲出视线后**：潜行中 3.5 s / 冲锋中 4 s（离得远或已扑到最后目击点）没再看见 → `linger`：先到最后看到玩家的位置，再在 2.5 m 内嗅探 9 s，然后游荡离开；期间再看见就继续追。
- **扑倒压制与挣脱**：冲锋扑击命中 → `pin`（同一时刻只有一只能压人，挣脱后 8 s 内不会再被压倒）。玩家被压倒：`houndControlsPlayer` 在 movement 里接管位置（不能移动），视角压到 0.32 m、上仰侧倾并随撕咬震动（renderer `houndPinK`）；每秒咬 6。挣脱值：交互 / 攻击 / 跳跃 / 特殊交互键 X 的每次按下 +1（移动端：`special.ts` 新增 `houndPin` 情境按钮「挣脱」，点按），每秒衰减 1.2，满 8（高智能 10）挣脱；手电照脸每秒 +2.5（不按键约 6 s 也能挣脱）；自己打中它 +3；**联机**：房主结算客人的 `entHit`（`applyingNet`）时直接解救。挣脱 / 被救 → 猎犬 `stagger` 1.4 s（甩头踉跄后退、不扑）。不挣扎最多压 7 s 后它松口退开。同伴压住玩家时其余猎犬在 3 m 外圈等。渲染：前爪落点由 `houndPinPaws` 按玩家实际位置（renderer 传 `px / py`）算到玩家胸口（离地 0.22 m）。
- **尸体**：刚死（`deathT > 0`）的肉食类实体（尸鼠、蛛形纲、悲尸、窃皮者、无面灵、钝人、死亡飞蛾、受眷鸟、干虾、迷彩爬行者、肢团、爆裂者、爬菌、恩桂斯）16 m 内会被游荡 / 搜寻中的敌对猎犬认领：认领期间尸体不消失（`deathT` 保持 0.15）。玩家在 7 m 内看得见时先叼着拖开 3 s，再伏下啃 20 s（啃完尸体消失，45 s 冷却）。进食时视野 ×0.35、听觉 ×0.4，普通脚步不惊动，近到 2.4 m 或 4 m 内狂奔才惊醒（丢下尸体、嚎叫 / 扑来）；受击照常反应。
- **图鉴**：Entity 8 行为 / 应对改写（群猎包抄、准星对准脸、手电 / 暗处、扑倒挣脱、尸体、徘徊），档案新增两段【繁殖·蜂巢卵】【幼犬】（只写图鉴，不建模）；forms.ts 三形态描述同步。
- **三形态**：hostile 编组包抄 / 扑倒 / 进食；neutral 不编组、不扑倒、不抢尸体（其余照旧）；ambusher 单独伏击、不编组、不进食、被直视完全僵住、扑倒需 10 下。
- **动画接入（houndAnim.ts）**：新相位映射 flank→trot、linger→walk / idle、pin→pin、stagger→habituate、feed→bite（走过去时 trot）、drag→walk；**stalk 速度 / 步态**：AI 潜行降到 1.53 m/s，walk / stalk / trot 的步幅按 √(实际速度 / 名义速度) 缩放（0.85–1.45），相位按「距离 / 当前步幅」累加——stalk 步幅约 1 m、步频 1.54 Hz（原 3.54 Hz），支撑脚仍锁地（check 0.00 cm）。
- **LOD 三档**（`houndLodTier` 带 1.5 m 回差，`setHoundLod`）：0 档（< 12 m）全量；1 档（12–22 m）停二阶摆动（发链只跟姿态）；2 档（≥ 22 m）把头发 / 背毛骨链的根骨从骨架上摘下（场景图里的骨 387 → 38），毛发换成同几何、只绑 11 根锚骨（躯干 / 颈 / 头 / 尾链）的低骨数蒙皮替身（首次进入 2 档时生成，几何属性与原毛发共用；静止发链姿态下顶点误差 0），姿态隔帧更新；可见网格仍 8 个。压人 / 死亡时保持 0 档。
- **预览**：`proto-hound.html?view=stage3&cpu=1`（左：群猎包抄站位；右：pin 前爪落在玩家胸口）；`node scripts/verify-hound.mjs stage3` → `reports/hound/stage3.png`（汇总 `reports/hound/stage3.jpg`）。
- **验收**：新增 `npm run check:hound`（81 项：直视角度 / 距离阈值、手电与暗处、实际威慑时长 4.00 / 6.00 / 2.40 s、编组与左右包抄站位（收拢时两翼与头犬方位差 ≈1.9 rad）、搜寻期、徘徊、pin 每秒撕咬 / 连按挣脱 / 硬直 / 不连扑 / 手电挣脱 / 自己打 / 联机同伴解救 / 超时松口 / 外圈等待、前爪落点（误差 3.3 cm）、尸体认领 / 拖走 / 进食 / 警觉降低 / 惊醒 / 啃完消失、LOD 三档与替身、stalk 步幅与脚锁、三形态差异、图鉴）；`check:hound-integration` 的 L3 实机直视一段改为准星跟着头部（yaw / pitch / 中心射线）——阶段 3 起只看「视线接触」不再算直视；`check:hounds`、`check:entity-forms`、`check:hound-anim`、`tsc` 全过。
- 接入文件：`engine.ts`（`crosshairRay`）、`engine/movement.ts`（`houndControlsPlayer`）、`engine/special.ts`（`houndPin` 情境动作）、`renderer/renderer.ts`（压倒视角、`animateHound` 传距离与玩家位置）、`entities/critters.ts`、`entities/forms.ts`。不改存档、联机协议、生成表。

## 阶段 2：动画（renderer/houndAnim.ts）
- 入口：`animateHoundClip(grp, clip, t, kind?, dt?)`（无状态：`sampleHoundPose` 纯函数采样 + `applyHoundPose` 落到骨骼）；`HOUND_CLIPS` 列出 16 个片段（时长 / 是否循环 / 移动片段的步幅与名义速度）；`blendHoundPose` 线性混合。`animateHound(grp, e, time, gz)` 接口不变（houndMesh 转出），改为按 `e.hd.phase` / 姿态量选片段并交叉淡入 0.22 s，状态在 `grp.userData.hdAnim`。
- 片段：idle 低头嗅地（一下下嗅、偶尔抬头张望、尾慢摆）· walk 潜行（侧对步、肩胛随前肢推地起伏）· stalk 低伏前进 · trot 对角小跑 · gallop 冲锋（旋转式四足奔跑、躯干俯仰腾空、刘海被风掀起）· pounce 扑击（蓄力压低 → 腾空前扑 0.55 m 根位移 → 前爪先落后腿跟上）· bite 撕咬甩头（前撑后蹬、头左右猛甩、下颌开合、往后拽）· howl（后坐挺胸仰头，`houndHairPart` 让头发向后滑落露脸，下颌大张、喉咙颤动）· cower（压低、头埋低、头发盖脸、夹尾、倒退、发抖）· habituate（衰减甩头 + 抖毛后起身咧嘴）· sit（坐下：四爪不动、躯干后坐到后爪上方，前爪各迈一小步收到肩下）· wag（坐着快摇尾、歪头）· flee（夹尾、耳贴后、回头的逃跑奔跑）· hit（后缩、扬头张嘴）· death（腿软、侧翻倒地、四肢抽搐收拢、下颌松开）· pin（前爪按在玩家身上、身子前压、低头撕咬猛甩，给阶段 3 扑倒挣脱用）。
- 游戏映射：howl / cower / flee / charge→gallop / stalk / search→trot / sit→sit|wag / watch→walk|stalk / roam→walk|idle；扑击前摇或 strikeT → pounce（游戏里只保留三成根位移，其余由 AI 位移承担）；扑击后 attackCd 0.75–1.2 → bite；cower 结束转冲锋那一刻（gazeCd 刚设为 6）→ habituate；血量下降 → 叠加 hit；`e.dead` → death（renderer 对死亡猎犬也调用 animateHound，旧的整体侧翻删掉；扑击不再整体放大 1.14）。
- 脚锁：四肢平面三段 IK；移动片段的相位按走过的距离推进（`e.animT` = Σ速度×dt），支撑脚每周期相对身体后移的距离等于身体前进距离，所以在世界里不动；原地片段的落地脚固定在模型空间、只动躯干。躯干不做侧滚 / 扭转（平面 IK 下会让落地脚滑），左右晃放在颈上。
- 二阶摆动：头发链（每缕第 2 节起）、背毛 / 颈鬃链、尾链（第 2 节起）每根骨一个弹簧阻尼（k / c / 幅度上限按链区分），用上一帧世界矩阵算骨点加速度（含整只移动）和重力方向偏差（换到父骨局部，力矩 = 骨方向 × 力），甩头 / 抖毛另加随机激励；状态在 `grp.userData.hdDyn`，按 dt 推进。尾巴最后做一次二维前向运动学的贴地约束：节点低于地面就抬上一节，着地后后面的节点顺着地面拖。
- 预览：`proto-hound.html?anim=1&clip=…&kind=…`（实时循环，移动片段整只前进，地面网格看脚滑没滑）；`&grid=1&frames=16&cols=4` 离线逐帧拼网格。`node scripts/verify-hound.mjs anim`（或 `anim-<clip>`、`anim-cower-ambusher`、`anim-sit-ambusher`）→ `reports/hound/anim-*.png`；`python3 scripts/hound-sheets.py gif` → `reports/hound/stage2.gif`（gallop / pounce / howl / cower / sit / wag / pin，112 帧约 4.2 MB）。
- 验收：新增 `npm run check:hound-anim`——16 个片段各跑两个周期，支撑脚世界滑动最大 0.4 cm（≤1.5）、离地最大 0.4 cm（≤2），骨矩阵有限、摆动有界，三形态 sit / wag 后爪离地 −0.3–0.3 cm；`check:hound-integration`（cower / sit / howl 走新映射，四爪离地检查照旧）、`check:hounds`、`check:entity-forms`、`tsc` 全过。

## 阶段 1.1：修模型（ZAN：主要是脸太胖）
- 脸：球体雕刻换成沿 x 放样的截面头骨（`HK` 关键帧 + 极坐标截面 + 骨相起伏），整体皮包骨——颅腔收窄（半宽 0.066，旧 0.086）、太阳穴凹、眉弓与颧骨 / 颧弓顶起、颧下脸颊凹陷、眼窝深陷（眼球压在窝底，只露前半，眼窝压暗）；吻部长而窄，鼻梁是窄棱，吻端略下垂成人 / 犬之间的鼻头，鼻孔改成两道斜缝；口裂一直开到颧骨下方（嘴角往后裂开）；下颌又长又宽、下颌角外张；上 / 下牙 14 / 13 对参差歪斜、偶有缺牙，犬齿位各一对长獠牙。`skull(d)` 接口保留（二分求表面），头发 / 发帽 / 碰撞照旧从颅腔中心查。
- 头发：正中只留几绺短刘海，两侧长发框住脸；掀发（`houndHairPart`）改成刘海贴着颅顶往后倒，发梢不再翘出头顶。
- 背毛 / 颈鬃：每侧 46 个候选发根，按 6 块随机斑秃空出来；长短悬殊、宽窄不一，每缕随机扭转（`twisted`），约四成中段分叉出一绺细毛外飘。
- 尾巴：毛芯（不透明发束管，有体积）+ 7 条贯通长发片 + 34 片错层短发片（各自外翻、扭转）+ 尾尖 12 缕散开成扇形；权重按尾曲线参数取（`ribbonW`）。
- 膝窝：膝 / 踵（前肢肘 / 腕）各加一根半角辅助骨（`kneeH` / `ankleH`，转一半角度、随弯曲放大 ≤22%），关节带顶点分给它，`syncHalf` 在 `solveLeg` 里同步。皮肤骨 22 → 30。
- 悬空：`solveLeg` 够不着时脚沿地面往身下收；坐姿按后髋离地 0.15 m 反推躯干高度。高智能猎犬坐下后爪离地 0.0 cm（旧 3.7 cm）。
- 面数：hostile 23004 / neutral 23100 / ambusher 23004（check 统计 22770），仍 8 次绘制；`check-hound-integration` 的面数上限按 ZAN 的 2.4 万预算从 2 万放宽到 2.4 万。
- 对比图：`reports/hound/face2.jpg`（附图正脸 / 3/4、新脸正 / 侧 / 3/4、旧脸、带毛发 / 掀发、尾巴与背毛特写；`python3 scripts/hound-sheets.py face` 生成，旧脸图在 `reports/hound/old/`）。

## 阶段 1：建模（renderer/houndMesh.ts 重写）
造型按附图：
- 头：人脸骨架（压平的上半张脸、眉弓、颧骨、太阳穴凹）+ 宽钝前凸的猪鼻状吻部，鼻板上两个大鼻孔；阔嘴，口裂一直开到脸颊，上下满口参差尖牙（上 22 / 下 20，长短、歪斜随机）；下颌可开合，口底暗红，前端挂口水丝（半透明，挂在 jaw 下，中立 1 根，其余 3 根）；眼窝深，眼球空白发亮（MeshBasic）；尖耳宽底、前侧内凹，从长发里穿出。头部整体 ×1.24。
- 头发：发帽壳 + 34 缕发带，每缕一条 4 节骨链（发根在颅顶 → 发际线 → 垂落中段 → 下段）。正前方短缕垂到眼下、两侧长缕垂过下颌、后脑铺到颈背；发缕按雕刻颅骨 / 吻部 / 下颌 / 颈逐点推出，不穿模。脸前发缕的第二节在额上，`houndHairPart(grp, k)` 可把刘海整段撩起、两侧拢到耳后（预览「掀发版」，阶段 2 嚎叫 / 甩头直接复用）。
- 躯干：沿弓背脊线扫掠（臀 → 胸），深胸细腰；肋骨斜棱 + 肋间沟（顶点色 AO）、脊突、高高顶起的肩胛骨板、髂嵴 / 坐骨、胸骨棱、凹陷的腹部。颈短粗前伸，带颈椎棘突和胸锁乳突肌。
- 长毛：肩颈、背中段一片片长毛（背中线两侧每侧 30 个候选发根、按密度随机斑秃，每缕 3 节骨链）先贴身往侧下铺、越过最宽处后向后下垂；颈鬃 10 缕；肩背一片贴身短毛壳。腰后、臀部全秃。
- 皮肤：共享 512² 程序化贴图——灰白底、大块斑驳、斑秃处的短毛茬簇、分叉青筋、结痂污渍、毛孔噪点。
- 前肢：人臂，肩 → 肘 → 腕 → 指根一根连续扫掠管，按关节平面混合到三根骨（关节处无接缝）；三角肌 / 肱二头肌、粗大的肘（鹰嘴向后、两侧髁）、尺骨头；宽扁手掌带掌骨棱；4 根长指 + 拇指，三节指节鼓包 + 黑色钩爪。
- 后肢：趾行，髋 → 膝 → 踵 → 跖球连续扫掠；腘绳肌、髌骨前凸、小腿肚、向后顶起的脚跟骨、被拉长的跖段；4 趾 + 内侧趾，长爪。
- 尾：长而蓬的毛尾，从臀后弧形垂下，后半段压扁贴地拖行（所有顶点 y ≥ 0.008）；12 外圈 + 6 内圈发带，8 节尾链。
- 形态（`HOUND_SHAPES`）：hostile；neutral 毛色浅灰褐（线性空间倍增）、皮肤更浅、半垂眼睑 + 浅灰瞳、牙短、1 根口水；ambusher 躯干 ×1.12、粗细 ×0.84、四肢 ×1.07、爪 ×1.6，静止伏低 0.21 m（hostile 0.13、neutral 0.08）。

结构与性能：
- 皮肤是一张 SkinnedMesh（躯干 / 颈 / 头 / 下颌 / 双耳 / 四肢上中下三段，22 根骨），毛发是一张 SkinnedMesh（头发 / 长毛 / 尾链，约 290 根骨，含锚定用的 body / neck / head），另有眼、口水丝、四只手脚的指趾（刚性网格，挂在 paw 关节）。**单只 8 次绘制**（旧版 24），约 **18.4k 三角形**（hostile 18408 / neutral 18450 / ambusher 18408；check 统计 18390），贴图仍是共享的皮肤 / 毛发两张；包围球放大 1.35 倍防误剔除。
- 枢轴层级：body → neck → head → jaw / earL / earR / 头发链；body → 四肢 hip → knee → ankle → paw（前肢 = 肩 / 肘 / 腕 / 指根，后肢 = 髋 / 膝 / 踵 / 跖球）；body → 长毛链；body → 尾链 tail_0…tail_7；neck → 颈鬃链。所有骨静止旋转为 0，`userData.rest` 记静止位置。
- `userData.houndRig`（`HoundRig`）：body / neck / head / jaw / tail（= tailChain[0]）/ tailChain / legs（`HoundLeg`：hip、knee、ankle、paw、front、side、sole，以及 IK 用的段长 l1–l3、静止角 a1–a3、弯向 bend、hx / hy、restX、pawY、phi）/ earL / earR / hair / mane（`HoundLock`：bones、az、len、group）/ kind / shape / bodyY。
- 对外接口保持：`buildHoundMesh(neutral, seed, kind?)`（第三参可选）、`animateHound(grp, e, time, gz)`、`userData.parts = {}`、`HoundRig`；新增 `houndMeshKind(e, level)`、`houndHairPart(grp, k)`、`HOUND_SHAPES`、`HoundKind`。sweep / limbSeg / shell / canvasTex 等工具照旧导出（arachnid / burster / duller 等十余个模型复用）。
- animateHound（阶段 1 基础版）：平面三段 IK（掌 / 跖段保持世界角，paw 关节落地，指趾平贴地面；够不着时先立起脚掌）；伏低 / 坐 / 嚎叫 / 冲锋 / 张嘴 / 耳朵后贴 / 尾链波动摇尾 / 头发微摆。
- 渲染层：entitiesMesh 透传 `houndKind`；renderer 按 `houndMeshKind` 选形态，形态变化（中立被激怒、L3 首个 tick 定为 ambusher）时重建模型；图鉴 entityArchiveModel 同步透传；forms.ts 更新中立 / 高智能形态描述。
- 无头 SwiftShader 画 GPU 蒙皮会崩：预览 / 截图一律 `?cpu=1`（qaCpuSkin 的 CPU 替身）。真机 GPU 蒙皮正常。

验收：
- `npm run check:hound-integration` passed（meshes 8、triangles 18390、sharedTextures 2；cower / sit / howl 四爪离地 0–3 mm）；`npm run check:hounds` 全部通过；`npm run check:entity-forms` 252 passed；`tsc --noEmit -p tsconfig.app.json` rc=0。
- 预览 `proto-hound.html?cpu=1&view=front|side|back|head|ref|compare|poses`（head 加 `&part=1` 为掀发版，`&nohair=1` 隐藏毛发，`&kind=` 选形态，`&cam= &look=` 自定相机）；`node scripts/verify-hound.mjs [视图…]`（端口 3496 / CDP 9496）→ `reports/hound/*.png`、`verify-result.json`、汇总图 `reports/hound/stage1.jpg`（附图 + 3/4、三形态侧 / 正 / 背、头部盖脸 / 掀发 × 侧 / 正、新旧对比）。旧模型对比用的原样副本在 `src/proto/houndLegacyMesh.ts`（游戏不引用）。

已知问题（10-25 阶段 3.1 后更新）：
- 发带仍是 alphaTest 条带，近看有片状感；二阶摆动没有发丝与脸 / 身体的碰撞，甩头时个别发缕会短暂穿进脸或肩。
- 四肢是平面 IK：躯干不能侧滚，死亡侧翻时脚不再锁地；台阶 / 斜坡没有逐足地形适配（仍是平地假设）。
- 包抄站位按「玩家 ± 法向」直接算目标点，靠 stepEntity 的碰撞绕墙，没有寻路：窄走廊里两翼会贴墙或卡在拐角，超时 9 s 后照样收拢。
- 联机：猎犬 AI 只在房主端运行，只有房主玩家会被压倒；客人端的提线木偶只同步位置 / AIState，看不到 pin / 包抄 / 进食的专属动作，也不会被压倒（仍走通用接触伤害）。被认领的尸体只在房主端保留，客人端按原计时消失。
- 2 档 LOD 的毛发替身发链不摆动、不掀发（远处看不出）；切档那一帧发链姿态直接跳到静止。替身三角形数与原毛发相同（只降骨数，不减面）。
- 被压倒时的视角只是压低 + 上仰侧倾，没有第一人称手臂推挡动作。挣脱进度条（阶段 3.1）只在本机被压时显示：联机客人不会被压倒，也就看不到它；TouchControls 自定义布局若把按钮挪到屏幕中下方，进度条不会避让（只避让默认位置的「挣脱」按钮）。
- 拖尸时尸体按猎犬朝向放在嘴前，死亡模型本身不弯折。

待办：无（阶段 3.1 完成）。可选：包抄路径加寻路；pin 第一人称推挡动画；联机同步 pin。

---

# 历史：v62 导入版


2026-10-08 从用户的 `backroom-hound.zip` 导入 `app`，原包与修改记录见 [IMPORT.md](assets/hound-import/IMPORT.md)。保留 `hound` ID、生成表和原基础数值。

参考：中文维基 Entity 8（https://backrooms-wiki-cn.wikidot.com/entity-8），附图作者 chompgwenarts（CC BY-SA 4.0，仅作造型参考，未使用其图像资源）。

## 机制
| 规则 | 实现 |
| --- | --- |
| 目击即敌对 | 视野内看见玩家（视距 6m，召集后 ×1.7）→ 首次锁定仰头嚎叫 1.1s |
| 嚎叫召集 | 25m 内同类进入 search，带 10s 增强视野前往嚎叫处——躲出视线最安全 |
| 直视退缩 | 10m 内直视 → cower（伏低后退 0.22× 速度）；有效约 4s，持续噪音 +2s；之后 6s 内无效并冲锋 |
| 别逃跑 | 可见时奔跑 → charge（1.55× ≈ 5.3m/s，慢于冲刺快于步行） |
| 扑击 | 2.4m 内 0.3s 前扑，命中造成伤害 + 镜头震动 + 0.8s 减速；冷却 1.5s |
| 听觉 | 奔跑声半径 ×1.6，循声搜寻 |
| 重伤 | <30% 血量逃离 4s |
| L3 | 保留原伏击逻辑；追击中被直视完全僵住（无时限） |

## 唯一新增变种：L11 中立猎犬
- Level 11 中生成的猎犬默认中立（运行时 `e.hd.neutral`），名称「中立猎犬」，肤色略浅。
- 保持 4.5m（玩家蹲下且静止时 2.6m，会好奇凑近）；坐下、歪头、摇尾。被盯 3s 扭头走开；5m 内奔跑声 → 受惊呜咽逃开。
- 被攻击 → 当前个体持续敌对（`provoked`），10m 内、同楼层的中立同类一起转变；致命首击也触发反应。未被激怒时不主动攻击。沿用项目的实体生命周期，未新增动态实体跨存档持久化。

## 文件
- `src/game/engine/houndAI.ts` 专属 AI；`src/game/renderer/houndMesh.ts` 模型 + `animateHound`
- 接入：`entityAI.ts`（noise / 帧初始化 / generic 分支）、`renderer.ts`、`entitiesMesh.ts`（旧方块模型移除）、`audio.ts`（`houndHowl`）、`types.ts`（`hd`）、`critters.ts`（去掉 `intimidatable`，改图鉴）
- 验收 `npm run check:hounds`（13 项）、`npm run check:hound-integration`（模型、实例释放、实际引擎战斗/召唤及流式坐标）；预览 `proto-hound.html?mode=poses|close|side`
- 不改存档、联机协议、生成表。单只约 24 次绘制。

## 导入验收

生产渲染检查覆盖 Level 2 经典/真实光影和 Level 11 真实光影，验证中立皮肤切换、五种姿态、着色器和三轮创建/回收。每只 24 个网格、10,052 三角面，共享两张 256² 贴图。截图、完整结果和未覆盖范围见 [验收记录](reports/hound-import/REPORT.md)。

四肢使用局部平面双骨求解维持落脚，不增加逐帧地形射线或额外绘制；这是平地姿态校正，不是台阶逐足 IK。尾巴与发丝沿用视觉模型，没有独立碰撞体；狭窄拐角仍可能局部穿墙。未进行长期人工追逐调参、音效听感或移动真机性能验收。

## v62.1 模型细化 + UV 贴图
- 去掉圆柱/方块拼接：躯干、颈、四肢、掌/足、指/趾、爪、耳、下颌全部改为沿 Catmull-Rom 样条扫掠的平滑管体（肌肉鼓包、圆头端盖、椭圆截面），每个都带 UV（u 环向、v 沿长度）。
- 肋骨、脊椎节、肩胛、髋骨、凹陷腹部直接雕刻在躯干表面，并写入顶点色作为 AO（肋间沟变暗、骨突提亮）。
- 头部由 28×20 球体逐顶点雕刻：前突口鼻、眉弓、眼窝（顶点色加深）、颧骨，眼球嵌入眼窝。
- 毛发（v62.2）：不再用分散发片，改为低模壳体 + 毛发纹理：头套壳按雕刻颅骨外扩 13%（前额刘海、两侧直垂、后脑沿颈背铺下）、背鬃壳按躯干实际表面外扩 2.2cm（肩部垂边收短避开上臂）、尾巴为 7 边低模毛束；三次绘制。壳体从皮肤表面函数直接外扩生成，因此不会穿进躯干/颈部。
- 贴图：运行时 Canvas 程序化生成并全局缓存——皮肤 256² 可平铺（斑驳、青灰静脉、污渍、毛孔噪点），毛发 256² 横向可平铺的顺向发束，底部约 22% 为参差发梢镂空（alphaTest 0.5，flipY=false 使 v=1 为发梢）。无外部运行时图片；造型参考和原包来源仍登记于 IMPORT.md。Node 环境（无 document）自动退化为纯色材质。
- 后肢加长以真正着地；关节处加骨突关节块填缝；伏低时躯干下沉减小以免脚陷地。
- 预览：`proto-hound.html?mode=poses|close|side`。

## v62.3 犬类头部
- 按维基附图改为犬头：颅腔缩小（额段/眉弓、矢状嵴、眼窝、颧弓外张），前伸长吻部扫掠体（鼻梁、平直口裂下缘），吻端黑色鼻头；17 齿 U 形上齿弓（犬齿最长）、15 齿下齿弓；下颌与吻部等长；耳改为宽底竖立犬耳。绘制次数不变。
