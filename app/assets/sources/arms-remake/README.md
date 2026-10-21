# arms-remake.zip 来源记录

- 提供者：用户本地附件 `C:\Users\ZANRe\Downloads\arms-remake.zip`。
- SHA-256：`7E5164BD75762A9208160E0660A4A74585ADB96A3B08E1FE1DCCC05E4863C751`。
- 119 个归档项，解压内容 28,185,472 字节；完整条目见 [archive.json](archive.json)。原包声明基线为 `002514e`（8423ae3 源码）。
- 模型、皮肤／烧焦／金属／烟雾／焦痕贴图均由附件 TypeScript 程序生成；本次未下载外部模型、音频或图片，八类声音沿用附件程序合成。
- 原始阶段说明：[UPSTREAM.md](UPSTREAM.md)；打包说明：[README-UPSTREAM.txt](README-UPSTREAM.txt)；完整原始代码：[arms-remake.patch](arms-remake.patch)。三个 `upstream-verify-*.mjs` 保存原包验证器，作为历史资料，不在接入流程中执行。
- 当前模型与纹理可由 `src/game/renderer/armsMesh.ts`、动画由 `armsAnim.ts`、机制由 `engine/armsAI.ts` 复现。集成修正和当前命令见 [当前说明](../../../ARMS-REMAKE.md)。

附件未附独立作者署名或许可证文件；此处记录为用户提供的程序资产，不将其标为 CC0。附件引用的设定页为 [FR Wikidot / Entité 15-FR](https://fr-backrooms-wiki.wikidot.com/entite-15-fr)。本次读取该页失败，未独立核验该页作者与许可，也未复制该页图片；游戏中文文案来自附件。该状态只记录来源事实，不替原作者授予许可。

原包的早期文档与截图含“未接入”“CPU 蒙皮”“SwiftShader”及不同阶段面数，仅描述当时交付；本次真实游戏验收与最终预算以项目报告为准。
