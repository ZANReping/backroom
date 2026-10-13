# Level 1 texture sources

The existing `l1/*.png` textures are generated deterministically by `scripts/gen-l1-materials.mjs`. Groundcover and peeling paint remain in use; the legacy procedural leaf texture has been replaced by the CC0 leaf atlas documented in [polyhaven/SOURCES.md](polyhaven/SOURCES.md). Peeling paint combines existing CC0 concrete with original procedural paint remnants.

The reused `l11_concrete`, `l11_plaster`, and `l11_metal` materials derive from the existing [L11 asset sources](../L11-ASSET-SOURCES.md) and use CC0 ambientCG material sources.

The 18 user references under `app/reference/L1` and the Backrooms wiki inform architecture, materials and viewpoints. Reference photographs are not used as in-game backgrounds or textures. Their credits are recorded in [the remake source record](../../../L1-REMAKE-SOURCES.md).

The small path walls reuse `l3/polyhaven/painted_brick_Color.jpg`, `painted_brick_NormalGL.jpg` and `painted_brick_Roughness.jpg`: [Painted Brick](https://polyhaven.com/a/painted_brick), Amal Kumar, CC0 1.0. Runtime world UV repeats at 0.18/m; the painted-brick luminance is compressed to 0.58–0.89 and normal scale is 0.1. Source images are unchanged.

L1 concrete floors reuse the existing `l3/polyhaven/concrete_floor_worn_001_Color.jpg`, `concrete_floor_worn_001_NormalGL.jpg` and `concrete_floor_worn_001_Roughness.jpg`: [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001), Dimitrios Savva (photography) and Rico Cilliers (processing), CC0. Runtime world UV repeats at 0.22/m for all color, OpenGL-normal and roughness maps; color is multiplied in linear space by 1.65 and capped at 0.82, normal scale is 0.14, and roughness is clamped to at least 0.82. Source images are unchanged.

The painted side rooms and Tianying/path ceilings reuse the existing Plaster004 maps: `l11_plaster.jpg`, `l11_plaster_normal.jpg`, `l11_plaster_roughness.jpg` ([Plaster004](https://ambientcg.com/view?id=Plaster004), Lennart Demes, ambientCG, CC0 1.0; exact source/download records are in [L11 asset sources](../L11-ASSET-SOURCES.md)). Color, OpenGL-normal and roughness use the same world-scale UV; ceiling UV remains continuous rather than resetting every 1m tile.

Crates reuse `alpha/wood_color.jpg`, `alpha/wood_normalgl.jpg`, `alpha/wood_roughness.jpg`: [Wood 051](https://ambientcg.com/view?id=Wood051), Lennart Demes, CC0 1.0. See [Alpha sources](../alpha/SOURCES.md). The original scan is unchanged; crate boards use their real dimensions for UVs, with body repeating at 0.8/m and frame at 2/m, grain aligned to the frame direction, and a runtime pale unfinished-wood tint.

All maps use the existing shared texture cache, mipmaps and quality tiers; normal channels are OpenGL. Roughness maps are requested only in realistic mode. The new plant texture downloader is `npm run fetch:l1-assets`; exact URLs and MD5s are included in its source. No AI-generated texture was added in this remake.

Peeling paint uses the existing CC0 `l11_concrete.jpg` as its base, with original procedural paint remnants and scratches layered on top.

## 2026-10-08 第三轮处理

本轮复用现有 AmbientCG Plaster004 CC0 扫描，不新增贴图，也没有使用 AI 生成纹理。所有 plaster 材质的法线强度统一为 `.045`；颜色采样亮度通过 `smoothstep(.025, .65)` 重映射至 `.66–.82`，以降低大块污渍的对比；小径侧房额外乘色 `#b6cbcb`。柱脚污渍改为沿同一颜色图的亮度变化生成，移除高频 `sin` 条纹。世界 UV、OpenGL 法线、按需粗糙度请求与质量档继续沿用原有路径。

## 2026-10-08 第四轮处理

复用上述 CC0 混凝土、粉刷、Wood051 和既有 `ground/peeling` 贴图。地面、外墙和顶面共享连续世界坐标颜色场，区段边界在 16 米采样支持范围内平滑混合；色差/磨损由连续噪声调制，法线和粗糙度随材质权重响应，不按方格抽取颜色。非小径外墙与顶面改用统一混凝土底图，跃金外墙压低细纹，衔尾混入既有剥落图；小径粉刷色调整为 `#b9cede`。原始扫描不变，OpenGL 法线与按需粗糙度设置沿用原实现。

`crate-marks.png` 是项目原创 1024² 数字图集（00–99 与朝上箭头），来源为 `scripts/gen-l1-crate-marks.mjs` 的几何线段，无外部字体或照片。运行 `node scripts/gen-l1-crate-marks.mjs` 可重建；颜色棕红、边缘透明、保留 mipmap 和图格内间距。数字贴面复用箱体光照并按箱子身份稳定选择，前后面 UV 不镜像；材质/几何随实例回收，图集共享。

## 2026-10-09：跃金波纹钢顶板

`steel.jpg`、`steel_normal.jpg`、`steel_roughness.jpg` 来自 [ambientCG CorrugatedSteel009](https://ambientcg.com/view?id=CorrugatedSteel009)，Lennart Demes，**CC0 1.0 Universal**。本次从原始 1K 包配套提取颜色、OpenGL 法线和粗糙度，缩至 512²；法线缩放后重新归一，不翻转绿通道。世界 UV 以 .45 次/米重复，保留 mipmap、共享贴图缓存和真实模式按需粗糙度。运行时涂装亮度映射只作用于材质，不改写原扫描。

原始文件、下载地址、完整许可链接、SHA-256 和处理步骤保存在 [源资产记录](../../../assets/sources/CorrugatedSteel009/SOURCE.md)；`node scripts/prepare-l1-steel.mjs` 可复现三张运行贴图。本轮未使用 AI 生成纹理。

## 2026-10-09：陈设与箱堆校准（第八轮）

天鹰后墙的砖面继续复用上述 Painted Brick（Amal Kumar，CC0 1.0）三通道扫描，世界 UV 为 0.18/m；本轮没有下载新材质。

`crate-marks.png` 的当前版本由 `scripts/gen-l1-crate-marks.mjs` 重新绘制：红色数字、运输文字及朝上/易碎/防潮轮廓。构图、文字参考用户提供的板条箱照片（Thelmadatter，CC BY 3.0，原图及链接见根级 L1-REMAKE-SOURCES.md）；没有提取或粘贴照片像素。图集以各格内裁切和透明边距避免串色。与第四轮线段版不同，本版通过本机 Windows Georgia 字体栅格化文字，没有随游戏分发字体文件；可复现环境为 Windows + Georgia + @napi-rs/canvas。绘制脚本与 PNG 均随项目保存。

Wood051 原扫描文件保持不变，运行时重映射为 `clamp(.22 + L*1.5, .22, .86)`；单箱/双层箱共享同一木材与印字图集。印字采用柔和 alpha 测试、表面偏移，不参与实体投影。玻璃杯和伞等符号都是图集内的平面印字，不产生额外灯光或独立几何细件。
