# Level 0 重制素材来源

本目录的运行时贴图由 CC0 扫描材质派生通道与 imagegen 生成墙纸共同组成，并由 `app/scripts/gen-l0-materials.mjs` 处理；不直接把参考网页图片打包进游戏。

## 设定文本

| 页面 | 页面作者 | 中文译者 |
| --- | --- | --- |
| [Level 0](https://backrooms-wiki-cn.wikidot.com/latest:level-0) | DivineAtlas / DrAkimoto / RobertGoerman | ShorterIsBetter9 / wild ghost377 / whitelu |
| [红室](https://backrooms-wiki-cn.wikidot.com/red-rooms) | scutoid studios | Deip*isoster |
| [马尼拉房间](https://backrooms-wiki-cn.wikidot.com/manila-room) | Br Miller / Neptunium | calf-0 / xuziqi |

上述 Wikidot 设定文本的转述遵循页面的 CC BY-SA 3.0，保留作者与出处；图片的不同许可见下表，不将网页文字许可推定为所有图片的许可。

## 运行时纹理来源与生成

`gen-l0-materials.mjs` 对 CC0 扫描源的颜色、OpenGL 法线和粗糙度通道执行保留通道、重采样与均值调色，并为吊顶加入格线；颜色图输出为 1024²，OpenGL 法线与粗糙度图输出为 512²，共 14 种材质。生成墙纸的法线由亮度高度导出，属于程序派生法线，并非扫描实测法线。最新颜色与法线强度按参考图校准；imagegen 本身不保证确定性，但保存源图后，后续处理脚本可复现。

| 运行时纹理 | 源纹理与作者 | 许可 |
| --- | --- | --- |
| `carpet`、`arch-carpet`、`red-carpet` | [Dirty Carpet](https://polyhaven.com/a/dirty_carpet)，Rohit Seervi；主源每图缩小 6×6 纤维；`carpet`/`red-carpet` 使用 White Plaster 02 低频 24px、幅度 0.18，`arch-carpet` 使用独立米褐目标色与幅度 0.30 | CC0 扫描源；处理为派生纹理 |
| `wood`、`door-wood` | [Wood Floor](https://polyhaven.com/a/wood_floor)，Dimitrios Savva；`door-wood` 为单板裁切 `[12,5,88,910]`，避开地板接缝；单板横向重复 4 次并降低对比，派生法线非实测 | CC0 |
| `cream`、`ceiling`、`red-ceiling`、`pit`、`dots`、`manila-ceiling` | [White Plaster 02](https://polyhaven.com/a/white_plaster_02)，Rob Tuytel | CC0 |
| `wall` | `app/assets/l0-materials/wall-v4.png`，built-in imagegen 生成 | 项目生成素材；非 CC0 |
| `manila` | `app/assets/l0-materials/manila-v2.png`，按 Oleg Bor 参考照片中的墙纸花纹经 built-in imagegen 重建、调色、周期处理并派生 PBR 通道 | CC BY-SA 4.0（沿用参考花纹的许可；保留署名与修改说明），非 CC0 |

`red` 与 `wall` 同源使用 `wall-v4.png`，仅改色为红室目标色，不额外绘制墙斑；未知图片作者与许可均不作推定。

墙纸生成的完整 prompt、迭代记录与选择结果见 [`generation.json`](../../../assets/l0-materials/generation.json)；`wall` 比较后采用第 4 轮，`manila` 比较后采用第 2 轮。运行时使用重新绘制的花纹，并非将房间照片投射成墙或背景。马尼拉源图及 `manila.png`、`manila-normal.png`、`manila-rough.png` 一并保留 Oleg Bor 署名、参考链接及 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；此素材许可不改变项目代码及其他资产的许可。

本轮墙纸选择为 `wall-v4.png`（v3 过稀，v4 更密），`manila` 仍采用 v2；完整 prompt、迭代记录与选择结果见 [`generation.json`](../../../assets/l0-materials/generation.json)。这些是独立重建，不声明精确复刻。

## 参考图片与许可

| 用途 | 来源与作者 | 许可/备注 |
| --- | --- | --- |
| 黄室、拱门 | Bob Mazza 原始照片（Level 0 页面明确标为公有领域）；Level 0 页面中的 Alfarex 渲染 | 公有领域；Alfarex 渲染 CC BY-SA 3.0 |
| 柱厅、深坑、熄灯 | Alfarex 页面附件 | CC BY-SA 3.0 |
| 红室.webp | 作者待核实 | 未确认作者与许可，不作为可再分发素材 |
| 红室迷失前 | egglord / scutoid studios 页面 | CC BY-SA 3.0 |
| 马尼拉房间内部、门口两张渲染图 | PixelPurple（`manila_final_1/2`） | CC BY-SA 3.0 |
| 马尼拉墙纸 | [Oleg Bor](https://commons.wikimedia.org/wiki/File:Wallpaper_on_the_wall_of_the_apartment.jpg) | CC BY-SA 4.0 |
| 马尼拉布局 | Br Miller，基于 Robert Goerman 草图，[Manila Room Diagram v2](https://backrooms-wiki.wikidot.com/art:manila-room-diagram) | CC BY 3.0 |
| 马尼拉网页引用 | 页面授权部分注明 | CC0 1.0 |
| 马尼拉附近参考图 | 作者尚无直接确认 | 待核实 |

参考图仅用于构图、材质和空间关系校准；项目运行时使用本目录中的程序生成贴图。

2026-10-07 第 17 轮新增卡其色拱门支柱、防撞条、红色大桶和金属油漆桶，均为项目原创参数化几何（`src/game/world/l0Architecture.ts`、`src/game/renderer/l0Architecture.ts`），未导入第三方模型。颜色与 PBR 细节复用本文件已记录的 `cream` / White Plaster 02 CC0 来源，配合材质染色；没有新增下载或生成贴图。桶具使用 16 边筒体、卷边、内壁和提手，按材质合批，沿用世界 UV 和实例回收。


diffuser 使用同一 White Plaster 02 CC0 来源，目标色 [239,237,222]、颜色对比系数 0.035、法线幅度为基础值的 0.1、粗糙度固定 190；地毯粗糙度至少 245、木地板至少 215。普通/红地毯宏观磨损幅度 0.10，拱门 arch-carpet 为 0.18。生成清单共 15 套材质。
