# v28：53 件原创像素画物品图标 验证记录

## 改动
- `public/textures/icons/pixel/item_<id>.png` × 53：128×128 RGBA（32×32 原稿 4 倍最近邻放大），
  内部原创像素画（参照后室 Wikidot/Fandom 物品设定设计），无外部版权来源；SOURCES.md 已注明
- `src/components/HUD.tsx` ItemGlyph：新增 `PIXEL_ICON` 白名单（53 id），
  回退链 **像素贴图 → v14/v21 旧贴图（ICON_IMG 保留）→ 手绘 SVG**（onError 逐级降级）；
  路径 `textures/icons/pixel/item_<id>.png`，URL 拼接与现有 ICON_IMG 机制一致（BASE_URL）
- 渲染：像素/旧贴图 img 均加 `imageRendering: 'pixelated'`；`index.css` 追加 `img.pixel-icon` 类
  （pixelated + crisp-edges）保证背包小格子像素锐利
- `verifier/v1/check.mts` 新增标准 [8]：53 件像素贴图存在性、128×128 RGBA（PNG IHDR 校验）、
  <64KB、PIXEL_ICON 登记、pixel/ 路径、回退链、pixelated、SOURCES.md 记录
- `verifier/v1/shots-v28.py` 新增 Playwright 验证（1280×800，dist 静态服务）

## 验证结果
- `npx tsc --noEmit` ✓；`npm run build` ✓
- check.mts：**651 通过 / 0 失败**（含 v28 标准 218 项）
- smoke-v25 / smoke-v26 / smoke-v27：全部通过
- Playwright 1280×800：
  - 背包给予全部 53 件（背包扩容同屏）：53/53 像素 img 渲染、0 张加载失败、0 张旧贴图残留
  - 容器搜刮面板（补给箱 12 件）：12/12 像素 img、0 加载失败
  - console 0 报错；HTTP≥400 为 0（53 张贴图无 404）
  - 截图 `verifier/runs/shots-v28/d-inventory-53pixel.png` / `d-lootpanel.png`：
    逐个目检无默认 box、无旧 SVG 占位，像素风格统一、边缘锐利

## 备注
- `.pixelart-a/.pixelart-b` 源目录由 lead 清理，本分支未动
- Playwright 中 lootPanel 需借用真实容器 sid（引擎每帧校验 2.5m 交互半径），
  且 L0 无限模式远距离传送触发 chunk 窗口平移会清空 lootPanel——先传送稳定后再打开
