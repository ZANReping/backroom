# 场景贴图素材来源

除标注外，全部来自 [ambientCG](https://ambientcg.com/)（许可：Creative Commons CC0，公有领域，可商用无需署名）。
原始素材为 1K JPG，本地处理：居中裁方 → 512×512 → 地形贴图去色至近中性灰（配合渲染器「顶点色 × 贴图」叠乘）→ JPEG q86。
加载失败时渲染器自动回退程序化噪点纹理（`levelTexture`，src/game/renderer/shared.ts）。

## v34：Level 1 贴图换新（对照 wikidot Level 1「停车场灰混凝土」设定）

| 文件 | 素材 | 用途 |
|---|---|---|
| l1_wall.jpg | Concrete034 | L1 墙面 |
| l1_wall2.jpg | Concrete046 | L1 墙面（第二套纹理分区） |
| l1_floor.jpg | Concrete048 | L1 地面 |
| l1_ceil.jpg | Concrete030 | L1 天花板 |

## v34：容器贴图

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| crate_wood.jpg | Planks037A | 补给箱（板条木箱） | 提亮至均值 0.38 |
| barrel_wood.jpg | Planks039 | 木桶 | 旋转 90° 竖纹（桶板方向） |
| locker_metal.jpg | Metal032 | 储物柜（柜体 + 柜门） | 降饱和去蓝 |

## v35：Alpha 基地（据点）贴图（参照 M.E.G. 基地明亮办公风）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l101_wall.jpg | Plaster002 | 据点墙面（奶油粉刷） | 去色 + 亮度归一 0.78 |
| l101_wall2.jpg | Plaster003 | 据点墙面（第二套纹理分区） | 去色 + 亮度归一 0.76 |
| l101_floor.jpg | Tiles002 | 据点地面（白色方砖） | 去色 + 亮度归一 0.72 |
| l101_ceil.jpg | OfficeCeiling002 | 据点亮白吊顶（含灯盘） | 去色 + 亮度归一 0.80 |

## v35：商人之家（B.N.T.G. 据点）贴图（现代商场整洁风）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l102_wall.jpg | Plaster004 | 商人之家墙面（整洁粉刷） | 去色 + 亮度归一 0.80 |
| l102_floor.jpg | Tiles107 | 商人之家地面（白色瓷砖） | 去色 + 亮度归一 0.78 |
| l102_ceil.jpg | OfficeCeiling004 | 商人之家吊顶（整洁办公室） | 去色 + 亮度归一 0.82 |
| corrugated_steel.jpg | CorrugatedSteel009 | 卷帘门面板（波纹钢，交易保险库） | 去色 + 亮度归一 0.66 |

## v37：希波克拉底 - 1（阿丽亚娜集团据点）贴图（洁白医药研究所风）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l103_wall.jpg | Plaster006 | 研究所墙面（洁白粉刷） | 去色 + 亮度归一 0.82 |
| l103_floor.jpg | Tiles107 | 研究所地面（白色方砖） | 旋转 90° + 去色 + 亮度归一 0.80 |
| l103_ceil.jpg | OfficeCeiling003 | 研究所吊顶（亮白办公） | 去色 + 亮度归一 0.84 |

处理脚本：`scripts/gen-l103-textures.py` 可复现。

## v38：Tom 的餐馆（独立餐馆据点）贴图（暖色家庭餐馆风）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l104_wall.jpg | Plaster005 | 餐馆墙面（暖色粉刷） | 去色 + 亮度归一 0.80 |
| l104_floor.jpg | WoodFloor043 | 餐馆地面（暖色木地板） | 去色 + 亮度归一 0.62 |
| l104_ceil.jpg | OfficeCeiling001 | 餐馆吊顶 | 去色 + 亮度归一 0.82 |

处理脚本：`scripts/gen-l104-textures.py` 可复现（缓存目录 `scripts/.cache-l104/`）。

## v46：办公区EL3A（B.N.T.G. 物流中转站）贴图（灰绿工业墙 + 仓库混凝土 + 吊顶）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l105_wall.jpg | CorrugatedSteel009 | 工业墙（v49 定制款：波纹钢 + BNTG 深绿水平饰条 + 墙根黄黑安全标识带，灰绿乘色） | 去色 + 亮度归一 0.72 + PIL 叠加饰条/标识带 |
| l105_floor.jpg | Concrete046 | 仓库混凝土地面 | 去色 + 亮度归一 0.66 |
| l105_ceil.jpg | OfficeCeiling001 | 吊顶（兼作夹楼板底面统一纹理） | 去色 + 亮度归一 0.80 |

处理脚本：`scripts/gen-l105-textures.py` 可复现（缓存目录 `scripts/.cache-l105/`）。
`el3a_poster.png` / `el3a_safeline.png`：PIL 程序绘制（`scripts/gen-el3a-poster.py` 可复现）——
BNTG 绿底定居点海报（天平徽记 + 仓库/办公楼图案 + 「办公区EL3A 存储与分配」，L2 整洁的廊道
海报形地标用）/ 黄色安全线地面贴花（photo flat + data.tex，仓库主通道地面标线用）。

## v48：Level 274「杰瑞的房间」（杰瑞的信众圣地）贴图（蓝色教堂：蓝白冷调石墙/深蓝灰石板/蓝色吊顶）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l274_wall.jpg | Bricks051 | 教堂石墙（蓝白冷调） | 去色 + 蓝乘色 #aab2d8 + 亮度归一 0.74 |
| l274_floor.jpg | PavingStones128 | 教堂石板地面（深蓝灰） | 去色 + 蓝乘色 #8a92c8 + 亮度归一 0.70 |
| l274_ceil.jpg | OfficeCeiling003 | 蓝色吊顶 | 去色 + 蓝乘色 #8a92c8 + 亮度归一 0.80 |

处理脚本：`scripts/gen-l274-textures.py` 可复现（缓存目录 `scripts/.cache-l274/`）——与 tint 17
蓝白圣辉叠乘协调（贴图带蓝，palette 墙面调亮/地面调深半档，见 levels/l274.ts）。

## v35：据点装饰与像素图标（本项目自制，无外部素材）

- `meg_logo.png` / `noticeboard.png` / `poster_slogan.png` / `photo.png`：PIL 程序绘制
  （M.E.G. 鹰徽 / 软木公告栏 / 标语海报「团结是我们的基石」/ 层景相片），墙面装饰结构用。
- `bntg_logo.png` / `bntg_poster.png`：PIL 程序绘制 B.N.T.G. 标志（黑色地球 + 环形十飞鸽 +
  「不结盟贸易集团」字样；海报为深绿反白版），商人之家墙面装饰用。
- `ariane_logo.png` / `ariane_poster.png`：PIL 程序绘制阿丽亚娜集团标志（16 个 #8676e2 紫色
  圆环组成的圆环；海报为深紫底 + 「阿丽亚娜集团」「希波克拉底 - 1」字样，
  `scripts/gen-ariane-posters.py` 可复现），希波克拉底 - 1 墙面装饰用。
- `mall_arrow.png`：PIL 程序绘制绿色地面导引箭头（透明背景），商人之家地面贴花
  （photo flat + data.tex/data.deg）用。
- `poster_sale.png` / `poster_almond.png` / `poster_food.png` / `poster_tech.png` / `poster_fashion.png`：
  PIL 程序绘制商业海报（全场特惠/杏仁水/美食广场/数码科技/时尚新装，`scripts/gen-posters.py`
  可复现），商人之家墙面广告用。
- `tom_menu.png` / `tom_poster.png`：PIL 程序绘制（`scripts/gen-tom-posters.py` 可复现）——
  深绿黑板底粉笔字「今日菜单」菜单黑板 / 暖红招牌「Tom 的餐馆」（餐盘+刀叉图案），
  Tom 的餐馆墙面装饰（noticeboard/megposter data.tex）与悬挂招牌（shopsign data.tex）用。
- `brc_logo.png`：PIL 程序绘制（`scripts/gen-brc-logo.py` 可复现）——后室装修公司标志：
  淡紫房屋形盾 + 深描边 + 黄色绶带（B.R.C. 字样）+ 红门 + 山墙交叉锯/锤，图鉴「团体」页用。
- `icons/pixel/item_eaglecoin.png`：32×32 像素手绘天鹰币（128×128 最近邻放大），随项目同许可发布。
- `icons/pixel/item_nightvision.png`：`scripts/gen-item-icons.py` 程序绘制的 32×32 夜视眼镜原稿（双目增像筒、头带与青绿镜片），128×128 最近邻放大；无外部素材。
- `photo_mountain.png` / `photo_lake.png` / `photo_forest.png` / `photo_house.png` / `photo_street.png` /
  `photo_still.png`（v54）：PIL 程序绘制
  （`scripts/gen-photos.py` 可复现）——photo 结构变种贴图池：山景/湖泊/森林风景、
  房屋/街道、咖啡杯静物（256×192 含白边，统一做旧：降饱和 + 暖色偏移 + 高斯羽化暗角）。
  无显式 data.tex 的 photo 按瓦片坐标哈希从本池选一张。

## v53：Level 0 地板/天花板「仅贴图」烘焙（渲染层不再叠乘底色）

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l0_floor.jpg | 既有 L0 地毯贴图（`_src_l0_floor_prebake.jpg` 为改造前备份） | L0 地面 | 线性空间 × pal.floor #b8a548 烘焙 |
| l0_ceil.jpg | 既有 L0 天花板贴图（`_src_l0_ceil_prebake.jpg` 为改造前备份） | L0 天花板 | 线性空间 × (pal.wallTop #8a7a33 × 0.55) 烘焙 |

处理脚本：`scripts/gen-l0-bake.py` 可复现（幂等，从 `_src_` 备份重新生成）。
渲染侧：顶点色只保留调制因子（明暗噪点/湿地 ×0.62/tint 折算），且 v50 的自发光提亮已删除，
除该自发光外输出与改造前逐点一致。

## v53：Level 6~11 地形贴图 + 房顶/楼体贴图 + EL3A 二层贴图

全部 ambientCG CC0 直下载（curl 需 `--tlsv1.2 -k`，缓存 `scripts/.cache-l6-l11/`），
处理：居中裁方 512×512 → 去色至近中性灰 → 亮度归一 → JPEG q86。
地形贴图由渲染器按 `l{层级id}_wall|floor|ceil` 自动加载，加载失败回退程序噪点；
房顶/楼体贴图 tint = 原纯色 ÷ 0.72（贴图均值）折算，保持原有明度观感。

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l6_wall.jpg | Concrete033 | L6 熄灯：深色混凝土墙 | 去色 + 亮度归一 0.74 |
| l6_floor.jpg | Concrete026 | L6 地面（旧混凝土） | 去色 + 亮度归一 0.68 |
| l6_ceil.jpg | Concrete032 | L6 天花板 | 去色 + 亮度归一 0.78 |
| l7_wall.jpg | Concrete035 | L7 深海恐惧：水渍感混凝土墙 | 去色 + 亮度归一 0.72 |
| l7_floor.jpg | Concrete038 | L7 地面（被淹混凝土） | 去色 + 亮度归一 0.66 |
| l7_ceil.jpg | Concrete031 | L7 天花板 | 去色 + 亮度归一 0.78 |
| l8_wall.jpg | Rock035 | L8 洞穴：岩壁 | 去色 + 亮度归一 0.74 |
| l8_floor.jpg | Rock022 | L8 洞底 | 去色 + 亮度归一 0.68 |
| l8_ceil.jpg | Rock045 | L8 洞顶 | 去色 + 亮度归一 0.76 |
| l9_wall.jpg | WoodSiding010 | L9 郊区：房屋木挂板外墙 | 去色 + 亮度归一 0.74 |
| l9_floor.jpg | Asphalt022 | L9 街道沥青地面 | 去色 + 亮度归一 0.66 |
| l9_ceil.jpg | Plaster007 | L9 室内粉刷天花 | 去色 + 亮度归一 0.80 |
| l10_wall.jpg | Planks003 | L10 丰收：谷仓木板墙 | 去色 + 亮度归一 0.74 |
| l10_floor.jpg | Ground054 | L10 泥土地面 | 去色 + 亮度归一 0.64 |
| l10_ceil.jpg | Planks005 | L10 谷仓内顶（木板） | 去色 + 亮度归一 0.78 |
| l11_wall.jpg | Bricks042 | L11 不夜城：临街砖墙 | 去色 + 亮度归一 0.74 |
| l11_floor.jpg | Asphalt019 | L11 街道沥青地面 | 去色 + 亮度归一 0.66 |
| l11_ceil.jpg | OfficeCeiling006 | L11 室内办公吊顶 | 去色 + 亮度归一 0.80 |
| l9_roof.jpg | RoofingTiles002 | L9 房屋双坡瓦顶 + 檐口（structures house） | 去色 + 亮度归一 0.72；tint #403d43/#514b43 |
| l10_roof.jpg | CorrugatedSteel005 | L10 谷仓金属屋顶 + 檐口（structures barn） | 去色 + 亮度归一 0.72；tint #a95140/#c25e47/#833d31 |
| l11_tower.jpg | Concrete039 | L11 楼体混凝土立面（towerblock，程序 towerFacade 留作回退） | 去色 + 亮度归一 0.72；tint #93979e |
| l11_roof.jpg | Concrete045 | L11 屋顶板/女儿墙（平板混凝土） | 去色 + 亮度归一 0.72；tint #777d84 |
| l105_upwall.jpg | Plaster001 | EL3A 二层办公区隔墙 | 去色 + 亮度归一 0.78 |
| l105_upceil.jpg | OfficeCeiling005 | EL3A 二层办公吊顶 | 去色 + 亮度归一 0.82 |
| l105_upfloor.jpg | Carpet002 | EL3A 二层办公地毯（夹楼板上表面；底面仍 l105_ceil） | 去色 + 亮度归一 0.72 |

处理脚本：`scripts/gen-l6-l11-textures.py` 可复现（缓存目录 `scripts/.cache-l6-l11/`）。

## v54：Gamma 基地（M.E.G. 三层据点，id 106）贴图（浅色涂装粉刷 + 办公地砖 + 涂装粉刷吊顶）

全新下载（不复用既有素材；本机 TLS 需 `curl --tlsv1.2 -k -L`，缓存 `scripts/.cache-l106/`）：

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l106_wall.jpg | PaintedPlaster017 | Gamma 基地墙面（浅色涂装粉刷，MEG 公共/行政风） | 去色 + 亮度归一 0.78 |
| l106_floor.jpg | Tiles006 | 办公地砖地面（含 2F/3F 楼板顶面——geometry 多层楼板顶面走 l{id}_floor） | 去色 + 亮度归一 0.74 |
| l106_ceil.jpg | PaintedPlaster015 | 涂装粉刷吊顶（OfficeCeiling 001-006 均被占；兼作上层楼板底面） | 去色 + 亮度归一 0.84 |

处理脚本：`scripts/gen-l106-textures.py` 可复现。palette（`levels/lgamma.ts`）按贴图效果微调
（地砖带深色圆点胶粒，地板/墙面较 Alpha 略提亮半档；贴图去色归一后 palette 负责色调，同 l274/l105 先例）。

## v54：存储设施（B.N.T.G. 据点，id 107）贴图（波纹钢工业墙 + 仓库混凝土 + 涂装粉刷吊顶）

全新下载（不复用既有素材；缓存 `scripts/.cache-l107/`）：

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l107_wall.jpg | CorrugatedSteel003 | 存储设施墙面（波纹钢工业墙，与 EL3A 的 009 不同款） | 去色 + 亮度归一 0.72 |
| l107_floor.jpg | Concrete028 | 仓库混凝土地面 | 去色 + 亮度归一 0.66 |
| l107_ceil.jpg | PaintedPlaster016 | 涂装粉刷吊顶 | 去色 + 亮度归一 0.80 |

处理脚本：`scripts/gen-l107-textures.py` 可复现。

## v54：蓝色救赎（杰瑞的信众圣所据点，id 108）贴图（蓝灰石墙/石板/蓝色吊顶）

全新下载（缓存 `scripts/.cache-l108/`；蓝乘色处理同 l274 先例——去色后蓝移、归一补偿压暗）：

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l108_wall.jpg | Bricks060 | 圣所石墙（蓝灰） | 去色 + 蓝乘色 #a2aad6 + 亮度归一 0.74 |
| l108_floor.jpg | PavingStones142 | 圣所石板地面（蓝灰） | 去色 + 蓝乘色 #8a92c8 + 亮度归一 0.70 |
| l108_ceil.jpg | PaintedPlaster013 | 蓝色吊顶 | 去色 + 蓝乘色 #8a92c8 + 亮度归一 0.80 |

处理脚本：`scripts/gen-l108-textures.py` 可复现。

## v54：M.E.G. Omega 基地（id 109，Level 4 子层级据点）贴图（浅色涂装粉刷墙/办公地毯/粉刷吊顶）

全新下载（缓存 `scripts/.cache-l109/`；占用避让——Carpet002、OfficeCeiling 001-006、PaintedPlaster013/015/016/017 均被占）：

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l109_wall.jpg | PaintedPlaster004 | 平整净白粉刷墙（现代办公室风；003/008 弃用） | 去色 + 亮度归一 0.86 |
| l109_floor.jpg | Carpet014 | 整洁浅灰方块地毯（007/013 弃用） | 去色 + 亮度归一 0.72 |
| l109_ceil.jpg | PaintedPlaster010 | 粉刷吊顶 | 去色 + 亮度归一 0.84 |

处理脚本：`scripts/gen-l109-textures.py` 可复现。海报 `omega_poster.png` 为 PIL 程序绘制
（`scripts/gen-l109-poster.py` 可复现；鹰徽 + 档案柜图案，风格同 gen-l3-posters.py）。

## v41：团体标志（图鉴「团体」页介绍框水印，`scripts/gen-faction-logos.py` 可复现）

- `faction_wanderer.png`：后室维基官方图标（`ar-backrooms-wiki.wdfiles.com/local--files/component:theme/logo.png`，
  白线稿透明底）重着色 #b8b8b8。
- `faction_meg.png`：M.E.G. 官方鹰徽（`backrooms-wiki.wdfiles.com/local--files/the-beginning-of-the-m-e-g/EagleSD.png`）
  重着色 #a5a45a。
- `faction_bntg.png`：B.N.T.G. 官方标志（`ye-zhi-d.wdfiles.com/local--files/the-b-n-t-g/logo.png`）
  去底 + 重着色 #566c5a。
- `faction_ariane.png`：阿丽亚娜集团圆环标志（`zupimages.net/up/23/30/foux.png`）去白底 + 重着色 #8676e2。
- `faction_brc.png`：后室装修公司官方标志（[wikidot](https://backrooms-wiki-cn.wikidot.com/backrooms-remodeling-co)，
  CC BY-SA 3.0；`_src_brc.jpg` 为原图），洪水填充去白底、保留原色、裁剪至 512。
- `faction_jerry.png`（v45）：杰瑞的信众官方标志（`backrooms-wiki.wdfiles.com/local--files/followers-of-jerry/fuckinbird.png`，
  CC BY-SA 3.0；`_src_jerry.png` 为原图）——彩色原图（蓝鹉+金太阳），洪水填充去白底、保留原色、裁剪至 512。
- `jerry_poster.png`（v45）：PIL 程序绘制（`scripts/gen-jerry-poster.py` 可复现）——信众宣传海报：
  蓝底 + 圣辉 + 鹉主剪影 + 「鹉主杰瑞伟大」字样；L2 信众宣传间与 Level 274 墙面装饰（megposter data.tex）用。
- `angel_fresco.png`（v51）：PIL 程序绘制（`scripts/gen-angel-fresco.py` 可复现）——圣所宗教画作：
  512×640 竖幅旧画布 + 天使神祇剪影（展翼长袍立像 + 光环 + 圣光晕）+ 水渍流痕/边缘磨损风化；
  L3 圣所墙面与栅栏后墙面装饰（megposter data.tex + data.tall 竖幅，wikidot L3 设定画作大多位于栅栏之后）。
- `l3_art_angel.png` / `l3_art_skeleton.png` / `l3_art_sketch.png`（v53）：PIL 程序绘制
  （`scripts/gen-l3-artworks.py` 可复现）——L3 廊道砖墙大幅艺术品（bigpainting 结构，wikidot L3
  「艺术品」：砖墙上覆盖白色画布状材质，绘有来历不明的画作/素描）：吹号天使（面部涂抹）/
  带翅膀的骷髅（桌案烛台）/ 狂乱素描笔迹。
- `l3_glass_scales.png` / `l3_glass_trumpets.png` / `l3_glass_heart.png`（v53b）：PIL 程序绘制
  （`scripts/gen-l3-stainedglass.py` 可复现）——L3 圣所彩色玻璃花窗（stainedglass 结构，
  512×768 尖拱竖窗：铅条分格 + 彩玻碎块 + 天使剪影）：红翼持天平 / 三天使吹号 / 金翼持心。
- 上述 `_src_*` 为脚本输入原图（wikidot 内容 CC BY-SA 3.0）；处理规则：纯色标志重着色为主题色、
  有色标志（BRC / 杰瑞的信众）保留原色；水印以低透明度居中于介绍框背景，不溢出框。

## v51：Level 3「发电站」重制贴图（砖墙 + 积灰混凝土地板 + 积灰白天花板）

墙面为 ambientCG 直下载（本机 TLS 被截断，curl 需 `--tlsv1.2 -k`；缓存 `scripts/.cache-l3/`）；
地板/天花板为离线再加工（基于库内已有 CC0 派生素材二次处理，一次性生成已入库即定稿）：

| 文件 | 素材 | 用途 | 处理 |
|---|---|---|---|
| l3_wall.jpg | OpenAI 图像生成；暗砖红/陶土橙/赭黄烧结砖，暖灰棕灰浆；镜像周期化为 1K JPEG | L3 默认砖墙颜色图 | 世界空间 UV（0.45 重复/m，砖约 22cm 宽）；无缝、偏红黄 |
| `art-source/l3_red_yellow_brick_source.png` | 上述生成结果的原始 1254×1254 PNG | 可追溯源图，不打包进运行时 |
| l3_wall2.jpg | `scripts/gen-l3-brick-pbr.py` 从 l3_wall 派生 | 深色积灰砖（TEX2 变体区） | 饱和度 0.84 + 亮度 0.78，保持同一红黄砖色族与相位 |
| l3_wall_normal.jpg | `scripts/gen-l3-brick-pbr.py` 从颜色图亮度高度场派生 | L3 砖体/凹灰浆 OpenGL 法线 | 周期中心差分，严格对齐世界 UV |
| l3_wall_roughness.jpg | 同上 | L3 砖墙粗糙度 | 砖体约 0.68–0.88，灰浆接近 0.98；只产生柔和砖棱高光 |
| l3_floor.jpg | 既有混凝土贴图派生 | 布满灰尘的混凝土地板 | 去色 0.8 + 双层积灰斑块（浅灰白/暗灰）+ 细颗粒（一次性生成，已入库即定稿） |
| l3_ceil.jpg | l103_wall.jpg（Plaster006 洁白粉刷，CC0）派生 | 布满灰尘的白色天花板 | 去色 0.7 + 亮度 0.97 + 积灰斑块 + 细颗粒 |
| l3_marble.jpg | Marble012（灰白大理石，CC0） | 圣所地板（tint 20 瓦片单独走本贴图，墙壁维持砖砌） | 去色 + 均值归一 0.78 + 极轻积灰 |

处理脚本：`scripts/gen-l3-textures.py` 可复现。

下载地址形如 `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`。

## Level 5 无限化材质

| 文件 | 用途 |
|---|---|
| l5_carpet.jpg | OpenAI 图像生成；以用户提供的酒店走廊照片为配色/风格参考，生成深酒红底、古金卷草纹的顶视织毯；镜像周期化后缩放为 1K JPEG | L5 走廊、主厅与房间独立地毯的无缝金红颜色贴图 |
| `art-source/l5_carpet_gold_red_source.png` | 上述生成结果的原始 1254×1254 PNG（未做周期化） | 可追溯源图，不打包进运行时 |
| l5_carpet_blue.jpg | 旧版藏青色地毯（当前 L5 不再引用） | 保留用于旧存档/回退兼容 |
| l5_carpet_normal.jpg | [Poly Haven — Quatrefoil Jacquard Fabric](https://polyhaven.com/a/quatrefoil_jacquard_fabric)，CC0；1K OpenGL normal | 旧版锦缎织纹法线（当前 L5 不再引用） |
| l5_carpet_fiber_normal.jpg | [ambientCG — Carpet015](https://ambientcg.com/view?id=Carpet015)，CC0；1K OpenGL normal | 旧版实拍纤维法线；当前金红地毯为纯哑光，不再引用 |
| l5_carpet_roughness.jpg | 同 Carpet015，CC0；1K roughness | 旧版纤维粗糙度；当前金红地毯不再引用 |
| l5_tile.png | 泳池瓷砖（奶白偏青小方砖 + 灰青砖缝）——游泳池地面（tint 23） |

| l5_portrait1.png | 古典肖像·贵族（程序剪影，暗色古典配色 + 暗角）——主厅/走廊墙 bigpainting |
| l5_portrait2.png | 古典肖像·夫妇像（同上） |
| l5_portrait3.png | 古典肖像·骑马像（同上） |

泳池瓷砖仍由 `scripts/gen-l5-textures.py` 可复现；肖像画处理脚本为 `scripts/gen-l5-portraits.py`（512×640 竖幅，纯 PIL）。

| l5_notice.png | M.E.G. 哨所「家政服务」告示（程序绘制：鲜黄饰带/鹰徽/指路箭头）——infiniteL5 走廊 landmark |
| l5_homelysign.png | 家常酒店标志牌（程序绘制：青灰底/烫银边/酒店剪影）——infiniteL5 主厅 landmark |

地标贴图脚本：`scripts/gen-l5-notice.py` 可复现（512×640 竖幅，纯 PIL）。

### v55：L5 据点贴图沿用
据点 110/111/112（家政服务哨所/家常酒店/原住民）不制新贴图——经 `shared.ts` 的 `LEVEL_TEX_ALIAS` 直接沿用 L5 主层级 l5_wall/l5_floor/l5_ceil 与 TEX2 变体（l5_wall2/l5_floor2）。

## Level 6 地下破败廊道材质

以下文件均为 [Poly Haven](https://polyhaven.com/) CC0 1K JPG，颜色、OpenGL 法线与粗糙度贴图成套接入真实光影材质：

| 文件 | 来源 | 作者 | 用途 |
|---|---|---|---|
| `l6_dn_wall.jpg` / `l6_dn_wall_normal.jpg` / `l6_dn_wall_roughness.jpg` | [Worn Plaster Wall](https://polyhaven.com/a/worn_plaster_wall) | Dimitrios Savva | L6 地下墙壁与低顶；剥落、开裂、污损的旧灰泥，经灰绿色材质调制表现霉变 |
| `l6_dn_floor.jpg` / `l6_dn_floor_normal.jpg` / `l6_dn_floor_roughness.jpg` | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel | L6 地下积垢混凝土地面 |

许可：CC0，可自由使用、修改和再分发；下载自 Poly Haven 官方 1K JPG 端点。

## v56：摇滚曲目渲染音色（public/music/rock_*.mp3）

| 素材 | 来源 | 许可 |
|---|---|---|
| FluidR3_GM.sf2（Frank Wen，2000-2008） | Debian fluid-soundfont 3.1（cdn-fastly.deb.debian.org/debian/pool/main/f/fluid-soundfont/） | MIT（COPYING 随包分发） |

处理：乐手摇滚曲目（rock_stones/beatles/floyd/blues/velvet/garage/postpunk + rock_generic 共 8 首）
由 FluidSynth 2.6.0（MIT）离线渲染为 44.1kHz 立体声 WAV，再 ffmpeg 转 MP3 128kbps
（按各曲末音符取整到小节边界的循环长度裁剪 + 末尾 50ms 淡出），脚本：C:\Users\ZANRe\Documents\Default Project\midi\render_rock.py。

## v56 五轮：全曲目渲染音色（public/music/*.mp3）

| 素材 | 来源 | 许可 |
|---|---|---|
| FluidR3_GM.sf2（Frank Wen，2000-2008） | Debian fluid-soundfont 3.1（cdn-fastly.deb.debian.org/debian/pool/main/f/fluid-soundfont/） | MIT（COPYING 随包分发） |

处理：public/music/ 下全部 30 首 MIDI（层级 13 + 团体 8 + Tom 1 + 摇滚 8）由 FluidSynth 2.6.0
（MIT）离线渲染为 44.1kHz 立体声 WAV，再 ffmpeg 转 MP3 128kbps（按各曲末音符取整到小节边界的
循环长度裁剪 + 末尾 50ms 淡出），脚本：C:\Users\ZANRe\Documents\Default Project\midi\render_all.py。
原 .mid 备份在 app/music-backup-v56/。

## v57：手电筒 UV 材质

| 文件 | 来源 | 用途 |
|---|---|---|
| `flashlight_uv_atlas.png` | OpenAI 内置图像生成（2026-08-14）；均匀漫射光下的双区材质图集，左半为磨损黑色阳极氧化铝，右半为菱形滚花黑橡胶；无文字/标志 | 第一人称手持手电与地面/投掷手电共用的颜色与凹凸 UV；几何 UV 分别压入左右半区并保留 mipmap 防串色边距 |

生成提示重点：正交平面材质、精确 50/50 竖向分区、金属细拉丝/浅划痕、橡胶密集小菱形防滑纹、
均匀无方向光、无物体透视、无文字/标志/水印。运行时文件保留生成原始分辨率，由 GPU mipmap 缩小采样。

## v57g：基础补给 UV 材质

| 文件 | 来源 | 用途 |
|---|---|---|
| `item_canned_label_uv.png` | OpenAI 内置图像生成（2026-08-14）；做旧砖红/暖米白/芥末金/橄榄绿无品牌食品纸标签 | 罐装食品的三段环绕标签；装饰带、麦穗圆章、折痕、掉色与磨损均由 UV 提供 |
| `item_bandage_gauze_uv.png` | OpenAI 内置图像生成（2026-08-14）；均匀漫射光下的米白棉纱织物扫描风格材质 | 绷带卷体、端面与自定义 UV 垂带共用的纱线编织纹理 |

生成提示重点：正交平面材质、铺满画面、无场景/物体透视、无品牌/可读文字/水印、无烘焙方向光；
运行时均高质量缩小为 512×512 PNG。罐头贴图在 U 轴重复三次以保持圆章比例，绷带垂带沿长度使用重复 UV。

## v57j：电池与保温杯 UV 材质

| 文件 | 来源 | 用途 |
|---|---|---|
| `item_battery_wrapper_uv.png` | OpenAI 内置图像生成（2026-08-14）；做旧黑金 1.5V AA 碱性电池包装，含 BATTERY 与正负极标记 | 电池电芯 open-ended 侧壁包装 UV；钢制端面与正负极由独立几何/材质提供 |
| `item_almond_thermos_uv.png` | OpenAI 内置图像生成（2026-08-14）；拉丝不锈钢、旧纸标签、绿色边饰、杏仁图案及「杏仁水 / ALMOND WATER」字样 | 杏仁水保温杯身完整环绕颜色 UV |
| `item_cashew_thermos_uv.png` | OpenAI 内置图像生成（2026-08-14）；污损不锈钢、错版褐色标签、乱码说明与损坏条码 | 腰果水保温杯身完整环绕颜色 UV；刻意不出现正常品名 |

生成提示重点：正交平面环绕材质、左右边缘可接续、均匀中性光、无产品透视/场景/投影/水印。杏仁水要求
标签精确写出「杏仁水」与 `ALMOND WATER`；腰果水要求只使用伪字符、乱码和损坏条码。原始生成分辨率保留，
运行时由 mipmap 缩小采样。

## v57m：L7 入口舱体金属材质

| 文件 | 来源 | 用途 |
|---|---|---|
| `l7_cabin_metal.jpg` | 本项目脚本 `scripts/gen-l7-cabin-metal.py` 原创程序化生成（2026-08-15）：无缝锈蚀钢板、拼板焊缝、铆钉、划痕与流锈 | Level 7 入口房间与门廊的地板/墙面/天花板共用颜色贴图；无第三方版权负担 |

生成参数为确定性随机种子 20260815，脚本可直接复现；贴图为 1024×1024、4×4 拼板周期，支持 1m 世界 UV 平铺。

## v57s：L7 水-空气分界面贴图

| 文件 | 来源 | 用途 |
|---|---|---|
