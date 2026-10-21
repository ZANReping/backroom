# L4、近战武器与牧蛇导入来源（2026-10-21）

用户提供三个本地压缩包，完整文件清单与 SHA256 见 [archives.json](archives.json)。来源目录为 C:/Users/ZANRe/Downloads，实际接入 E:/ZAN/backroom/app。

## 代码与模型

L4 v2 E2b、五种近战武器及牧蛇的程序化几何、纹理绘制、动画与 AI 来自这三个包；包中未声明独立作者姓名或单独开源代码许可。按用户授权接入本项目，不将“用户提供”解释成 CC0。保留上游原文设计、相机资料和功能补丁；上游历史测试与截图不代表本次实测结果。L4 完整补丁夹带的旧 L1 内容没有导入；l4-selected.patch 只保留 L4，包含原始纹理二进制。

## L4 贴图

- public/textures/l4/carpet2_Color.jpg：由 [Dirty Carpet](https://polyhaven.com/a/dirty_carpet) 派生，作者 Rohit Seervi；[Poly Haven CC0](https://polyhaven.com/license)。上游去除色彩/横纹并改冷灰，NormalGL/Roughness 沿用原图。2026-10-21 已核对原站作者与许可。
- public/textures/l4/ceiltile_{Color,NormalGL,Roughness}.jpg 和 drywall_{Color,NormalGL,Roughness}.jpg：上游声明由 Hark generate_image 生成；颜色平整、半偏移接缝处理、Sobel 法线与亮度粗糙度。没有附原始未处理图、完整 prompt、随机种子或离线处理脚本，不能声称可从生成端精确复现。包内 prompt 摘录保留于 public/textures/l4/SOURCES.md，最终像素和 hash 已归档。
- 原有 L4 纹理的作者与许可继续见 [原贴图记录](../../../public/textures/l4/SOURCES.md)。本轮未重新生成或修改附件像素。
- 近战武器和牧蛇的 Canvas 纹理由各自 Mesh 模块中的固定种子函数绘制，不依赖外部图片。

## 牧蛇设定

[Entity 75「牧蛇」](https://backrooms-wiki-cn.wikidot.com/entity-75)：原作者 Stretchsterz / avertexpert，译者 Ambersight，页面图像作者 GarbDemon；页面标注 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。2026-10-21 已核对页尾。正文引用的设定在游戏中经过玩法改编：L8 低权重、L2 偶发、吞噬后非致命返回；不是对 Wiki 所有机制的承诺。本轮没有下载或打包 Wiki 图片。

## 本地接入修正

保留现有手部、飞蛾、守望者、手臂、nguithr、L1 与据点实现；处理共享文件冲突。增加分帧预备和现有 GPU 队列、单实例几何/材质及共享纹理生命周期、静态近战合批、牧蛇私人脊线纹理释放、L4 构建任务局部 sampler、旧木板堆叠展开，以及单件修理/失焦取消。全部修改仅面向单机，联机保持冻结。
