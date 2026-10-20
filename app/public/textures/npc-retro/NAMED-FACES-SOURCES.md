# NPC faces v6 来源与导入记录

本批面部贴图来自用户提供的 `C:/Users/ZANRe/Downloads/backroom-npc-faces-v6.zip`，导入时已知 ZIP SHA-256 为 `5dc39f09d1820e5c7fd04a2ba0b79faa76f07d78771bbcce9457afae891b860d`。Hark 仅作为源包内的生成来源声明记录；项目不据此推断其具有公开许可，使用范围以用户提供的源包和本项目授权为准。

源包将本批作者／生成来源记为项目自有的 Hark AI 生成，许可原文为“项目自有（AI 生成）”，未提供独立的外部公开许可 URL。原始来源为用户提供的 ZIP；本轮没有从其他网站取图。

导入后的源图保存在 `app/art-source/npc-retro/named/`，完整提示词位于 `app/art-source/npc-retro/manifest.json → named.jobs`。导入脚本只合并其中的 `named` 字段，保留项目原 manifest 的其他字段。运行时贴图为 128×128 RGBA PNG：RGB 是清理后的面部颜色，A 是原图发区遮罩（0 为发区、255 为皮肤），着色器按角色发色替换原发区，随后恢复不透明；A 不用于裁切头像。

## 内容和修改

- `public/textures/npc-retro/named/`：专属 NPC 的 neutral 与 neutral-blink PNG。
- `public/textures/npc-retro/pool/`：通用人物池的 neutral、眨眼及有限表情 PNG。
- `art-source/npc-retro/named/`：对应专属人物的 WEBP 源图记录。
- 导入只复制上述三类文件，合并 `manifest.json` 的 `named`，并计算每个目标文件的 SHA-256。
- 本次直接导入包内成品，保存其生成器 `gen-retro-avatar-textures.py`、发区修补器 `retro_face_clean.py` 和完整提示词供复现。源包说明为：RGB 用周围皮肤修补源图发色和白边，A 记录原发区，闭眼图由同一张脸程序合成。

91 个命名 NPC 使用本批 `named/<id>/` 贴图。Kat、Tom、Aiko、Kowalski 四个手工人物继续使用各自原专属贴图；BRC 保持无脸，Tiny 继续使用非人形实体模型。

2026-10-17 补充 UV 对齐校准：`src/game/renderer/retroNamedFaceAlignment.json` 为本项目离线测量上述源脸瞳孔所得的坐标数据，处理器是 `scripts/measure-npc-face-alignment.mjs`。运行时对 UV 进行中心、眼距、眼线高度和旋转校正；WEBP／PNG 共 273 个原资源的 SHA-256 仍与导入时相同，没有增加第三方资产。测量与前后对照见 `app/reports/npc-face-alignment/`。

## 复现导入

脚本默认读取已安全解压的 staging 目录；也可以传入另一个位于 `app` 内的 staging 路径。脚本不会自动运行：

```powershell
node app/scripts/import-npc-faces-v6.mjs
node app/scripts/import-npc-faces-v6.mjs app/.cache/npc-faces-v6-import/overlay/app
```

首次运行会将即将覆盖的旧资源和旧 manifest 保存到 `app/.cache/npc-faces-v6-baseline/app/`，之后不会覆盖该 baseline；结果写入 `app/reports/npc-faces-v6/import.json`。脚本只接受 app 内的普通 PNG/WEBP/JSON 文件，拒绝符号链接、路径越界和扩展名不匹配文件。
