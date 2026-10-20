# Poolface v82 接入

本次导入用户提供的 `backroom-poolface-v82.zip`，针对随机 NPC 和玩家共用的面部贴图池。更新 120 张 128² RGBA 脸图（30 张身份脸及配套表情／闭眼），改善平滑发际线、细碎发梢、羽化与角落皮肤修补；面部着色增加发丝明暗和发际线轻阴影，缓存键更新为 `retro-face-hair-v82`。

按增量合入 `retroNpc.ts`、两个 Python 处理脚本与 `retroNpcProto.ts` 的 `poolclose` 模式，保留固定 NPC 贴图、面部对齐、配饰和人士证件照实现。没有整包覆盖旧代码，也没有改模型面数、UV、贴图分辨率或材质分组。

来源：用户提供的 `C:/Users/ZANRe/Downloads/backroom-poolface-v82.zip`；SHA-256 为 `e6a7ebfb6065b1d43bef9d62c05212aa8b19da5b4d2633201e8126eb7d1cc87a`。包内未单列作者或独立许可证，按用户交付的项目更新接入，沿用现有 `art-source/npc-retro` 的源脸和生成记录，本轮未下载或新生成第三方图像。

处理源代码为 `scripts/gen-retro-avatar-textures.py` 与 `scripts/retro_face_clean.py`，需要 Python、NumPy、Pillow、OpenCV。运行前者还会再生成原有固定 NPC 和衣物，本次仅导入结果，没有运行全套再生成。逐文件源／目标哈希见 `reports/poolface-v82/assets.json`；一次性增量合并脚本为 `scripts/import-poolface-v82.mjs`。

在 `app` 执行 `npm run verify:poolface` 和 `npm run verify:poolface -- --before`。基线需要本机 `.cache/poolface-v82-holster-before/` 快照，并显式读取旧代码与旧贴图。画廊覆盖男女、五档肤色、全部 30 张身份脸、眨眼、染发、光头与资源回收；实际游戏检查另由 `verify:holster` 覆盖。[验收与前后截图](reports/poolface-v82/README.md)。原包预览单独放在 `source/`，不作为本地验收结果。
