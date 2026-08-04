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
- 上述 `_src_*` 为脚本输入原图（wikidot 内容 CC BY-SA 3.0）；处理规则：纯色标志重着色为主题色、
  有色标志（BRC / 杰瑞的信众）保留原色；水印以低透明度居中于介绍框背景，不溢出框。

下载地址形如 `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`。
