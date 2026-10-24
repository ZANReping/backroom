# 售货机重制（普通售货机 + Entity 36「人制品售货机」）

参考：backrooms-wiki-cn entity-36；外观参考日式罐装饮料售货机。品牌全部虚构。

## 阶段 1 建模 · 阶段 2 动画
- `renderer/vendingMesh.ts`：共用机身（灯箱、两层 4 格陈列窗、价签、红绿灯条、封闭落货通道、取货斗、操作区）；E36 顶门巨臂、底门双臂腿、白骨推货手、后部暗格三具艾里克尸体。
- `renderer/vendingAnim.ts`：12 个片段（idle/coil/jam/hand/restock/stand/crawl/open/chop/grab/stun/whisper），无状态。
- 预览 `proto-vending.html`（含 `view=cut` 剖面）。

## 阶段 3 机制
- `content/vendingLayout.ts`：品牌 / 每格商品 / 初始库存由种子决定，渲染、引擎、界面三方共用。
- `engine/vendingAI.ts`（数值表 `VM`）：
  - 交互界面：字母键 A/B + 数字键 1–4，红色数码屏；出货片段在 3D 机器上实时播放，货落进取货口后在界面上取走。
  - 普通机：免费，每格 1–3 件，卖光亮红灯；每次出货 25% 卡货（卡在格口，之后罢工，写进 `s.data.jammed/jamSlot`）；拍打机身 35% 把卡住的那件拍下来。只收磁带的旧机器：一盘磁带 = 2 次额度。
  - E36：白骨手推货，产品取出后为物品「人制品」；每格 2 件，每 300 s 瞬间补满，补货 / 出货时传出哭声（附近理智 -3）。
  - 背面是安全辨认（取消原「背对激活」）。
  - 成瘾：每份人制品 +22；≥25 离售货机 30 m 外持续掉理智；≥50 有概率拒食别的食物；100 成为受害者——它不再攻击你，每 240 s 抹掉地图探索记忆；不吃会缓慢戒断，<60 解除受害者。
  - 激怒只由攻击触发：近战伤害 ×0.12；瓶装闪电 -70 并电晕 8 s。活化流程 emerge（站起 1.6 s）→ chase（1.4 m/s 爬行）→ open（首次伸巨臂）→ chop（-18）/ grab（贴身 -10 + 减速）；跟丢 16 s 或 >26 m → 爬回原位 → settle → 休眠。
  - 血量见底：瘫倒（不算击杀），从背面撬开暗格：三具艾里克尸体低语（理智 -15）。
- `renderer/vendingRender.ts`：状态 → 片段，卖光的格子藏货 + 红灯；普通机走 `updateStructs`（vending 加入 ANIM_STRUCT），E36 走实体循环。
- 界面 `components/VendingOverlay.tsx/.css`；App overlay `'vending'` 不暂停游戏。
- 验收 `npm run check:vending`（81 项）；界面预览 `proto-vending-ui.html`，截图 `scripts/verify-vending.mjs ui-*`。
