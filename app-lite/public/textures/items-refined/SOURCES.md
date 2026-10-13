# items-refined 图集来源

本目录于 2026-10-07 从用户提供的 `backroom-refined-items.zip` 原样导入。下述原创/分发说明是压缩包内的来源声明，未署名，也未提供独立 SPDX 许可证。完整来源、SHA256、Blender 源文件及生成复现限制见 `app/assets/refined-items/import/IMPORT.md`。本次保留全部 PNG 的原始字节。

四套图集（tools / gear / food / paper）全部为项目原创程序化绘制，由 `scripts/gen-refined-item-atlas.mjs` 以确定性种子离线生成：
不使用任何外部照片、扫描贴图或第三方素材，无需署名，可随项目一同分发。

- `color.png`：1024² sRGB 颜色图集，4×4 分区（每区 256 px，四周 8 px 内缩并做边缘外扩）。
- `normal.png`：512² OpenGL (+Y) 切线空间法线，由同一脚本的高度场经中心差分得到，按分区夹取采样不跨区。
- `roughness.png`：512² 线性粗糙度（灰度，仅“真实”光影模式加载）。
- `layout.json`：分区名称与像素范围；分区内子矩形约定见 `src/game/renderer/refinedItemMesh.ts` 的 `SUB` 常量。

重新生成：在 `app` 目录运行 `npm run generate:refined-items`。
