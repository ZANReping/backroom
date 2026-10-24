# 店铺／枪械包额外图像资源审计

本报告覆盖清单中不属于 `public/textures/traders/shops` 的图像资源。只读检查使用 Pillow，并将导入包 overlay 与实际项目 `E:\ZAN\backroom` 中的目标文件逐字节比较。

- 共 22 个图像文件，合计 3,770,925 字节（约 3.60 MiB）。
- 17 个枪械、弹药及市场物品像素图标均为 128×128 RGBA PNG，全部有效；导入包与项目目标文件逐字节一致。
- 市场物品图集 `color.png` 为 1024² RGB，`normal.png` 为 512² RGB，`roughness.png` 为 512² 单通道 L；三者均通过校验且与项目目标一致。
- `goods_atlas.jpg` 为 1024×2048 RGB JPEG，校验通过并与目标一致。
- `signs_atlas.jpg` 为 2048×4096 RGB JPEG，校验通过并与目标一致。清单将其标为 existing-different，但这是本轮有意更新的标牌图集。
- 未发现缺失、损坏、尺寸异常或字节不一致的目标文件。

枪械本体没有额外离线纹理缺口：`firearmMesh.ts` 使用运行时 canvas 生成并缓存材质纹理；枪械和弹药的离线图像资源仅是上述像素图标。
