# Faceling / Skinstealer 导入来源记录

用户归档：`C:/Users/ZANRe/Downloads/backroom-faceling-to-skinstealer-v73-v77.zip`
归档长度：53,961,173 字节
归档 SHA256：`77791E1B24B487B07889B2169E1D5840C0E47182EDCDE5FE1541CD273B0DFD4C`

五张 faceless 纹理由现有项目 face pool 生成，沿用既有 npc-retro 来源记录；生成脚本为 `app/scripts/gen-faceless-textures.py`。来源包未提供外部作者或独立许可，不推断或宣称 CC 许可。上游报告和截图仅作上游预览，不代表当前游戏 QA。

运行时纹理：`app/public/textures/npc-retro/faceless/`
源图说明：`app/art-source/npc-retro/faceless/README.md`
报告：`app/reports/retro-npc/v73/` 至 `v76/`，以及 `app/reports/skinstealer-v77/`
上游 source previews 仅列出、不重复复制：`part31-faceling-l3.jpg`、`part32-faceling-real.jpg`、`part33-faceless-skin.jpg`、`part34-faceling-size-skin.jpg`、`part35-skinstealer.jpg`

共复制 38 个文件，合计 6,372,827 字节；逐文件 SHA256 与安全解压源一致。完整路径、字节数和 SHA256 见 `import-manifest.json`。

## 代码与设定来源（2026-10-14 核对）

- 上述统计是原样复制的纹理、脚本与历史报告。生产代码采用包内 `backroom-faceling-to-skinstealer-v73-v77-incremental.patch` 的相关差异增量合并，未覆盖完整旧版 renderer/avatar/hands。新文件为 `src/game/renderer/facelingFace.ts`、`skinStealerMesh.ts`、`src/game/engine/skinStealerAI.ts`，预览入口为 `proto-skinstealer.html` / `src/proto/skinStealerProto.ts`。合并修正见 `SKINSTEALER-REMAKE.md` 和当前 QA 报告。
- 窃皮者吸盘皮肤颜色图和高度图由 `skinStealerMesh.ts` 的固定种子 Canvas 程序生成，颜色/高度共用点阵；没有下载或复制外部照片纹理。
- [Entity 10 - 窃皮者](https://backrooms-wiki-cn.wikidot.com/entity-10)：原作者 AndromedaMapping1，重写 1000dumplings；初译 lenghe0909，校对/复译 Michael Schmelz。原文 [Entity 10](https://backrooms-wiki.wikidot.com/entity-10)，正文采用 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。本项目改编为模型、图鉴摘要和压缩时间的单人行为；未导入页面 Garb 创作的图片。游戏内时间、HP、动作阈值是玩法参数，不是原文数值。
- [Level 3 - 发电站](https://backrooms-wiki-cn.wikidot.com/latest:level-3)：作者 Natedagreat563；译者 jiaoyanerlan2、KkKkk_1234、ShorterIsBetter9、owl4513、DTS-Lynn、Yrzd6、wild ghost377、whitelu、Nameless35722。原文 [Level 3](https://backrooms-wiki.wikidot.com/level-3)，正文 CC BY-SA 3.0。本项目将进化无面灵描述转化为确定性的异常五官；未复制页面插图。
- 以上正文署名与许可不代表压缩包中未声明许可的代码/生成纹理另获 CC 许可。已有生成脸池的声明见 `../retro-avatar-import/SOURCES.md`。
