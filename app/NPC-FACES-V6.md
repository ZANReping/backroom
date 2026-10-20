# NPC 面部贴图 v6 接入

2026-10-17。来源为用户提供的 `backroom-npc-faces-v6.zip`，已合入 `app` 的游戏人物和档案／对话头像。

同日修正专属脸偏斜：91 张脸改用逐图测量的中心、眼线、眼距和旋转 UV 校准，游戏、预览与证件照共用；原图片、模型面数和配饰保持原样。[前后对照与复现](reports/npc-face-alignment/README.md)。

## 导入范围

- 91 个固定 NPC，各有独立的 128² 睁眼／闭眼贴图，共 182 张；包含 Alpha 居民和 Level 11 常驻人物。
- 120 张更新后的通用脸池贴图，供随机居民和玩家表情使用。
- 91 张 512² WEBP 源脸、完整生成提示词与处理脚本。
- `retroNamedFaces.ts` 注册表、`RetroAvatarOpts.faceId` 选择以及原发区遮罩着色。

本轮保存了 393 个资源文件（12,596,080 字节），逐文件 SHA-256 记录于 [import.json](reports/npc-faces-v6/import.json)。运行时代码按差异合并，继续使用已经贴合的帽饰、衣物、手持物与模型工厂。Kat、Tom、Aiko、Kowalski 使用原手工专属面孔；随机居民保持种子选脸，BRC 保持无脸外形，Tiny 使用原实体预览。

PNG 的 alpha 记录原始发区，不表示透明孔洞：有头发时用人物自身发色替换发区，光头／无脸角色使用清理后的肤色；最终仍是不透明材质。脸部着色器与其他人物材质使用不同的程序缓存键，并串接已有环境光照及探针。眨眼只切换共享纹理引用，不增加几何或额外绘制层。

来源、许可声明、原图和提示词路径见 [NAMED-FACES-SOURCES.md](public/textures/npc-retro/NAMED-FACES-SOURCES.md)。本轮使用包内原成品，没有重新生成或修改其人脸图像。

## 复现

在 `app` 运行：

```powershell
# 资产导入默认读取 .cache/npc-faces-v6-import/overlay/app
node scripts/import-npc-faces-v6.mjs
npm run check:retro-named-faces
npm run check:retro-avatar
npm run check:npc-gear
npm run build
npm run verify:npc-faces -- review
```

导入前旧资源和代码保存在 `.cache/npc-faces-v6-baseline/app/`，第一次备份不会被后续导入覆盖。包内的全量／增量 Git 补丁没有执行。

离线纹理处理器为 `scripts/gen-retro-avatar-textures.py` 和 `scripts/retro_face_clean.py`，依赖 numpy、Pillow、opencv-python-headless；运行前应保留原图和包内成品。此处理器会重建脸池、闭眼图及衣物，正常使用已导入成品不需要运行它。本次未重跑该处理器，逐文件校验保证导入资产与源包相同。

## 验证与已知限制

静态检查覆盖 91 个所需固定 NPC：缺失 0、重复文件内容 0，尺寸／RGBA、眨眼区域、发区遮罩、工厂选脸和旧外形回归通过。实际浏览器检查 95 个固定人形预览（91 张新脸和 4 个手工人物）、随机／玩家回退、眨眼切换及四个头像；另在 Alpha 游戏场景中检查经典和真实光影。

包内少数闭眼图的程序合成位置不完全吻合原眼睛，例如 `named/lan/neutral-blink.png` 仍有睁眼轮廓和下缘黑影。本轮保留用户提供的图像，没有将“能够切换闭眼纹理”的测试等同于闭眼图美术质量全部通过。源包还标注了部分男性面孔相似、发区纯色近看有边缘的问题。

前后截图、运行数据和性能对照见 [验收记录](reports/npc-faces-v6/README.md) 与 [画廊](reports/npc-faces-v6/comparison.html)。
