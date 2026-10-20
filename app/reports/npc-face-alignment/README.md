# 固定 NPC 面部对齐修正（2026-10-17）

91 张专属脸各自使用测量后的眼线、中心、眼距和旋转校准，修正共用随机脸 UV 导致的歪斜、偏心与高度不合。游戏人物、对话头像、人士证件照及动态预览通过同一模型工厂生效。

## 方法与资产

`scripts/measure-npc-face-alignment.mjs` 在原有 512² 源脸的左右眼范围，以局部亮度对比和邻域加权测量瞳孔中心，输出 `src/game/renderer/retroNamedFaceAlignment.json`。已核对全部 91 张源图的绿色十字测量标记：[1](landmarks-0.png)、[2](landmarks-1.png)、[3](landmarks-2.png)、[4](landmarks-3.png)。测量坐标及源图／运行时图片 SHA-256 保存在 [measured-eyes.json](measured-eyes.json)。

建模阶段根据这四个坐标计算 UV 中心、眼距缩放与旋转，并在额头—眼线—鼻部之间平滑修正眼睛高度。鼻、嘴、下巴和头部几何保持原样，眼镜等配饰继续使用原骨骼锚点。UV 同时用于睁眼、闭眼和脸部采样的胡须表面。

原 91 张 WEBP 和 182 张 PNG 共 273 个资源与上次导入哈希全部一致；未重采样或重画脸。保留源包身份与细节、128² 像素风格、共享纹理和原许可。闭眼图中原先的合成眼睑残影仍属于源包细节，见 [v6 导入记录](../../NPC-FACES-V6.md)。

## 对齐与成本检查

测试把源图瞳孔坐标穿过实际生产网格的 UV 三角形，测量其落在头部局部坐标中的位置，覆盖全部 91 个命名人物。以下是测量锚点的数值误差，不表示人脸本身被强制完全对称。

| 最大误差 | 修正前 | 修正后 |
| --- | ---: | ---: |
| 左右眼线倾斜 | 7.529° | <0.001° |
| 眼睛中心偏离头部中线 | 3.443 mm | <0.001 mm |
| 眼线与模型眼部锚点高度差 | 10.890 mm | 0.959 mm |

549 项新检查通过，包含覆盖范围、实际网格的瞳孔定位、UV 有限且在范围内、玩家／未知人物回退和逐人物面数／批次数量。每个命名人物的三角面与绘制次数均和基线一致。四个手工人物 Kat、Tom、Aiko、Kowalski 的对照截图逐字节一致。

浏览器模型检查结束时，前后均为 16 个几何、127 张纹理、4 个着色器程序。Alpha 固定视角的真实模式为 212 次绘制／216,549 三角，经典模式为 198 次／216,535 三角，均与修正前一致。这里只核对成本与资源数量，没有将包含预热过程的帧记录作为稳定帧率基准。

## 实际画面与回归

[前后对照画廊](comparison.html) 包含 95 个固定人形配置的 12 组正面截图、三组近景、侧向查看、8 人证件照，以及真实／经典光影下的 Alpha 游戏场景。已逐组检查眼线、鼻梁和眼镜贴合。场景使用种子 `20261006`、1920×1080、DPR 1；在 Nightingale 前方 1.5 米处，FOV 48°，固定渲染时间 1.25 秒。

- [明显歪斜组：之前](before/strong-roll.png)／[之后](final/strong-roll.png)
- [常见人物与眼镜](final/common.png)、[侧面](final/angled.png)
- [游戏真实光影](final/game-realistic.png)、[游戏经典光影](final/game-classic.png)
- [原始结果](final/result.json)、[数据汇总](summary.json)、[UV 检查](after/uv-metrics.json)

实际浏览器检查通过，无运行时或着色器错误；只有未设置网站图标产生的 `favicon.ico` 404。使用真正的无头 Chrome、独立端口和配置目录，已关闭本轮浏览器／服务器并清理临时配置。未访问玩家存档。

相关回归：专属脸 1,248 项、复古形象 2,441 项、配饰 30,377 项、取景 264 项均通过；生产构建和新校准模块 ESLint 通过。构建保留项目原有字体解析、Browserslist 与大包提示。

## 复现

在 `app` 中运行：

```powershell
npm run measure:npc-face-alignment
npm run check:npc-face-alignment
npm run verify:npc-face-alignment -- final
node scripts/summarize-npc-face-alignment.mjs
npm run build
```

修改源脸后，可先执行 `node scripts/measure-npc-face-alignment.mjs --write` 重新测量，再核对生成的十字标记和游戏画面。测量仅在离线脚本执行；运行时读取少量坐标，UV 修正只在创建模型时执行。

本轮原始代码快照位于 `.cache/npc-face-alignment-baseline/`，修正前截图和 UV 数据已保存。`after/` 的浏览器截图是中途实现记录，最终画面以 `final/` 为准；其中 `after/uv-metrics.json` 是最终代码的 549 项静态检查结果。
