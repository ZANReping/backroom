# Level 0.2「重塑的混乱」材质来源

2026-10-25 PBR 返工：本目录全部运行时贴图改为 **CC0 1.0** 扫描 PBR 材质的派生图（albedo + OpenGL 法线 + ORM），
由 `app/scripts/gen-l02-pbr.py` 生成（源包用 `app/scripts/fetch-l02-pbr-sources.sh` 下载，不入库）。
未使用 Backrooms Wikidot 页面图片或用户参考图（参考图只用于人工对比颜色/构图，不入包）。
每张图的源文件 SHA-256、处理步骤、输出尺寸与 albedo 均值见 `manifest.json`。

| 本目录文件 | 原始素材 | 作者 / 发布方 | 许可 | 原始 URL | 用到的源通道 |
|---|---|---|---|---|---|
| carpet.jpg / carpet-normal.jpg / carpet-orm.jpg | Carpet 013（2K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=Carpet013 | Color、NormalGL、Roughness、AmbientOcclusion |
| ceiling.jpg / ceiling-normal.jpg / ceiling-orm.jpg | Office Ceiling 001（4K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=OfficeCeiling001 | Color、NormalGL、Roughness、AmbientOcclusion、Displacement |
| wall.jpg / wall-normal.jpg / wall-orm.jpg | Wallpaper 001 A（2K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=Wallpaper001A | Color、NormalGL、Roughness、Displacement（AO 由置换派生） |
| trim.jpg / trim-normal.jpg / trim-orm.jpg（防撞条） | Rubber 004（2K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=Rubber004 | Color、NormalGL、Roughness、Displacement（AO 由置换派生） |
| osb.jpg / osb-normal.jpg / osb-orm.jpg | Oriented Strand Board（2K） | Poly Haven，Dimitrios Savva | CC0 1.0 | https://polyhaven.com/a/oriented_strand_board | diff、nor_gl、rough、ao、disp |
| stud.jpg / stud-normal.jpg / stud-orm.jpg（龙骨） | Wood 049（2K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=Wood049 | Color、NormalGL、Roughness、Displacement（AO 由置换派生） |
| insul.jpg / insul-normal.jpg / insul-orm.jpg（保温棉） | Fabric 084（2K） | ambientCG（Lennart Demes） | CC0 1.0 | https://ambientcg.com/view?id=Fabric084 | Color、NormalGL、Roughness、AmbientOcclusion、Displacement |

许可说明：ambientCG 全部素材以 CC0 1.0 Universal 发布（https://docs.ambientcg.com/license/ ），Poly Haven 全部素材以 CC0 发布（https://polyhaven.com/license ），
均允许修改与再分发、无需署名；此处仍保留作者与 URL 以便溯源。

## 修改（派生）说明

- 通道：`<名>.jpg` 为 sRGB albedo；`-normal.jpg` 为 OpenGL（+Y）切线空间法线；`-orm.jpg` 为线性数据，R=AO、G=roughness、B=高度
  （地毯的 B 是程序宏观磨损掩码：0.5 中性、>0.5 人流磨损、<0.5 旧渍）。JPEG 质量：albedo 88（4:2:2）、法线 88 / ORM 90（4:4:4 不做色度抽样）。
- 颜色：albedo 用亮度比例上色，均值标定到旧版贴图（地毯 [112,48,44]、墙 [227,223,205]、防撞条 [227,223,205]），运行时 tint 不变即与旧版同色；
  吊顶标定到 Level 0 本体 `l0-remake/ceiling.png` 的均值 [192,180,132]（暖米黄），OSB / 龙骨 / 保温棉按旧 Canvas 程序贴图的底色做通道增益。
- 尺度：地毯 1.5 m/图（Carpet013 按 0.75 m 平铺 2×2）、吊顶 1.2×0.6 m/图（OfficeCeiling001 的 64 cm 板裁两块宽一块高，中间龙骨用同排另一块板内部羽化覆盖）、
  墙 1.11 m/图、防撞条 1.33 m/图、OSB 1.22 m/图（裁 1000 px ≈1.22 m，四周锯边板缝）、龙骨 0.6 m/图（旋转 90° 使顺纹竖直）、保温棉 0.6 m/图（两侧牛皮纸翻边 + 订书钉为程序绘制）。
- 程序叠加（无外部素材）：墙面低频大波 + 竖向滚刷波（乳胶漆微起伏）、吊顶企口细阴影、地毯宏观磨损/旧渍掩码、OSB 印字、龙骨等级印章（DejaVu Sans Bold 字体渲染，字体随 Debian fonts-dejavu 以其自由许可发布，仅用于烘进贴图的少量文字）。
- 运行时：`src/game/renderer/l02Pbr.ts` 在烘焙光照的最终颜色上叠加法线起伏、AO 与地毯磨损；`l0Architecture.ts` 的 L0.2 主题吊顶 tint 由灰 `#d8d6d1` 改为近中性 `#f4f3ef`。

## 其余

- 格栅灯盘、插座、防撞条接缝等仍为几何体 + 纯色/复用 L0 已登记材质；`renderer/l02Scene.ts` 的碎料、裂纹、洗手间瓷砖、板夹纸、标牌仍为程序 Canvas（无外部素材）。
- 2026-10-25 之前的版本（White Plaster 02 / Dirty Carpet 派生 PNG 与 `gen-l02-materials.mjs`）已移除，历史见 git。
