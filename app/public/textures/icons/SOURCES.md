# 背包图标素材来源（v14）

全部来自 game-icons.net（许可：Creative Commons CC BY 3.0，可商用，需署名作者 Lorc / Delapouite；
署名即本文件与游戏内「关于/图鉴」页面声明）。原始素材为白前景透明底 512px PNG，
本地处理为 128×128 RGBA PNG（均 <64KB）。保留 SVG 线性图标作为加载失败兜底。

| 物品 | 文件 | 图标 | 作者 | 来源 URL |
|---|---|---|---|---|
| 杏仁水 almond | almond.png | beer-bottle | Delapouite | https://game-icons.net/1x1/delapouite/beer-bottle.html |
| 绷带 bandage | bandage.png | bandage-roll（绷带卷，v15 由 bandaged 更换） | Lorc | https://game-icons.net/1x1/lorc/bandage-roll.html |
| 电池 battery | battery.png | batteries（柱状电池组，v15 由 car-battery 更换） | Lorc | https://game-icons.net/1x1/lorc/batteries.html |
| 撬棍 crowbar | crowbar.png | crowbar | Delapouite | https://game-icons.net/1x1/delapouite/crowbar.html |
| 磁带 tape | tape.png | audio-cassette | Delapouite | https://game-icons.net/1x1/delapouite/audio-cassette.html |
| 打火机 lighter | lighter.png | lighter | Delapouite | https://game-icons.net/1x1/delapouite/lighter.html |
| 幸运兔脚 rabbit | rabbit.png | paw（兽爪/兔脚造型，v15 由 rabbit 更换） | Lorc | https://game-icons.net/1x1/lorc/paw.html |
| 车钥匙 carkey | carkey.png | car-key | Delapouite | https://game-icons.net/1x1/delapouite/car-key.html |
| 汽油罐 gas | gas.png | jerrycan | Delapouite | https://game-icons.net/1x1/delapouite/jerrycan.html |
| 扳手 wrench | wrench.png | spanner | Lorc | https://game-icons.net/1x1/lorc/spanner.html |
| 隔热手套 gloves | gloves.png | gloves | Delapouite | https://game-icons.net/1x1/delapouite/gloves.html |
| 绝缘服 suit | suit.png | hazmat-suit | Delapouite | https://game-icons.net/1x1/delapouite/hazmat-suit.html |
| 保险丝 fuse | fuse.png | spark-plug | Delapouite | https://game-icons.net/1x1/delapouite/spark-plug.html |
| 咖啡 coffee | coffee.png | coffee-mug | Lorc | https://game-icons.net/1x1/lorc/coffee-mug.html |
| 门禁卡 keycard | keycard.png | key-card | Delapouite | https://game-icons.net/1x1/delapouite/key-card.html |
| 万能钥匙 skeleton | skeleton.png | skeleton-key | Lorc | https://game-icons.net/1x1/lorc/skeleton-key.html |
| 银餐具 silverware | silverware.png | knife-fork | Lorc | https://game-icons.net/1x1/lorc/knife-fork.html |
| 镇定剂 sedative | sedative.png | syringe | Lorc | https://game-icons.net/1x1/lorc/syringe.html |
| 手电筒 flashlight | flashlight.png | flashlight（筒身+灯头+开关，v20 由手绘 SVG 更换） | Delapouite | https://game-icons.net/1x1/delapouite/flashlight.html |

直接文件 URL 形如 `https://game-icons.net/icons/ffffff/transparent/1x1/<author>/<name>.png`。

未找到合适素材、保留手绘 SVG 的物品：罐装食品 canned、荧光棒 glowstick、
壁纸碎片 wallpaper、电容器 capacitor、订书机 stapler。

## v21 用户提供素材（去黑底/128px 处理）
- skeleton.png（万能钥匙）← keyring.png — 用户提供
- canned.png（罐装食品）← opened-food-can.png — 用户提供
- stapler.png（订书机）← stapler.png — 用户提供
- rabbit.png（幸运兔脚）← 无标题50_20260726182051.png — 用户提供
- capacitor.png（电容器）← 无标题48_20260726181646.png — 用户提供
- glowstick.png（荧光棒）← 无标题49_20260726181850.png — 用户提供
- wallpaper.png（壁纸碎片）← 无标题50_20260726183136.png — 用户提供

## v28 原创像素画图标（pixel/，全部 53 件物品）

`pixel/item_<id>.png`：128×128 RGBA（32×32 像素原稿最近邻放大 4 倍），**全部为本项目内部原创像素画**，
仅参照后室 Wikidot/Fandom 物品设定描述设计造型，**无外部素材、无外部版权来源**，随项目同许可发布。
运行时优先加载像素贴图，404/加载失败依次回退上方 v14/v21 旧贴图 → 手绘 SVG 兜底；
渲染使用 `image-rendering: pixelated` 保持小格子内像素锐利。

覆盖物品（53 件，按 id 字母序）：
almond, axe, bandage, battery, canned, capacitor, carkey, cashew, cavingsuit, chalkstub,
citywater, coffee, crowbar, divemask, driedfruit, endnote, flashlight, fuse, fuyouyu, gas,
gloves, glowstick, headlamp, housekey, keycard, knife, lighter, megfolder, nails, notebook,
oddbook, pamphlet, pockets, presses, rabbit, rope, royalration, sedative, silverware, skeleton,
squirtgun, stapler, stonekazoo, suit, tape, thingmeat, timber, uvlamp, wallpaper, warpberry,
wheatgrain, wrench, xenonmarble

## 2026-10-18 原创丝绒蛋糕像素图标

`pixel/item_velvetcake.png` 为本项目原创程序化像素画，造型对应现有丝绒蛋糕模型，未使用外部位图素材。32×32 透明原稿经最近邻放大为 128×128 RGBA，沿用本项目既有像素图标的授权处理。生成命令：在 `app` 目录运行 `python scripts/gen-item-icons.py`；已有 PNG 会跳过，绘制函数为 `draw_velvetcake`。派对客及蛋糕的设定来源见 [派对客接入说明](../../../PARTYGOER-REMAKE.md)。

## 2026-10-18 杰瑞相关原创像素图标

`pixel/item_jerryflyer.png` 与 `pixel/item_fakelog.png` 为本项目原创程序化像素画，使用 `scripts/gen-item-icons.py` 的 Pillow 绘制流程生成；无第三方素材或版权来源，随项目同许可发布。生成命令：在 `app` 目录运行 `python scripts/gen-item-icons.py`。

`pixel/item_tape_l0.png`（Level 0 专属磁带）为本项目原创程序化像素画：与 `item_tape.png` 同一卡带轮廓，调色板与标签花纹（单黄墙纸竖纹/菱点、潮湿地毯色外壳、霉斑）取自层级磁带外观表 `src/game/content/levelTapes.json`。使用 `scripts/gen-item-icons.py` 的 `draw_level_tape` 绘制，32×32 透明原稿最近邻放大为 128×128；无第三方素材，随项目同许可发布。以后新增 tape_l1…tape_l11：在外观表追加条目后重跑脚本即可。

## 2026-10-25 施工许可像素图标

`pixel/item_brc_permit.png`（后室装修公司「施工许可」）为本项目原创程序化像素画：写字板 + 淡蓝复写单据 + 团体主色抬头 + 金色钢印 + 黄黑施工条纹，配色取自 `src/game/content/factions.ts` 中 brc 的 color/sub。使用 `scripts/gen-item-icons.py` 的 `draw_brc_permit` 绘制，32×32 透明原稿最近邻放大为 128×128；无第三方素材，随项目同许可发布。

`pixel/item_dustmask.png`（Level 0.2「防尘口罩」）为本项目原创程序化像素画：白色折叠杯形口罩 + 橙色松紧带 + 鼻夹 + 呼吸阀。使用 `scripts/gen-item-icons.py` 的 `draw_dustmask` 绘制，32×32 透明原稿最近邻放大为 128×128；无第三方素材，随项目同许可发布。
