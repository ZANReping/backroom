# 前厅（Foyer, level 900）贴图素材登记

全部 13 套 PBR 贴图来自 [Poly Haven](https://polyhaven.com) 官方资源页，许可证为 **CC0 1.0 Universal**（公共领域，允许商用与再分发，无需署名；见 [Poly Haven License](https://polyhaven.com/license)）。下载方式：Poly Haven 官方 API `https://api.polyhaven.com/files/<asset_id>` 中 `Diffuse` / `nor_gl` / `Rough` / `AO` 的 **1k JPG** 文件（`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_<map>_1k.jpg`）。下载日期 2026-10-23。

| 本地文件前缀（`app/public/textures/foyer/`） | Poly Haven 资源 | 作者（Poly Haven 记录） | 官方实物尺寸 | 游戏内平铺尺寸 | 用途 |
|---|---|---|---|---|---|
| `wood_floor_*` | [laminate_floor_02](https://polyhaven.com/a/laminate_floor_02) | Charlotte Baglioni（摄影）、Dario Barresi（处理） | 1.7 m | 1.7 m | 卧室/客厅/玄关木地板（材质色调区分橡木/白蜡木） |
| `stone_floor_*` | [marble_01](https://polyhaven.com/a/marble_01) | Rob Tuytel | 1.5 m | 1.5 m | 厨房地砖 |
| `granite_tile_*` | [granite_tile_03](https://polyhaven.com/a/granite_tile_03) | Charlotte Baglioni | 1.8 m | 0.45 m（设计尺度：卫生间小规格防滑砖） | 卫生间地面 |
| `wall_tile_*` | [long_white_tiles](https://polyhaven.com/a/long_white_tiles) | Sergej Majboroda（摄影）、Jenelle van Heerden（处理） | 1.27 m | 1.27 m | 卫生间墙砖（带缝与微光泽） |
| `terrazzo_*` | [terrazzo_tiles](https://polyhaven.com/a/terrazzo_tiles) | Amal Kumar | 2.0 m | 2.0 m | 楼道水磨石地面 |
| `plaster_*` | [plastered_wall_04](https://polyhaven.com/a/plastered_wall_04) | Rob Tuytel | 3.2 m | 3.2 m | 乳胶漆墙面、吊顶（颜色图灰度化，法线强度 0.2–0.6） |
| `wool_*` | [poly_wool_herringbone](https://polyhaven.com/a/poly_wool_herringbone) | colormass（摄影）、Rico Cilliers（处理） | 0.27 m | 0.27 m | 沙发、外套、毛巾、门垫 |
| `linen_*` | [rough_linen](https://polyhaven.com/a/rough_linen) | colormass、Rico Cilliers | 0.27 m | 0.27 m | 被套、窗帘、衣物 |
| `jersey_*` | [cotton_jersey](https://polyhaven.com/a/cotton_jersey) | colormass、Rico Cilliers | 0.26 m | 0.26 m | 床单、枕头、衣物 |
| `velvet_*` | [velour_velvet](https://polyhaven.com/a/velour_velvet) | colormass、Rico Cilliers | 0.28 m | 0.28 m | 芥末黄单人沙发、抱枕 |
| `oak_*` | [oak_veneer_01](https://polyhaven.com/a/oak_veneer_01) | Jenelle van Heerden | 1.83 m | 1.83 m | 书桌面、餐桌椅、室内门、鞋柜台面 |
| `walnut_*` | [walnut_veneer](https://polyhaven.com/a/walnut_veneer) | Jenelle van Heerden | 1.8 m | 1.8 m | 床架、床头柜、茶几、电视柜 |
| `maple_*` | [white_maple_veneer](https://polyhaven.com/a/white_maple_veneer) | Jenelle van Heerden | 1.0 m | 1.0 m | 手办架、衣柜门 |

## 每套的本地文件与修改

每套三张文件（体积合计约 4 MB）：

- `<name>_col.jpg` — 颜色（albedo），**sRGB**。由 `Diffuse` 1k 缩放（木/石/砖类 1024²，织物 512²），JPEG q86。
  - `granite_tile`：原扫描偏深（颜色均值≈0.37），为卫生间浅灰防滑砖**去饱和 60% 并提亮**（`x' = 1 − (1 − x) × 0.42`，保留颗粒对比；处理后均值≈0.73）。2026-10-23 修改，脚本同步。
  - `terrazzo`：原扫描为暖棕底色（均值 RGB≈137/109/87），楼道需冷灰旧水磨石：**转灰度、石子对比 ×1.6（均值 0.56），偏冷着色（R×0.955/G×0.985/B×1.03），仅混入 6% 原色相**作石子杂色（处理后均值≈137/139/146）。2026-10-23 第二轮修改，脚本同步。
  - `plaster` 与四种织物（`wool/linen/jersey/velvet`）额外**转为灰度并按亮度归一化**（均值≈0.78，与中灰混合降低对比度），运行时以材质 `color` 着色——同一扫描复用为多种漆色/布色。
- `<name>_nrm.jpg` — **OpenGL 法线**（`nor_gl`），线性，缩放后 JPEG q90，未改方向。
- `<name>_orm.jpg` — 打包：**R=AO（`AO`）、G=粗糙度（`Rough`）、B=0**，线性，JPEG q88。three.js 中同一张图同时作为 `aoMap`（读 R）与 `roughnessMap`（读 G）。`plaster` 与 `oak/walnut/maple` 未下载 AO（R 通道恒为 255）。

处理脚本：`app/scripts/prepare-foyer-textures.py`（`python3 prepare-foyer-textures.py <raw_dir> app/public/textures/foyer`；raw 为上述 API 下载的 1k JPG 原图，未入库）。

## 运行时用法
- 材质：`renderer/foyerPbr.ts`（`MeshStandardMaterial`，与经典/真实光影开关无关）；贴图经 `levelTexture()` 异步加载，加载前为 1×1 中性占位。
- UV：几何按世界尺度生成（`worldUV(g, physical)`），一张贴图对应上表「游戏内平铺尺寸」，无拉伸；家具盒体/软垫亦按该尺度展开。
- 色彩空间：颜色图 `SRGBColorSpace`，法线/ORM `NoColorSpace`；mipmap + 各向异性按现有 `configureSurfaceTexture` 设置。

## 非素材的程序化部分（无许可依赖）
- 墙/地/顶的**光照贴图**与家具的**逐顶点烘焙光照**（含 AO、软阴影、窗外城市冷光、屏幕光、轻微墙脚踢蹭/积灰/地面磨损）：`renderer/foyerBake.ts` 在关卡构建时计算，不产生文件。
- 室内环境反射贴图：`renderer/foyerPbr.ts` `foyerEnvMap()` 运行时 Canvas 绘制。
- 海报、书脊、屏幕、窗外夜景、楼道墙裙、地毯等仍为 M1 的运行时 Canvas 贴图（`renderer/foyerTextures.ts`）。

## 打磨轮新增（2026-10-23）：随身物品像素贴图、物品栏图标、精细模型

全部为**项目自制**，无外部下载素材、无第三方许可依赖（随项目同许可发布，可视为 CC0）。品牌、文字均为虚构中性（无真实商标）。

| 本地文件 | 尺寸 | 生成方式 | 用途 |
|---|---|---|---|
| `app/public/textures/foyer/items/phone_back.png` | 32×64 | `app/scripts/gen-foyer-item-textures.py`（PIL 逐像素绘制） | 手机背面（双摄模组、闪光灯、中性圆环标） |
| `app/public/textures/foyer/items/phone_lock.png` | 32×64 | 同上 | 手机锁屏（夜空渐变、23:40 像素数字、两条通知） |
| `app/public/textures/foyer/items/water_label.png` | 64×16 | 同上 | 瓶装水环绕标签 |
| `app/public/textures/foyer/items/snack_wrap.png` | 64×16 | 同上 | 能量棒包装（含封口锯齿） |
| `app/public/textures/foyer/items/pack_fabric.png` | 32×32 | 同上 | 双肩包布料（可平铺） |
| `app/public/textures/foyer/items/pack_patch.png` | 16×16 | 同上 | 背包胸前布标 |
| `app/public/textures/foyer/items/vhs_label.png` | 32×16 | 同上 | 磁带标签（预留，供后续磁带物品复用） |
| `app/public/textures/icons/pixel/item_phone.png` | 32 px 原稿放大 | `app/scripts/gen-item-icons.py`（新增 `draw_phone` 等 4 个函数，沿用既有 32 px 原稿 + 深色描边 `#2a241c` + 有限调色板风格） | 物品栏图标：手机 |
| `app/public/textures/icons/pixel/item_bottledwater.png` | 同上 | 同上 | 物品栏图标：瓶装水 |
| `app/public/textures/icons/pixel/item_snackbar.png` | 同上 | 同上 | 物品栏图标：能量棒 |
| `app/public/textures/icons/pixel/item_foyerpack.png` | 同上 | 同上 | 物品栏图标：你的背包 |

- 重新生成：`cd app && python3 scripts/gen-foyer-item-textures.py`、`python3 scripts/gen-item-icons.py`。
- 运行时：`renderer/foyerItemModels.ts` 以 `NearestFilter` 放大、`NearestMipmapLinearFilter` 缩小采样（本项目接入时补充 mipmap，保留近景颗粒并减少远景闪烁），`SRGBColorSpace`；模型几何（圆角盒、车削瓶身、按键/摄像头/瓶盖螺纹/封口锯齿/拉链头/肩带扣）全部在代码中程序化生成，每件约 0.3k–1.5k 三角形，不含外部模型文件。
- 无法线/粗糙度贴图：像素风物品刻意只用颜色贴图 + 材质常量粗糙度/金属度（与像素图标一致，避免 PBR 细节和 32 px 颗粒冲突）。
