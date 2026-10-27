# 镜面表面纹理来源

本目录保存镜面表面纹理的原始 JPG：`Color`、`NormalGL` 和 `Roughness`。素材来自 ambientCG / Lennart Demes 的 **Smear002**：

- 页面：https://ambientcg.com/view?id=Smear002
- 下载：https://ambientcg.com/get?file=Smear002_1K-JPG.zip
- 许可：CC0-1.0；许可证明：https://docs.ambientcg.com/license/
- 取得日期：2026-10-27

这是开源素材的离线处理结果，不是生成式 AI 资产，也没有新生成图像。

## 处理与复现

`scripts/gen-mirror-surface.mjs` 将原图重采样并合成为运行纹理 `app/public/textures/mirrors/surface.png`（512² PNG）：

- `R`、`G`：OpenGL 法线的 XY 分量；
- `B`：`0.8 × 原始粗糙度 + 0.2 × 原始颜色灰度`；
- `A`：恒为 255。

这些通道是线性数据，不应按颜色贴图进行色彩转换。脚本仅加入低强度的微小柔化、擦痕和边缘积灰，供镜面材质克制使用。

源图与输出文件的 SHA256 记录在 `app/public/textures/mirrors/manifest.json`。

## 实时反射参考

实时镜面反射的数学与实现参考本机 Three.js 0.185.1 的官方 `Reflector`：
https://threejs.org/docs/pages/Reflector.html

项目使用 Three.js MIT 许可（许可文件：`node_modules/three/LICENSE`）；这里只列出参考，没有复制第三方整文件。
