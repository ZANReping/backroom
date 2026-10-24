# 商人之家 · 主力店 A「B.N.T.G. 批发市场」+ AI 美式标牌（2026-10-23）

## 内容
- **主力店 A（西北角 `anchor_A`，66 × 81.6 m）改为 B.N.T.G. 批发市场 / TRADERS WHOLESALE**：
  - 中央主通道（8 m）两侧各 4 个部门档口：饮用水与饮料、食品与干货、药房与急救、照明与电池｜特种液体、口粮与杂货、急救箱、燃料与能源（v2，见文末）。每个档口：彩色柜台 + 石材台面 + 收银屏、三面货架、两侧整托端架、吊挂部门牌（双面）。
  - 东西两翼整托货架 AISLE 1–6（三层横梁、收缩膜整托），两端吊挂通道牌。
  - 南侧前场：3 条结算通道（灯箱号牌）、会员服务台、购物车区、营业告示牌、入口防滑垫；主通道黄色安全线。
  - 北侧收货区：两扇卸货门（RECEIVING / FORKLIFT 牌）、叉车、缠膜机、地牛、托盘堆与空托盘。
- **18 个市场居民**（本地 NPC，不进联机协议）：8 位档口老板（按原价出售基础物资，接受压印币、BNTG 信用点与混合支付）、会员服务经理、2 位结算员、叉车/理货/搬运、4 位采购客。
- **NPC 规则**：`tang` 仅咨询；`shen` 仅鉴定；`laozhangfang` 仅保险库存；`candyman` 保持原有糖果交易且不在主力店 A。
- **108 块 AI 生成的现代美式标牌**（每块独立生成）覆盖：三座大门 + EXIT 灯箱、吊挂导视、各商铺/房间门头、保险库行号、批发市场全部标识。图集 `public/textures/traders/signs_atlas.jpg`（2048×4096），映射 `content/tradersSigns.ts`，UV `content/tradersSignAtlas.ts`。
- **16 格商品包装图** `public/textures/traders/goods_atlas.jpg`（虚构美式批发包装）。
- BNTG 文案去中国化：西式姓氏（`tradersPeople.ts`）、去掉算盘/掌柜/账房等意象，`bntgMissions.ts` 补水架任务语境更新。
- 来源与提示词：`SIGNS-SOURCES.md`。

## 主要文件
`content/tradersMarket.ts`（布局、价格、人物）、`renderer/tradersMarketMeshes.ts`（模型）、`content/tradersDressingShapes.ts`（碰撞形状）、`renderer/tradersDressingMeshes.ts`、`content/tradersFurnishings.ts`、`world/tradersWorld.ts`（按 chunk 注入）、`renderer/tradersMeshes.ts`（`signGeometry` / `labelPart` / `goods` 材质）、`content/npcs.ts`、`content/bntgMissions.ts`。

## 压缩包原始校验记录（非本机验收）
- `npm run check:traders-market`（新增，716 项）：标牌 key 全部存在于图集、每个房间都有专属标牌、市场道具都在 anchor_A 内且不挡门、主通道可走；8 位老板都开店、价格 = 原价、站位不在碰撞体内、面向主通道且在对话距离内；居民 id 唯一；tang/shen/laozhangfang 无交易、candyman 保留；BNTG 文案无中国化词汇；居民姓氏为西式。
- 既有：`check:traders-keep`（居民 160 → 178，已同步）、`check:traders-gates`、`check:traders-fitout`、`check:traders-dressing`（全部市场道具包围盒合规）、`check:traders-visibility`、`check:npc-idle`、`check:humanoid-motion`、`check:seating`，全部通过；`tsc --noEmit` 通过。
- 预览：`proto-market.html?cam=x,y,yaw,pitch,h[&npc=0]`（生产建筑/装修构建器，非烘焙材质）。

## 压缩包原始预览限制

以下两项来自上游 SwiftShader 环境。本机使用实际 App 和原生 GPU 另行验收，见文末接入记录。
- 无头 SwiftShader 下烘焙探针材质无法采样，游戏内截图只显示标牌；预览改用 proto（同一套建模代码，普通灯光）。
- 预览里加载 NPC 会让 SwiftShader 丢失 WebGL 上下文，所以图里没有人物；老板站位/朝向由 `check:traders-market` 数值校验。
- 图集内中文副标题由生成模型绘制，个别小字笔画可能不完美。

## v2 · 右侧档口换新（2026-10-23）

- **预留**：五金工具（厄尔）、工装与防护（塔妮莎）、日用与办公（霍华德）、户外露营（卡尔）四位老板与档口定义原样保留在 `MARKET_RESERVED_DEPTS` / `MARKET_RESERVED_PEOPLE`，不在主力店 A 刷出；四块旧部门牌的源图保留在工具目录，暂不打进标牌图集（图集仍 108 块、2048×4096）。
- **新档口**（右侧 0–3 排，原位替换）：

| 档口 | 老板 | 商品（压印币） |
|---|---|---|
| 特种液体 SPECIALTY LIQUIDS | 维奥莱特·克兰 | 腰果水 3、液态痛苦 40、记忆汁液 40、驱笑剂 60 |
| 口粮与杂货 RATIONS & SUNDRIES | 西奥多·博蒙特 | 皇家口粮 60、巴别润唇膏 15 |
| 急救箱 FIRST AID KITS | 卡门·拉莫斯 | 户外医疗箱 18、高级医疗箱 45 |
| 燃料与能源 FUEL & ENERGY | 韦德·哈斯克尔 | 火盐晶体 6、火油桶 22、盒装火盐 28、瓶装闪电 30 |

  定价以杏仁水 1 瓶 = 2 压印币为基准：记忆汁一罐≈20 瓶杏仁水（Object 11 原文）→ 40；皇家口粮沿用军需官 30 杏仁水 → 60。
- **新物品**（`content/items.ts`）：
  - 记忆汁液 `memoryjuice`（Object 11，旧）：不可直接饮用；可装入滋水枪，效果等同清水（储罐琥珀色）。
  - 驱笑剂 `laughrepellent`（Object 3）：事件 A 后失效，仅收藏；可装入滋水枪，效果等同清水。
  - 巴别润唇膏 `babelbalm`（Object 25）：暂无游戏功能；白色膏体微微发光。
  - 户外医疗箱 `outdoorkit`：4 次，每次生命 +30 并止血。
  - 高级医疗箱 `traumakit`：8 次，每次生命 +40、止血、解除迟缓/缠丝。剩余次数存在槽位 `dur`，丢弃/拾取保留，快捷栏显示次数条，详情面板显示「剩余 x/y 次」。
  - 盒装火盐 `saltbox`：可堆叠 3 盒；物品栏「分解 ×5」（或使用）得到 5 份火盐晶体，背包放不下时不拆。
  - 皇家口粮描述补一句「以物易物时能换来高级物资」（既有以物易物配方不变）。
- 滋水枪液体表集中到 `content/squirtLiquids.ts`（名称、消耗物品、`squirtActsAsWater`）；背包面板、快捷轮盘、手持模型颜色同步。
- 美术：4 块新部门牌（AI，提示词见 SIGNS-SOURCES.md）；商品包装图集扩到 1024×2048（16–23 格 AI 新图）；6 件新物品像素图标（`scripts/gen-item-icons.py`）+ 3D 模型（`refinedItemMesh.ts` 新 `market` 图集，`scripts/gen-market-item-atlas.py` 程序化生成）。
- 校验：`check:traders-market`（新增档口库存 / 预留 / 新物品断言）、`check:market-items`（真实 Engine：医疗箱次数、分解火盐、滋水枪装液）、`check:refined-items`（60 件）。

## 原项目接入记录（2026-10-23）

目标为原项目 `E:\ZAN\backroom\app`，源包 SHA256 为 `83c30a1bebae8f56f5c89c038081f64f6f4ce7052768ff7f69dc8aa725fb950d`。先合入完整补丁中的市场 v1 依赖，再接入 v2 增量；未用旧的完整文件覆盖当前项目，已存在的 NPC 闲置动作及其他层级更新继续保留。来源和提示词沿用包内 `SIGNS-SOURCES.md`；PNG/JPG 资源按原字节导入。

适配当前 TypeScript 配置；修正低层办公室铭牌底座厚度与朝向、营业告示的信用点政策、医疗箱次数条无障碍语义，并同步银行回归的市场商贩与 178 人名单。市场静态装饰沿用现有分批生成、按材质合批和共享贴图回收路径，不扩展其他空铺。

`gen-market-item-atlas.py` 支持 `--font` 和 `--output`。默认查找 DejaVu Sans Bold，Windows 可使用 Arial Bold 回退；逐字节重现原标签需显式提供同版本的 DejaVu 字体和 Pillow。此次交付使用压缩包原图，未用回退字体重生成资源。

实际 App（含八个档口交互、信用点结算、物品使用/拾取、存档、双光影截图及资源检查）的结果与复现命令见 [本机验收报告](reports/traders-market-v2-20261023/README.md)。
