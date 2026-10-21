# Backroom L1 v3（基于上游 8423ae3）

应用：在仓库根目录 `git apply full-vs-8423ae3.patch`，或把 overlay/ 覆盖到仓库根目录并删除 deleted.txt 中列出的文件（若有）。
这是 v3 的首次交付，故增量补丁 = 全量补丁。

## 内容
1. 天鹰段 9 套样貌（common/round/room/water/bright/clean/dry/dim/dark），按参考区/加权随机分配到各大厅区域。
   v3.1：保持原混凝土扫描贴图为底，参考样貌只叠加柔和色调、明暗和大片污渍（renderer/l1Materials.ts）。
2. L1 装饰物重做：折叠桌、塑料椅、波纹板、百叶罩、灭火器、漆桶、小心地滑牌（renderer/l1PropDetail.ts，带 UV 与程序化贴图）。
3. 衔尾段施工状态材质：地面、柱、砌块、补丁、黑板、保温层（textures/l1/ouro）。
4. 花园段：苔藓/常春藤/落叶混合地面，藤蔓、蕨、灌木、草丛 atlas 植被及密度变化（textures/l1/garden）。
5. 标牌：renderer/factionSigns.ts 按势力样式（M.E.G./B.N.T.G./希波克拉底/Tom/Argos/BRC/Jerry/工业/黄铜/危险），
   接入所有据点入口、服务台、Alpha 门牌、交易牌、高压牌、L8 路标、L11 Beta 入口、据点公告栏（原空白板）。L4/L5 标牌（含 L5 房号牌、高压牌）保持原样。
贴图来源与生成提示词：app/public/textures/l1/SOURCES.md。

## 预览
preview/：eagle-skins.jpg（贴图）、ingame-eagle.jpg、eagle-concrete.jpg（改前/改后）、ouro-garden-tex.jpg、props.png、signs.png、boards.png（据点公告栏）。

## 检查
tsc --noEmit 通过；vite build 通过。

## 已知问题
- 无头截图里传送到参考区/暗色样貌时 SwiftShader 常出现 WebGL context loss（白屏），出生场景正常；
  强制衔尾/花园出生的游戏内截图仍停在 L0，未能实拍，只有贴图预览。
- 布旗未改。
