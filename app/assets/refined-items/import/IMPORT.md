# 55 件物品导入记录

导入日期：2026-10-07。用户明确要求导入其本机提供的压缩包。

- 原始来源：`C:/Users/ZANRe/Downloads/backroom-refined-items.zip`，没有公开下载 URL。
- 包大小：19,006,075 字节。
- SHA256：`e796e4fe0244b31f2e8e6e88c2fb1bbeec2c9b1af92d675995d32644cbfc6a39`。
- 作者：包内未署名；不另行推定作者身份。
- 许可：包内 `SOURCES.md` 声明图集为原创程序化绘制、不含外部素材、无需署名、可随项目分发；未提供独立 SPDX 许可证。这里保留提供者声明，不将其改称 CC0 或其它许可证。
- 原始说明、离线预览和统计：本目录的 `README.original.md`、`contact-sheet.original.png`、`report.original.json`。
- 原始文件摘要：`files.sha256.json`。这些是导入时的原始摘要；运行时代码和验收文档后续发生的修正不会覆盖原始摘要。
- Blender 来源模型：`../models/obj/` 共 55 个 OBJ 与 55 个 MTL，`../models/textures/` 保留其相对纹理路径。该目录原样保存，不是生产包中的重复资源。
- 游戏模型：`app/src/game/renderer/refinedItemMesh.ts`；正式图集：`app/public/textures/items-refined/{tools,gear,food,paper}/`。
- 生成器：`app/scripts/gen-refined-item-atlas.mjs`，来自同一用户包。本次没有使用外部素材、生成式图像或新增贴图。

## 合并方式与修正

审阅并合并包内模型入口与扳手/木板握持变更，没有执行包内完整 patch，也没有覆盖其 package.json 到项目。既有其它模型、数值、物品 ID、存档、拾取光环和缓存接口保留。

运行时代码另外修正两点：类型守卫改为自有属性查询，避免 `constructor` 等未知物品 ID 被错误分派；盘绳统一计算整条曲线的截面，再分段分配 UV，消除独立分段形成的开口，保持 960 三角面和 1 个批次。原始 OBJ 保留修正前版本；需要修正后的 Blender 模型时使用检查脚本的 `REFINED_ITEM_EXPORT` 导出。

检查脚本增加实际释放事件、共享纹理保护、曲线接缝及原型名称回退验证。新增独立浏览器验收入口和导入前工厂快照；验收页面不写玩家存档。

## 生成复现范围

在隔离目录运行原脚本成功。16 个输出中 7 个与原包 SHA256 一致，9 个不同：四套 `color.png`、四套 `normal.png` 以及 `paper/roughness.png`。脚本引用 Arial、Georgia、Impact、Comic Sans MS、Segoe Script 等系统字体，未随包固定字体文件；Canvas 和字体环境可影响输出。这里记录差异，不宣称已证明全部差异只由字体导致。

生产资源保持原包字节不变；预览显示的是这些原包贴图。若未来重绘，应先输出到独立目录并做视觉对照，再决定是否替换。
