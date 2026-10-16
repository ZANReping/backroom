# NPC 配饰图集来源

更新日期：2026-10-17。图集只派生自项目已经保存的开放许可材质，不裁切参考照片，也未引入第三方模型。

## 原始素材

以下素材的作者／发布方均为 **ambientCG**，精确许可为 **CC0 1.0 Universal**；[官方许可说明](https://docs.ambientcg.com/license/)允许修改、再分发及商业使用。素材页面与许可于 2026-10-17 核验。原素材属于程序化材质，不标称为实拍照片。

| 原始素材 | 项目原文件（相对 textures） | 下载 |
|---|---|---|
| [Fabric061](https://ambientcg.com/view?id=Fabric061) | `settlements/fabric_color.jpg` | [1K JPG](https://ambientcg.com/get?file=Fabric061_1K-JPG.zip) |
| [Metal012](https://ambientcg.com/view?id=Metal012) | `alpha/steel_color.jpg` | [1K JPG](https://ambientcg.com/get?file=Metal012_1K-JPG.zip) |
| [Wood051](https://ambientcg.com/view?id=Wood051) | `alpha/wood_color.jpg` | [1K JPG](https://ambientcg.com/get?file=Wood051_1K-JPG.zip) |
| [Cardboard004](https://ambientcg.com/view?id=Cardboard004) | `alpha/cardboard_color.jpg` | [1K JPG](https://ambientcg.com/get?file=Cardboard004_1K-JPG.zip) |

原文件 SHA-256 随 [manifest.json](manifest.json) 保存；此前来源记录见 [Alpha](../alpha/SOURCES.md) 与 [settlements](../settlements/SOURCES.md)。

## 本轮派生

- 输出：`app/public/textures/npc-gear/color.png`，256×256 RGBA，16 个 64×64 分区，每块 2 像素扩边。
- 生成器：`app/scripts/gen-npc-gear-atlas.mjs`。在 `app` 中运行 `npm run generate:npc-gear` 可从本地原素材复现。
- 修改：缩小、灰度化、压低纹理对比度；布料缝线、纸张文字线、医学标记、喇叭网孔与羽毛纹理由项目代码绘制。最终颜色由网格顶点颜色控制。
- 与现有人物一致使用 nearest 采样、低分辨率纹理和 Lambert 光照。没有额外法线／粗糙度通道，避免配饰产生区别于人物的高频高光；原始 PBR 通道仍保留在各素材原目录。
- 配饰几何、UV、骨骼权重、缝线与图案由本项目代码创作；原材质的 CC0 许可不改变整个项目或角色设定的许可。
