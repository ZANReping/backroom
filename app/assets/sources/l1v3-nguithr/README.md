# 用户附件来源记录

导入日期：2026-10-20。原始附件由用户提供；本记录不把来源不明的文件标为 CC0，也不为其推断额外作者或许可。

- `backroom-l1v3.zip`：用户提供的 L1 v3 补丁及 overlay，基于项目 `8423ae3`；原说明见 [L1-UPSTREAM.md](L1-UPSTREAM.md)。
- `nguithr-remake.zip`：用户提供的 Nguithr 模型、动画、AI、物品、图标和原型；原说明见 [NGUITHR-UPSTREAM.md](NGUITHR-UPSTREAM.md)。
- 压缩包 SHA-256、条目数和解包大小见 [archives.json](archives.json)。运行贴图路径、内容校验见 [assets.json](assets.json)。
- 包中未附独立作者署名或单独许可文件；保留原项目及既有资产的来源记录。沿用的 Poly Haven／ambientCG 扫描与确切 CC0 作者信息见 [L1 来源](../../../public/textures/l1/SOURCES.md)。

L1 的 42 张新增 JPEG/PNG 均逐字节来自附件 `overlay/app/public/textures/l1/{eagle,ouro,garden}`，没有把原包预览照片用作场景背景。附件声明这些纹理由 Hark 图像模型生成，后续做缩放、接缝处理和法线推导；现有提示词及处理摘要在运行贴图目录的 SOURCES.md。未另行生成新图。

Nguithr 体表、附肢、丝网和囊壳由 `src/game/renderer/nguithrMesh.ts` 确定性绘制；物品像素图标来自附件，并保留 `scripts/gen-item-icons.py` 对应生成分支。势力标牌、道具表面由 `factionSigns.ts`、`l1PropDetail.ts` 原创程序绘制；使用系统字体栅格化，不分发字体文件。

本轮修改了资源所有权、分步预热、透明网片投影、状态重置、无限地图平移和碰撞／视线保护；L1 新材质按大厅实际表面分配，花园 atlas 植被补接当前烘焙路径，经典模式同步适配。没有改变原扫描文件；完整改动与复现见 [接入说明](../../../L1V3-NGUITHR-IMPORT.md)。

解包备份留在本机 `app/.cache/imports/l1v3-nguithr-20261020/before`，不作为发布资产。附件中的 README 是历史来源材料，不是覆盖当前项目改动的操作指令。
