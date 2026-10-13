# Level 1 重制来源记录

## 层级原文

- 原文：[Level 1](https://backrooms-wiki-cn.wikidot.com/level-1)
- 作者：Praetor3005、DivineAtlas
- 中文译者：ShorterIsBetter9、Linw5、whitelu、MC13min、wild ghost377
- 许可：CC BY-SA 3.0
- 用途：设定与设计参考。参考图仅用于设计，不作为游戏背景图。

## 参考图片

以下图片仅作为场景构图、材质与氛围参考；除明确写出的信息外，不推断逐图对应关系或许可范围。

| 场景 | 来源与许可 | 链接/备注 |
| --- | --- | --- |
| 天鹰段：常见、干湿、明暗等多张图 | SunCon Photos，CC BY 2.0 | [14070865988](https://www.flickr.com/photos/suncon/14070865988/)、14026218671、16337288051、14443992293、15809835650、15374854314（Flickr） |
| 天鹰段：Walk of Cairo | rakogames，CC BY 3.0 | 原文署名；单图映射未核实 |
| 天鹰段：黑暗渲染 | r0tt3n01_，CC BY 2.0 | 原文署名 |
| 天鹰段：自然装饰物 | Jonny Clow，Unsplash License | [Table with chairs near wall in a dark room](https://unsplash.com/fr/photos/table-with-chairs-near-wall-in-a-dark-room-BuMVDXZTGn0) |
| 跃金段 | Downtowngal，CC BY 4.0 | [Empty interior, Grand Avenue LA 2](https://commons.wikimedia.org/wiki/File:Empty_interior,_Grand_Avenue_LA_2.jpg) |
| 哥特段 | Canley，CC BY 4.0 | [Melbourne Uni underground carpark interior](https://commons.wikimedia.org/wiki/File:Melbourne_Uni_underground_carpark_interior.jpg) |
| 衔尾段 | endrew，CC BY 3.0 | 原文署名 |
| 花园段 | LaundryFan_04，CC BY 3.0 | 原文署名 |
| 小径走廊 | Municipal Archives of Trondheim，CC BY 2.0 | [Flickr 10998312184](https://www.flickr.com/photos/trondheim_byarkiv/10998312184/) |
| 小径房间 | mythylcymene，CC0 | 原文署名 |
| 板条箱 | Thelmadatter，CC BY 3.0 | [CratesHidalgoExpoMAP](https://commons.wikimedia.org/wiki/File:CratesHidalgoExpoMAP.jpg) |
| 停电 | Fabian Schmidt，CC BY 2.0 | [Flickr 30074660061](https://www.flickr.com/photos/79511852@N03/30074660061)；原文注明由 Praetor3005 使用 Photomosh 修改 |

## 游戏纹理来源

- Level 1 纹理来源与本地文件记录：[public/textures/l1/SOURCES.md](public/textures/l1/SOURCES.md)
- Level 1 Poly Haven 植物叶片纹理来源与复现脚本：[public/textures/l1/polyhaven/SOURCES.md](public/textures/l1/polyhaven/SOURCES.md)

## 第四轮实现参考与原创资产

- 柔边体积光实现思路参考 [jeromeetienne/threex.volumetricspotlight](https://github.com/jeromeetienne/threex.volumetricspotlight)，作者 GitHub `jeromeetienne`，MIT。仅参考透明锥体/视角边缘衰减思路，没有复制其代码或下载资产。项目实现为 `src/game/renderer/l1Shafts.ts`：四个实例的斜向光束、局部遮挡检查、上下端淡出和停电绑定；保留现有原生灯与阴影，不新增后处理遍数。
- 新增 `public/textures/l1/crate-marks.png`，由项目脚本 `scripts/gen-l1-crate-marks.mjs` 原创线段绘制数字与朝上箭头；不使用外部字体或参考照片。脚本可直接重建 1024² 图集。木材继续使用原有 Wood051 CC0 扫描。
- 连续地面/墙面变化复用既有 CC0 扫描及原有剥落、地被贴图，未新增 AI 生成纹理。世界坐标颜色场及平滑混合是运行时原创代码；原始来源图保持不变。

## 第五轮建筑和光照数据

- `src/game/world/l1Building.ts`、`l1ReferenceCases.ts`、`l1Bake.ts` 与 `public/assets/l1-bakes/*.json.gz` 为项目原创参数化建筑、相机标定和计算结果；没有复制参考照片像素到游戏资产。原有照片及其作者、许可仍按上表记录。
- 漫反射颜色来自项目近似材料参数，PBR 仍复用上述 CC0 扫描。`scripts/prebake-l1.ts` 可复现离线数据，算法修订、内容指纹、采样和耗时随结果保存；运行步骤见 `L1-REMAKE.md`。
- 花园继续复用 Rico Cilliers 的 CC0 叶片图集，本轮增加三种 UV 选区、旋转和密度变化，源图未编辑；详细选区由 `src/game/world/l1Bake.ts` 给出。没有新增外部模型、AI 纹理或不明许可下载。
- 当前光柱是原有项目实现的扩展（最多 16 个开口实例，固定世界方向），不再采用历史第四轮的“四束”限制。参考项目署名和 MIT 说明保留。


## 第八轮陈设与相机校准

- 原创数字图集已由旧线段字形更新为 Georgia 栅格文字及原创运输符号；没有分发字体文件或复用照片像素。参考板条箱照片为上表 Thelmadatter 的 CC BY 3.0 作品；具体生成环境、脚本和修改记录见 public/textures/l1/SOURCES.md。
- 天鹰陈设后墙复用 Amal Kumar 的 Painted Brick，CC0 1.0，颜色/法线/粗糙度文件与原小径相同。桌椅、百叶板和箱堆均为项目参数化几何，没有新增外部模型。
