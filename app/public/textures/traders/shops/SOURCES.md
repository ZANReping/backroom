# 北排主题小店纹理来源（2026-10-23）

每家店一套地 / 墙 / 顶纹理（`<店>_<部位>_color|normalgl|roughness.jpg`），由 Hark 用图像生成模型（generate_image）生成源图，
再用 `scripts/gen-traders-shop-textures.py` 处理：去低频光照、无缝化（按图案方向只在需要的轴上融合）、缩放到 1024²（顶 512²），
由亮度生成 Sobel 法线与粗糙度（512²）。无第三方素材。

| 店 | 部位 | 来源 | 提示词要点 |
|---|---|---|---|
| hw 五金 | floor | AI | worn narrow red-oak hardwood floor boards of an old 1970s American hardware store, honey varnish worn pale, nail holes |
| hw 五金 | wall | AI | cream painted hardboard pegboard, square grid of round holes, slightly yellowed |
| hw 五金 | ceiling | AI | antique American pressed tin ceiling tiles, Victorian floral medallion, aged ivory |
| ww 工装 | floor | AI | industrial steel diamond tread plate, galvanized, scuffs |
| ww 工装 | wall | AI | vertical corrugated steel cladding painted deep navy blue |
| ww 工装 | ceiling | AI | black-painted corrugated steel roof deck |
| cd 糖果 | floor | AI | polished pastel terrazzo, cream base with candy-coloured chips |
| cd 糖果 | wall | 程序生成 | 粉白竖条壁纸 + 樱桃红细线（AI 两次被内容策略拒绝，改为脚本绘制） |
| cd 糖果 | ceiling | 程序生成 | 薄荷绿底白色波点 |
| of 文具 | floor | AI 细节 + 程序棋盘 | 1950s black / off-white checkerboard linoleum（棋盘格按 8×8 精确重绘，叠加 AI 图的表面细节） |
| of 文具 | wall | AI | cream wallpaper with mint pinstripes and tiny gold fleur motifs |
| of 文具 | ceiling | AI | vintage white fissured acoustic ceiling tiles in a T-bar grid |
| od 户外 | floor | AI | rustic flagstone, grey-blue and rust slate, random ashlar |
| od 户外 | wall | AI | log cabin wall of stacked half-round knotty pine logs |
| od 户外 | ceiling | AI | tongue-and-groove knotty cedar planks |
| gn 兵械库 | floor | AI | polished dark walnut herringbone parquet floor of an old 19th century gunsmith's shop, worn wax |
| gn 兵械库 | wall | AI | deep forest-green Victorian damask wallpaper with antique gold leaf damask motif |
| gn 兵械库 | ceiling | AI | antique pressed tin ceiling tiles painted matte black with worn gilded raised square coffers and rosettes |

完整提示词均为「Seamless tileable PBR albedo texture, perfectly top-down / straight-on orthographic view, flat even diffuse lighting … No text, no perspective, no watermark.」模板加上表要点。

## 当前项目导入记录

- 导入自用户提供的 `backroom-full-shops-guns.zip`（2026-10-23），文件 SHA-256：`aa92431ab00cf2b96996bc7e018933f79d2c3f9345736a73907e81239ac34800`。
- 上表中的 Hark 作者、AI 生成方式和「无第三方素材」均来自包内说明；压缩包未提供这些新图的单独许可证或完整原始生成会话，不额外推定第三方许可。现有扫描材质仍沿用项目原来源记录。
- 实际交付为 18 套共 54 张 JPEG：颜色 1024² RGB，法线 512² RGB，粗糙度 512² L；导入保留字节，未重新压缩。包内文字曾写顶图 512²，以实际交付尺寸为准。
- 枪械材质由 `renderer/firearmMesh.ts` / `firearmGuns.ts` 中 Canvas 程序绘制；新像素图标及标牌沿用包内交付，来源哈希、尺寸审计和截图见 `reports/shops-guns-import-20261023/`。
- 处理脚本已移除原机器的 `/workspace/...` 路径。运行 `python scripts/gen-traders-shop-textures.py --help` 查看参数；提供 `--source-dir` 内的 `shop_<surface>.png` 后，可用 `--output-dir` 输出颜色/法线/粗糙度，`--contact-sheet` 保存对照表。其原算法的顶图输出默认 512²。
- **包内没有 AI 原始 PNG**，因此本次不能重建这些原图或保证重生成与交付图逐字节相同。缺少输入时脚本在写入贴图前明确报错；已交付的完整 PBR 图不依赖生成脚本即可运行。
