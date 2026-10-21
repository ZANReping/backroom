# backroom-ouro-v34.zip 来源记录

- 用户提供：`C:\Users\ZANRe\Downloads\backroom-ouro-v34.zip`。
- SHA-256：`8904002506D2EBE7B7946E4677C45AB043C6227860B768C93BC5B01B0FFCBF32`。
- 共 105 项，展开 58,249,612 字节；完整清单见 [archive.json](archive.json)。包内声明基于 v3.3 `1ed965c`，累计补丁基于 `8423ae3`。
- 当前运行新增七张贴图：`public/textures/l1/ouro/{beige,colatlas,pink,plaster,soot,spray,wallatlas}.jpg`，逐字节复制原包 v3.4；[逐文件哈希记录](asset-hashes.json)。已有同名天鹰、花园及旧衔尾贴图哈希一致，保持原文件。
- 包内说明与处理提示词见 [UPSTREAM.md](UPSTREAM.md)、[打包说明](README-UPSTREAM.md) 和 [SOURCES.md](../../../public/textures/l1/SOURCES.md)。喷涂图已在原包降对比、模糊合并与低频斑驳处理；本轮没有重新生成或下载纹理。
- 图集通过原有 map 采样器选取子格，法线复用项目已有混凝土扫描；格栅和建材道具的纹理由 TypeScript / Canvas 确定性生成。
- [v3.3→v3.4 原始增量补丁](incremental-vs-v33-1ed965c.patch)随项目保存。累计补丁和完整 overlay 保留于本机导入缓存 `app/.cache/imports/ouro-v34-20261021/`，也可从上述原始 ZIP 恢复。
- [喷涂图包内前后对比](preview-compare.jpg)和 [原包场景截图](upstream-reports/compare.jpg)属于附件历史资料，不是本轮验收结果。

附件将新增颜色纹理记录为生成图，提供了参考图裁切及提示词，但没有独立作者署名或资产许可文件。此处保留用户附件来源，不把其重新标为 CC0，也不改变项目既有开放资产的作者与许可记录。参考照片为项目已有 `app/reference/L1/衔尾段.png`，本次没有将照片作为场景背景或截图专用材质。

集成适配与当前命令见 [衔尾段接入说明](../../../OUROBOROS-IMPORT.md)，本轮实测见 [验收报告](../../../reports/ouro-import-20261021/README.md)。
