# 镜面运行纹理

`surface.png` 是 512² 的运行纹理，由 `app/assets/mirror-surface` 中 ambientCG / Lennart Demes 的 **Smear002** 原始 JPG 离线合成。

- 来源：https://ambientcg.com/view?id=Smear002
- 下载：https://ambientcg.com/get?file=Smear002_1K-JPG.zip
- 许可：CC0-1.0；许可证明：https://docs.ambientcg.com/license/
- 取得日期：2026-10-27
- 复现脚本：`app/scripts/gen-mirror-surface.mjs`
- SHA256：见同目录 `manifest.json`

PNG 通道为线性数据：`RG` 是 OpenGL 法线 XY，`B = 0.8 × 原始粗糙度 + 0.2 × 原始颜色灰度`，`A = 255`。运行时以低强度镜面表面数据使用，包含轻微柔化、擦痕和边缘微积灰；它不是生成式 AI 资产。

实时反射参考 Three.js 0.185.1 官方 `Reflector`：https://threejs.org/docs/pages/Reflector.html 。Three.js 使用 MIT 许可，许可文件为 `node_modules/three/LICENSE`；项目未复制其第三方整文件。
