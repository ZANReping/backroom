# Bumper-Crop 灯光思路参考

本项目只读检索了 [Bumper-Crop](https://github.com/obtusecat12/Bumper-Crop) 固定提交 [`842316fb860fa39a7211910c35bd3097ebba083c`](https://github.com/obtusecat12/Bumper-Crop/tree/842316fb860fa39a7211910c35bd3097ebba083c)。README 未单独指定整个项目的发布许可，因此没有移植其源码、贴图或完整渲染链；以下仅记录实现思路参考，不承诺逐像素效果一致。

参考文件：

- [`dist/level0-world.js`](https://github.com/obtusecat12/Bumper-Crop/blob/842316fb860fa39a7211910c35bd3097ebba083c/dist/level0-world.js)：4 个 RectAreaLight 与 2 个缓存 SpotLight 阴影的组织方式。
- [`dist/level0-lighting94.js`](https://github.com/obtusecat12/Bumper-Crop/blob/842316fb860fa39a7211910c35bd3097ebba083c/dist/level0-lighting94.js)：深度 AO 与仅作用于亮部的局部 halation 思路。
- [`docs/v15-lighting.md`](https://github.com/obtusecat12/Bumper-Crop/blob/842316fb860fa39a7211910c35bd3097ebba083c/docs/v15-lighting.md)：缓存与失效管理思路。

本项目的独立适配使用 L0 建筑静态灯盘的 4 个面积采样，复用整高墙的水平可见性缓存；矮墙与门楣按实际高度参与 3D 遮挡。继续沿用现有灯池与阴影预算，没有新增实时 AreaLight 或 GI。

`photoPass` 使用低分辨率 AO 的 4 邻点深度加权重建，减少前景暗边扩散，法线差分选择较短邻边。2026-10-07：L0 恢复受设置开关控制的 HDR 泛光通道，取消此前对该层的排除和重复局部灯晕；只有四根实际灯管是发光源，吊顶与金属格栅不发光。熄灯灯片不发光；点亮灯片使用 CC0 灰泥扫描处理成的低对比磨砂颜色/法线/粗糙度，真实模式灯管 emissiveIntensity 为 3.8，经典为 1.3，其它层保留原泛光规则。

共享失焦使用连续 5×5 高斯采样，避免稀疏采样在灯边产生重影。验证入口为 `photo`、`anchors`、`details`、`focus`，结果与限制见 [REPORT](reports/l0-remake/REPORT.md) 和 [VISUAL-REVIEW](reports/l0-remake/VISUAL-REVIEW.md)。最终 RTX 4060 Laptop、1080p 五轮复测中，Level 0 八区域及六个普通种子视角通过稳态目标；全部注册场景为 27/30 通过，Level 4、Level 5 和 Alpha 101 存在超标轮次。冷启动峰值单独记录，不能据稳态结果宣称全程无卡顿。

参考项目的 `level0-world.js` 使用缓存渲染计划、按几何/材质实例合批，将加载区块与实际建筑分开。本项目保留现有按材质合并与区块缓存，新增地板按行直接构建缓冲及灯/墙空间索引；普通隔墙按 12 米世界分区生成，再裁到 32 米流式区块。当前网络无法补取 Bumper-Crop 的 `level0-layout.js`，因此未读取或复制该文件。当前灯光取消矩形/梯形硬裁切，使用 Lambert 余弦发射、入射/距离衰减、四点面积遮挡和空间索引。它是静态近似受光，不是实时全局光照。最终测量及未达标项统一见验证报告。


2026-10-07 性能迭代继续参考上述固定提交的缓存失效、按材质合批、有限工作队列思路；新增墙体合并边界的邻近矩形预筛选、每次构建的位置材质采样缓存、流式移动后低照度场采样复用。远处地图预览使用独立 worker、最多 256 条原始区块缓存以及过期请求取消，不创建场景对象。普通迷宫先生成连通错位网格，再用端点空间裁切排除可直线贯穿的布局。未移植项目代码或未明确许可的资产。本轮指标见 iteration-16 报告，以上旧性能结果仅作为历史记录。


当前 Level 0 建筑说明：迷宫采用 8×8 错位单元的连通布局，并检查任意连接两侧边界的直线；开阔区才沿用世界分区折墙。灯具无黑色罩壳，仅由四根发光灯管与薄金属格栅组成。开发者工具只使用原版地图的开发者开关和右键安全传送，不存在另一个开发者地图。红室仅在原地图中进行物理封口，不使用个人世界或五段传送循环。