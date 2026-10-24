# items-refined 图集来源

本目录于 2026-10-07 从用户提供的 `backroom-refined-items.zip` 原样导入。下述原创/分发说明是压缩包内的来源声明，未署名，也未提供独立 SPDX 许可证。完整来源、SHA256、Blender 源文件及生成复现限制见 `app/assets/refined-items/import/IMPORT.md`。本次保留全部 PNG 的原始字节。

四套图集（tools / gear / food / paper）全部为项目原创程序化绘制，由 `scripts/gen-refined-item-atlas.mjs` 以确定性种子离线生成：
不使用任何外部照片、扫描贴图或第三方素材，无需署名，可随项目一同分发。

- `color.png`：1024² sRGB 颜色图集，4×4 分区（每区 256 px，四周 8 px 内缩并做边缘外扩）。
- `normal.png`：512² OpenGL (+Y) 切线空间法线，由同一脚本的高度场经中心差分得到，按分区夹取采样不跨区。
- `roughness.png`：512² 线性粗糙度（灰度，仅“真实”光影模式加载）。
- `layout.json`：分区名称与像素范围；分区内子矩形约定见 `src/game/renderer/refinedItemMesh.ts` 的 `SUB` 常量。

重新生成：在 `app` 目录运行 `npm run generate:refined-items`。

## market（2026-10-23，批发市场 v2）

记忆汁液 / 驱笑剂 / 巴别润唇膏 / 户外医疗箱 / 高级医疗箱 / 盒装火盐六件新物品的图集，由 `scripts/gen-market-item-atlas.py`（PIL，固定种子）程序化生成，同规格（color 1024²、normal/roughness 512²、4×4 分区、8 px 内缩）。标签文字用系统 DejaVu Sans Bold 烘进贴图，不随游戏分发字体。重新生成：`cd app && python3 scripts/gen-market-item-atlas.py`。

当前 Windows 接入支持 `--font PATH`／`MARKET_ATLAS_FONT` 和 `--output PATH`；默认字体不存在时回退到 Windows Arial Bold。回退字体仅保证脚本可执行，文字字形不与原 DejaVu 版逐字节相同。交付三张 PNG 保留原压缩包字节，复现验证输出保存在 `.cache/traders-market-v2-20261023/regenerated-atlas/`，没有覆盖游戏资源。
