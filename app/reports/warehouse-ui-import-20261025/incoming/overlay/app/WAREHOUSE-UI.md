# 阵营寄存仓库界面 v2

入口不变：寄存 NPC 对话里的「寄存物品 / 取回物品」（声望 ≥10，或 B.N.T.G. 付 5 信用点/压印币临时通行）。
点开后不再塞在对话框里，而是整屏独立页面 `components/warehouse/WarehouseOverlay.tsx`（仍由 DialogOverlay 渲染，
所以临时通行照旧随对话窗卸载清空）。

## 布局
- 左：仓库 48 栏（8×6），每格带库位号；中：所选物品详情 + 数量 + 存/取按钮；右：随身（快捷栏 7 + 行囊 24）。
- 页头：已用栏数 / 48 与进度条、互通基地说明、临时通行徽标。
- 窄屏（≤860px，手机）：单列，仓库 → 随身 → 详情。

## 操作
- 点格选中，选数量后「寄存 / 取回」；双击整格移动；拖到另一侧整格移动（桌面）。
- 同类一键：「全部入库 / 全部取出『物品名』」。
- 整理：同类同 tag 并摞，按 武器→医疗→食水→电源照明→装备→杂项、再按稀有度和名称排序，空栏放最后。
- 键盘：Tab 切换仓库/随身 · 方向键选格 · Enter 整格移动 · Shift+Enter 同类全部 · E 返回交谈 · Esc 关闭。

## 皮肤
- M.E.G. 联合物资库：橄榄钢板货架、黄黑警示条、模板喷字库位号（A-01…F-08）、牛皮纸登记吊牌、「登记入库 / 领出」。
- B.N.T.G. 保管箱库：墨绿金库、黄铜保管箱（空箱显示锁孔，号牌 001…048）、锯齿边存取凭条、「存入保管箱 / 取出」。
- 纯 CSS 绘制，无新增图片；字体沿用商店界面已引入的 Special Elite / Noto Serif SC。

## 引擎（engine/warehouse.ts 新增）
`warehouseDepositN` / `warehouseWithdrawN`（分量，放不下时原子失败）、`warehouseDepositAllOf` / `warehouseWithdrawAllOf`、
`warehouseSort`、`warehouseCat`。原有 `warehouseDeposit` / `warehouseWithdraw` 与存档格式不变。

## 验收
`npm run check:warehouse-ui`（22 项）。预览：`proto-shop-ui.html?npc=suanpan&mode=dialog&wh=1&click=寄存物品`
（vesper = B.N.T.G.；`click2=<选择器>` 预选一格）。截图见 `reports/warehouse-ui/`。
