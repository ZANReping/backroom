# 近战武器重制（刀 / 撬棍 / 管钳 / 木板 / 斧头）

基线 002514e。阶段 1 3bb53bb（建模）→ 阶段 2 08be356（握持 + 动画）→ 阶段 3（机制，本提交）。

## 操作
- **短按**攻击键：普攻。刀会左右交替快划。
- **按住**（超过 0.2s 开始蓄力）：蓄力；松开放重击。蓄力不到 40% 就松开，算普攻。
  - 满蓄时手会发抖。
  - 重击伤害 ×1.4～1.8（随蓄力程度），体力消耗 ×2，耐久消耗 ×2。
  - 体力不够重击的消耗时不能蓄力。
- **右键**：耐久低于 50% 或已成残件时修理。
  - 消耗 1 份钉子或尼龙绳，需 3.2s，修到上限的 50%。残件修好后变回完好。
  - 修理中途切换武器会中断，不消耗材料。
- 触屏：攻击键支持按住蓄力。

## 挥砍时间表（content/melee.ts，动画 renderer/meleeAnim.ts 与之一致，check:melee 校验）
| 武器 | 普攻 | 重击 | 判定窗（普攻） | 距离 | 耐久 | 特性 |
|---|---|---|---|---|---|---|
| 刀 | 0.42s | 0.62s 前刺 | 26%–55% | 1.6m | 60 | 背刺 ×2（目标未在追你、你在它背后） |
| 撬棍 | 0.85s | 1.23s 勾拉 | 40%–60% | 2.0m | 150 | — |
| 管钳 | 0.78s | 1.13s 下砸 | 38%–60% | 1.9m | 120 | 硬直 0.6s（重击 +0.25s） |
| 木板 | 0.94s | 1.36s 下拍 | 42%–64% | 2.3m | 25 | 一次打 3 个目标 |
| 斧头 | 1.12s | 1.62s 劈 | 45%–58% | 2.0m | 40 | 劈门 -8 耐久（约 5 扇门） |

- 前摇结束才判定命中。前摇中换武器或收手，这一下作废。
- 命中卡帧 0.06s（重击 0.11s），期间动画和判定冻结。
- 没打中任何目标、但准星方向在攻击距离内有墙：弹刀。
  - 回震动画、镜头抖动、铛声，耐久 -3，后半段收招提前结束。
  - 挥空不扣耐久。
- 耐久消耗：命中 -1，重击命中 -2，弹刀 -3。跌破 25% 时提示一次，并显示裂纹磨损。

## 残件
- 耐久归零后物品不会消失，名字变为「××（残件）」，模型换成残件版。
- 残件伤害倍率：刀 0.5、撬棍 0.6、管钳 0.55、木板 0.5、斧头 0.35。
- 残件攻击距离也会缩短（例如木板从 2.3m 降到 1.7m）。
- 刀的残件不能背刺，斧头的残件不能劈门。
- 残件不再扣耐久。

## 数据与兼容
- `InvSlot.dur` 记录单件耐久：缺省视为满耐久（兼容旧存档），0 表示残件。
- `InvSlot.blood` 记录刃上血污（0..1）。
- `GroundItem.dur` / `blood`：丢下再捡起时保留。
- 近战武器不再堆叠。
- 全局 `eng.axeDur` 已弃用（恒为 0）。

## 界面
- 快捷栏每格底部显示耐久条：>50% 绿、≤50% 黄、≤25% 红、残件灰。
- 选中物品名后面显示 耐久/上限。
- 背包详情显示耐久、残件说明和修理提示。

## 文件
- 新增：
  - content/melee.ts
  - engine/melee.ts
  - renderer/meleeMesh.ts、renderer/meleeAnim.ts
  - proto-melee.html 及 src/proto/melee*
  - scripts/verify-melee.mjs、scripts/check-melee.ts
- 修改：
  - engine.ts、engine/combat.ts（`strike()` 从 `attack()` 中抽出，空手出拳行为不变）
  - engine/inventory.ts、engine/interact.ts、core/types.ts、core/audio.ts（新增 `clang`）
  - renderer/viewmodel.ts、retroViewHand.ts、itemsMesh.ts、renderer.ts
  - App.tsx、components/HUD.tsx、InventoryOverlay.tsx、TouchControls.tsx
  - package.json

## 验收
- `npm run check:melee`：131/131 通过。
- 回归测试全部通过：careers、duller-integration、jerry 120/120、partygoers 113/113、refined-items、retro-hands、shrimp 57/57、six-items、item-batches。日志在 reports/melee/regress。
- 预览：`proto-melee.html?anim=1&mode=grid|hold|one`，参数 `&broken=1&worn=&blood=&charge=&bounce=`。

## 待办
- 横扫时前臂会横过画面下方，深色袖子显得比较大。
- 联机：挥砍同步本轮不做。
- 游戏内实机截图；GPU 蒙皮真机复验。
- NPC 挥击仍使用旧的 1.8m 判定。
