# Level 11 texture sources

All fifteen sets are sourced from ambientCG's official asset pages and downloaded as their 1K JPG packages. The publisher and author are recorded as Lennart Demes. The applicable license is Creative Commons CC0 1.0 Universal, as documented by [ambientCG's license page](https://docs.ambientcg.com/license/) and [legal page](https://docs.ambientcg.com/legal/).

| Asset page | Author / publisher | License | Color map | OpenGL normal map | Roughness map |
|---|---|---|---|---|---|
| [Concrete034](https://ambientcg.com/view?id=Concrete034) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_concrete.jpg` | `app/public/textures/l11_concrete_normal.jpg` | `app/public/textures/l11_concrete_roughness.jpg` |
| [Asphalt012](https://ambientcg.com/view?id=Asphalt012) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_asphalt.jpg` | `app/public/textures/l11_asphalt_normal.jpg` | `app/public/textures/l11_asphalt_roughness.jpg` |
| [Bricks097](https://ambientcg.com/view?id=Bricks097) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_brick.jpg` | `app/public/textures/l11_brick_normal.jpg` | `app/public/textures/l11_brick_roughness.jpg` |
| [Plaster004](https://ambientcg.com/view?id=Plaster004) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_plaster.jpg` | `app/public/textures/l11_plaster_normal.jpg` | `app/public/textures/l11_plaster_roughness.jpg` |
| [Tiles074](https://ambientcg.com/view?id=Tiles074) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_tiles.jpg` | `app/public/textures/l11_tiles_normal.jpg` | `app/public/textures/l11_tiles_roughness.jpg` |
| [Metal032](https://ambientcg.com/view?id=Metal032) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_metal.jpg` | `app/public/textures/l11_metal_normal.jpg` | `app/public/textures/l11_metal_roughness.jpg` |
| [WoodFloor051](https://ambientcg.com/view?id=WoodFloor051) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_wood.jpg` | `app/public/textures/l11_wood_normal.jpg` | `app/public/textures/l11_wood_roughness.jpg` |
| [Grass004](https://ambientcg.com/view?id=Grass004) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_grass.jpg` | `app/public/textures/l11_grass_normal.jpg` | `app/public/textures/l11_grass_roughness.jpg` |
| [PavingStones035](https://ambientcg.com/view?id=PavingStones035) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_paving.jpg` | `app/public/textures/l11_paving_normal.jpg` | `app/public/textures/l11_paving_roughness.jpg` |
| [Tiles139](https://ambientcg.com/view?id=Tiles139) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_limestone.jpg` | `app/public/textures/l11_limestone_normal.jpg` | `app/public/textures/l11_limestone_roughness.jpg` |
| [Tiles107](https://ambientcg.com/view?id=Tiles107) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_ceramic.jpg` | `app/public/textures/l11_ceramic_normal.jpg` | `app/public/textures/l11_ceramic_roughness.jpg` |
| [TactilePaving002](https://ambientcg.com/view?id=TactilePaving002) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_tactile.jpg` | `app/public/textures/l11_tactile_normal.jpg` | `app/public/textures/l11_tactile_roughness.jpg` |
| [Wood051](https://ambientcg.com/view?id=Wood051) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_propwood.jpg` | `app/public/textures/l11_propwood_normal.jpg` | `app/public/textures/l11_propwood_roughness.jpg` |
| [Fabric061](https://ambientcg.com/view?id=Fabric061) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_fabric.jpg` | `app/public/textures/l11_fabric_normal.jpg` | `app/public/textures/l11_fabric_roughness.jpg` |
| [Wood092](https://ambientcg.com/view?id=Wood092) | Lennart Demes / ambientCG | CC0 1.0 Universal | `app/public/textures/l11_rawwood.jpg` | `app/public/textures/l11_rawwood_normal.jpg` | `app/public/textures/l11_rawwood_roughness.jpg` |

The four paving sets are copied and renamed without image processing. `PavingStones035` uses a project placement repeat of 2.4m × 2.4m, with an intended 0.6m × 0.3m pedestrian paving module; this is a project-design scale rather than an official measured asset dimension. `Tiles139` (limestone) uses the official 2m × 2m scale, `Tiles107` (ceramic) uses the official 1m × 1m scale, and `TactilePaving002` uses the official 0.8m × 0.8m scale. No noise textures or generated image content were added.

Download endpoint: `https://ambientcg.com/get?file=ASSET_1K-JPG.zip` (replace `ASSET` with the asset ID above). Assets are CC0; see the [ambientCG license](https://docs.ambientcg.com/license/).

The existing `scripts/fetch-l11-assets.ps1` downloads each 1K JPG package and copies/renames `Color.jpg`, `NormalGL.jpg`, and `Roughness.jpg` into the paths above. For Grass004 the reproducible source archive is `https://ambientcg.com/get?file=Grass004_1K-JPG.zip`; the material is copied without image processing and has a 1.4m × 1.4m physical repeat. No additional image processing was added. `NormalGL.jpg` is the OpenGL-oriented normal map. Color maps are interpreted as sRGB; normal and roughness maps are data maps interpreted in linear space. The renderer applies world-space UVs and controls texture quality scaling through its existing runtime material/quality path.

Level 11 does not use noise textures. Paint and glass use solid-color PBR parameters, and loading placeholders are single-color 1-pixel textures. The full sign faces below were generated at the user's explicit request; building surfaces continue to use the CC0 sets above.

### Reference facade revision 10: runtime material adjustments

The bronze office curtain wall and raised entrance reuse project-owned geometry and solid-color physical glass; they add no texture files. The glass has three restrained bronze/green tints, opaque closed storeys and transparent accessible rooms. Frames, floor spandrels and plinth joints are geometry on every elevation, including the back of the building.

Exterior cut-stone cladding reuses **Tiles139**, by Lennart Demes / ambientCG, under **CC0 1.0 Universal**, from the source URL and local color/OpenGL-normal/roughness paths in the table above. `l11FacadeStone()` in `src/game/renderer/l11Materials.ts` compresses the original tile color variation into a warm limestone range and reduces normal strength to 0.055; it retains the shared 2m UV repeat, quality selection and source channels. This grade applies only to the facade clone; interior floors retain their existing material. The source images are unchanged.

Roads reuse **Asphalt012**, with the same author, license and recorded source paths above. The runtime grade converts sampled linear albedo luminance to `0.06 + luminance * 0.11`, reducing the scan's strong light patches while retaining its normal/roughness maps and 4m UV repeat. Both adjustments are reproducible in `l11Materials.ts`; neither adds noise or generates replacement bitmap content. Reference and ordinary-world screenshots, including low-quality and classic-lighting checks, are recorded in `reports/l11-reference/`.

## Generated complete signs — early 2000s

The user requested complete signboards rather than standalone logos. Thirty-two original faces include all printed lettering, illustration, background, rules and borders. They were generated with the **built-in `image_gen` tool** using the imagegen skill, without the CLI fallback. These are project-directed AI-generated images; no third-party artist or CC0 license is claimed for them. No real business logo was intentionally reproduced. The source is the local generation recorded in [source-manifest.json](../../assets/l11-signage/source-manifest.json), not a downloaded asset website.

| Source PNG under `app/assets/l11-signage/sources/` | Complete faces |
|---|---|
| `shops.png` | 春禾面包房、蓝岸咖啡、新鲜果蔬、启明书店 |
| `commerce.png` | 运河旅馆、大众维修、民生超市、街角百货 |
| `addresses.png` | 银杏公寓、春晖里、汇景商务中心、天际写字楼 |
| `industry.png` | 城市仓储、街区工坊、运河水务、城市体育馆 |
| `civic.png` | 城市公共档案馆、城市博物馆、光华学校、市民服务中心 |
| `destinations.png` | 地下步行站台、郊区入口、乡间小路、公共档案馆步行入口 |
| `streets.png` | 运河路、银杏街、档案馆路、环城路 |
| `facilities.png` | 城市公交 11 路、公共停车场、滨河步道、上层暂停开放 |

Exact prompts and iteration notes: [FULL-SIGN-PROMPTS.md](../../assets/l11-signage/FULL-SIGN-PROMPTS.md). Original PNGs are preserved unchanged. `node scripts/prepare-l11-signage.mjs` detects the four opaque face bands in each source, trims outside gutters, resamples complete faces and extrudes edge pixels into an eight-pixel atlas inset. It does not repaint lettering, illustrations or noise. Source pixel rectangles and bottom-left UV coordinates are recorded in `assets/l11-signage/atlas-manifest.json` and `src/game/content/l11SignAtlas.json`.

Runtime files are `public/textures/l11_signs.png` (4096×2048) and `l11_signs_low.png` (2048×1024). Matching PBR exports are `l11_signs_normal.png`, `l11_signs_normal_low.png`, `l11_signs_roughness.png` and `l11_signs_roughness_low.png`; these contain uniform OpenGL normals `(128,128,255)` and roughness `185/255`. Runtime uses the same analytic flat normal and uniform roughness instead of allocating GPU copies of constant channel images. Color is sRGB, with linear/mipmap filtering and anisotropy; one shared material samples all faces by UV. Low quality selects the smaller color atlas and refreshes texture ownership. Sign cases use the CC0 metal material above. World dimensions follow each registered mounting location, rather than tiling the printed face.

Inspection: all eight source sheets and the assembled low-resolution atlas were visually checked for the requested Chinese text, full rectangular face coverage, graphic variety and 2000s storefront/wayfinding character. The earlier isolated-emblem attempt was superseded and is not loaded by the game. In-game near/front/back, classic/realistic lighting and quality-switch results are recorded in `app/reports/l11-remake/`.

## Parameterized Level 11 geometry

### Complete vertical office banner (reference district)

The orange PEGASUS / OFFICE STUDIOS board is a complete image generated with the built-in imagegen tool for the 2000s city scene, using the vertical orange board in `reference/L11/11iconic.jpg` as visual guidance. It is an AI-generated project asset, not a CC0 third-party download. Original source and exact prompt are preserved in `assets/l11-reference-signs/source.png` and `prompt.txt`; `manifest.json` records the original generated path, crop, physical size and every output.

`node scripts/prepare-l11-reference-banner.mjs` crops only the gray margins and resizes the intact rectangular face to 384×2048 and 192×1024. Runtime files are `l11-reference-banner.png` and `l11-reference-banner_low.png`. Matching `_normal.png` and `_roughness.png` files contain uniform OpenGL normals `(128,128,255)` and roughness `185/255`; the renderer uses those constant values analytically. No noise texture is used. The 2.3×14m face is registered in `src/game/content/l11ReferenceSigns.ts` and mounted on a solid board and brackets belonging to the building, with shared collision geometry. The generated spelling, edges and crop were inspected; in-game evidence is in `reports/l11-reference/`.

### Additional complete vertical building signs

Hotel, clinic and cinema are complete early-2000s retro sign faces generated with the built-in `image_gen` tool. They are AI-generated project assets by **OpenAI image_gen (AI-generated)** and are not CC0 assets; no third-party artist or redistribution license is claimed. The original generated PNGs are preserved locally at `assets/l11-vertical-signs/{hotel-source.png,clinic-source.png,cinema-source.png}`. Exact prompts remain unchanged in `assets/l11-vertical-signs/prompts.json`; `manifest.json` records each original path, source dimensions, crop, local source path, world size and outputs.

`node scripts/prepare-l11-vertical-signs.mjs` crops the surrounding white margins while preserving each complete metal-edged board, then emits high quality 256×1280 and low quality 128×640 albedo files. Matching `_normal.png` files are flat OpenGL normals `(128,128,255)` and matching `_roughness.png` files are uniform `185/255`; no noise texture or noise processing is used. Outputs are `l11-vertical-{hotel,clinic,cinema}.png`, their `_low` variants, and matching channels under `app/public/textures/`. Registered sizes are hotel 1.3×6.5m, clinic 1.2×6m and cinema 1.5×7.5m; type and source references are in `src/game/content/l11VerticalSigns.ts`.

The 32 building archetypes and 108 street/interior prop archetypes used by the Level 11 rebuild are generated from project-owned parameterized meshes. They do not add or redistribute third-party model assets. Their dimensions, component recipes, collision flags, and placement metadata are defined in `src/game/content/l11Buildings.ts`, `l11Decor.ts`, and the corresponding `*Parts.ts` files.

The external visual assets documented for this set include the fifteen ambientCG texture families above, the CC0 tree foliage below, and the CC0 HDR sky below. Generated geometry remains project-owned; these records make the external source, author, license, processing, and runtime paths explicit. `Wood051` is also used for prop wood and is copied without image processing from `public/textures/alpha/wood_color.jpg`, `wood_normalgl.jpg`, and `wood_roughness.jpg`; its project repeat is 0.8m × 0.8m. `Fabric061` is used for upholstery and is copied without image processing from `public/textures/settlements/fabric_color.jpg`, `fabric_normalgl.jpg`, and `fabric_roughness.jpg`; its project repeat is 0.4m × 0.4m. `Wood092` is used for construction pallets, cable reels and wooden crates. Its 1024² maps are copied without image processing from `assets/l11-props/Wood092_1K-JPG_Color.jpg`, `NormalGL.jpg` and `Roughness.jpg`; the original archive is preserved at `assets/l11-props/Wood092_1K-JPG.zip`. Its official physical size is 0.8m × 0.8m, and runtime UVs exchange axes to follow the board grain. All three use OpenGL normals and the existing shared quality and mipmap loading path. Their reproducible source archives are [Wood051_1K-JPG.zip](https://ambientcg.com/get?file=Wood051_1K-JPG.zip) and [Fabric061_1K-JPG.zip](https://ambientcg.com/get?file=Fabric061_1K-JPG.zip), plus [Wood092_1K-JPG.zip](https://ambientcg.com/get?file=Wood092_1K-JPG.zip).

### 材质近景验收记录

近景对照保留 Wood051 用于室内家具与室外涂饰座椅。Wood055（[官方页面](https://ambientcg.com/view?id=Wood055)，候选压缩包保存在 `assets/l11-props/Wood055_1K-JPG.zip`）虽然同为 Lennart Demes / ambientCG、CC0 1.0 Universal，但深色强刮痕不符合托盘和货箱所需的浅色原木效果，因此未接入运行时。最终选择 Wood092 用于施工托盘、电缆盘和木箱。

### 游戏内重复尺寸（项目配置）

The following table mirrors `src/game/renderer/l11Materials.ts:L11_SURFACE_MAPS`. These are the repeat dimensions used by the game for consistent world-space UVs across geometry and chunk seams. They are project configuration values; they are not all official measured dimensions of the source assets. Color, OpenGL normal, and roughness maps in each row share the same repeat. Interior materials keep their configured repeat and do not receive the exterior rain-wetness adjustment.

| Material kind | Runtime prefix | In-game repeat (m) | Surface use |
|---|---|---:|---|
| concrete | `l11_concrete` | 2 × 2 | building concrete, sidewalks |
| asphalt | `l11_asphalt` | 4 × 4 | roads and service lanes |
| brick | `l11_brick` | 3 × 1.5 | brick façades |
| plaster | `l11_plaster` | 2 × 2 | plaster façades and interiors |
| tile | `l11_tiles` | 3.6 × 3.6 | general tile surfaces |
| metal | `l11_metal` | 1.6 × 1.6 | metal trim and fixtures |
| wood | `l11_wood` | 3 × 3 | wood floors and interior woodwork |
| propwood | `l11_propwood` | 0.8 × 0.8 | prop furniture and timber details |
| rawwood | `l11_rawwood` | 0.8 × 0.8 | construction pallets, cable reels and wooden crates; UV axes follow board grain |
| fabric | `l11_fabric` | 0.4 × 0.4 | upholstery, bedding and soft furnishings |
| grass | `l11_grass` | 1.4 × 1.4 | parks and planted areas |
| paving | `l11_paving` | 2.4 × 2.4 | pedestrian paving; project placement scale |
| limestone | `l11_limestone` | 2 × 2 | limestone paving and public interiors |
| ceramic | `l11_ceramic` | 1 × 1 | ceramic tile details |
| tactile | `l11_tactile` | 0.8 × 0.8 | tactile paving strips |

## Superseded project-original foliage card

The former `l11_leafcard` path reused the project-original transparent leaf alpha card at
`public/textures/l10_leafcard.png`. It has been superseded by the CC0
`tree_small_02` foliage asset below and is no longer an L11 tree-crown runtime
asset. Its historical source record remains in `public/textures/L10-ASSET-SOURCES.md`.

## L11 foliage reference asset: tree_small_02

- Official asset: https://polyhaven.com/a/tree_small_02
- Authors: Rico Cilliers
- License: CC0 1.0 Universal (https://polyhaven.com/license)
- Metadata: `app/assets/l11-foliage/info.json`, `files.json`
- Original downloads: `app/assets/l11-foliage/{1k,2k}/`
- Runtime outputs: `app/public/textures/l11-foliage/{1k,2k}/leaves.png`, `normal.jpg`, `roughness.jpg`
- Processing: diffuse RGB combined with the alpha source's grayscale channel into RGBA PNG; normal and roughness bytes are retained unchanged. No generation, repainting, noise, or other image processing.
- The normal maps are OpenGL-oriented. Runtime foliage geometry uses UV islands for individual leaves from the atlas rather than stretching the full atlas over a card.
- Reproducible fetch and verification: `app/scripts/fetch-l11-foliage.mjs`; all source URLs, expected/actual MD5 values, byte counts, dimensions, and local paths are recorded in `app/assets/l11-foliage/manifest.json`.

## L11 inspected reference signs

These complete sign faces reproduce only the wording that is legible in the supplied
`reference/L11/11iconic.jpg` crops: `PEGASUS`, `Apartment Residences`, `866 997 9310`,
`Hope`, and `Famima!!`. The exact typeface and physical measurements are not asserted;
the world dimensions are registration values for the scene. These are AI-generated
project assets and carry no CC0 claim.

- Source manifest: `app/assets/l11-reference-signs-v2/manifest.json`
- Source images and prompts: `app/assets/l11-reference-signs-v2/{pegasus-source.png,pegasus.prompt.txt,hope-source.png,hope.prompt.txt,famima-source.png,famima.prompt.txt,famima-round-source.png,famima-round.prompt.txt}`
- Reference: `app/reference/L11/11iconic.jpg`; crops and visible text were inspected before registration.
- Processing command: `node scripts/prepare-l11-inspected-signs.mjs`
- Processing: crop the generated margins, resize high/low tiers to the declared world aspect, retain circular alpha, and produce uniform OpenGL normal/roughness maps; no noise texture or invented poster copy.
- Runtime files: `public/textures/l11-inspected-{pegasus,hope,famima,famima-round}{,_low,_normal,_roughness}.png`

## L11 reference sky: Kloofendal 48d Partly Cloudy (Pure Sky)

- Official asset: https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- Authors: Greg Zaal (Original), Jarod Guest (Sky edits)
- License: CC0 1.0 Universal (https://polyhaven.com/license)
- Metadata: `app/assets/l11-reference-sky/info.json`, `files.json`
- Original HDR downloads: `app/public/textures/l11-sky/sky-2k.hdr` and `sky-4k.hdr`
- Runtime selection: `app/src/game/renderer/l11Sky.ts` loads 2K for low quality and 4K for high quality.
- Runtime handling: the brightest HDR pixel is used to rotate the panorama so the sky, reflection, and directional sun agree; HDR RGB values are clamped to a maximum of 4 for the IBL source while the directional light supplies direct sunlight.
- The HDR files are copied without redraw or image processing. The reproducible downloader and exact source URLs/MD5 values are recorded in `app/scripts/fetch-l11-reference-sky.mjs` and `app/assets/l11-reference-sky/manifest.json`.

## L11 tree bark: tree_small_02 branch maps

- Official asset: https://polyhaven.com/a/tree_small_02
- Author: Rico Cilliers
- License: CC0 1.0 Universal (https://polyhaven.com/license)
- Source metadata: `app/assets/l11-foliage/files.json` (the checked Poly Haven file manifest)
- Original downloads: `app/assets/l11-bark/{1k,2k}/tree_small_02_branch_{diff,nor_gl,rough}_{1k,2k}.jpg`
- Runtime files: `app/public/textures/l11-bark/{1k,2k}/{color,normal,roughness}.jpg`
- The separate `branch_rough` maps supply roughness; the normal files are OpenGL-oriented (`nor_gl`). The initial import incorrectly selected the packed ARM file; the final script reads the exact three channel keys and the runtime roughness files were replaced with the dedicated channel.
- Processing: original JPEG bytes are copied verbatim under the runtime semantic names. No generation, repainting, noise, channel baking, or image processing is performed.
- Reproducible fetch and verification: `app/scripts/fetch-l11-bark.mjs`; exact source URLs, MD5 values, byte counts, dimensions, and local paths are recorded in `app/assets/l11-bark/manifest.json`.
- The bark originals remain unchanged. Runtime color handling applies desaturation and a brightness lift to approach the reference's pale gray bark; the intended world repetition scale is 0.8×1.6 m and the normal scale is 0.2.
- Leaves reuse the complete CC0 atlas leaf UV island. Crown normals are adjusted for stable two-sided foliage shadows. No noise textures are used.

## L11 出口建筑

`unfinished-frame`（未完工混凝土楼）直接复用 L1 裸混凝土使用的 `Concrete034` 三张图：`app/public/textures/l11_concrete.jpg`、`l11_concrete_normal.jpg`、`l11_concrete_roughness.jpg`。来源为 [Concrete034](https://ambientcg.com/view?id=Concrete034)，Lennart Demes / ambientCG，CC0 1.0 Universal，沿用本文件上方既有官方来源记录。运行时世界尺度重复为颜色 0.32 次/米、法线 0.24、粗糙度 0.86；无噪点纹理。

出口建筑的新木门复用既有 `Wood092` 的 `app/public/textures/l11_rawwood.jpg`、`l11_rawwood_normal.jpg`、`l11_rawwood_roughness.jpg`，沿用 0.8m 尺度；砖楼复用既有 `Bricks097` 的 `app/public/textures/l11_brick.jpg`、`l11_brick_normal.jpg`、`l11_brick_roughness.jpg`。Wood092 与 Bricks097 的作者、许可证和官方链接见上方既有记录。出口建筑几何为项目自产参数化模型，不新增外部资产、不改动 L1 资源。

## 前厅 M3 街区复用（2026-10-23）

`src/game/renderer/foyerStreet.ts`（前厅 level 900 的楼栋门厅 / 小区 / 第六大街 / 旧仓路后巷）通过 `l11Material()` 直接复用本文件上方已登记的 ambientCG CC0 贴图：`l11_asphalt`（Asphalt012，路面）、`l11_paving`（PavingStones035，人行道/小区地面）、`l11_concrete`（Concrete034，路缘/勒脚/楼梯）、`l11_brick`（Bricks097，后巷砖墙/过街楼）、`l11_plaster`（门厅/便利店内墙、小区围墙）、`l11_grass`（花坛）、`l11_metal`（灯杆/扶手/围栏）、`l11_ceramic`（门厅/便利店地砖）、`l11_propwood`（长椅）、`l11-bark`（行道树树干）及 `glass`/`rubber` 程序材质。作者、许可证、官方链接与本地路径均同上方原始记录；图像文件未复制、未修改，仅以同一材质工厂（米制 UV、颜色微调 tint）引用。街区招牌、立面窗格、寻人启事、涂鸦等为运行时 Canvas 程序化贴图（`foyerStreetTextures.ts`），无外部来源。
