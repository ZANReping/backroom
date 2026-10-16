# Alpha 光照图与细节来源

本目录的 PNG/坐标/manifest 由项目脚本 `scripts/bake-alpha.ts` 从项目自己的建筑、家具、灯具定义离线生成，不包含参考照片像素，也没有从照片截取阴影或背景。

新增转椅脚轮、机柜五金、插座、排风软管、灯具终端、门框及纸张为项目参数化几何；告示与屏幕图集由已有 Canvas 绘制代码生成。没有引入第三方模型、AI 图像或新的授权收费资产。

2026-10-16 修正的空心杯、把手、水槽内壁、排水口和液面也由项目参数化代码生成（`alphaVessels.ts`、`alphaVesselMeshes.ts`）。液体起伏由着色器计算，复用已有环境与灯具；未新增图片资产。门框收口、壁挂位置和水槽挖槽已纳入本次重新烘焙。

表面继续使用仓库已有的开放材质：ambientCG 的 Wood051、Plaster004、Terrazzo001、Metal012、Cardboard004、Concrete034、Rock035，以及 `textures/settlements` 中原有的布料材质。Alpha 各文件、下载 URL、哈希、许可保留在 [Alpha 来源清单](../../textures/alpha/SOURCES.md)，布料记录见 [据点来源清单](../../textures/settlements/SOURCES.md)。

ambientCG 作者/提供者：Lennart Demes / ambientCG。官方 [署名信息](https://docs.ambientcg.com/legal/)；许可为 [Creative Commons CC0 1.0 Universal](https://docs.ambientcg.com/license/)。本轮通过材质代码调整世界尺度、去除过强橙色、提高地板粗糙度和绘制抗锯齿板缝，源 JPG 未修改。

`app/reference/Alpha` 中用户提供的 17 张图片仅作为比例、家具类型、室内配色和构图参考。未将其声明为 CC0，也未加入游戏发布资源。验收对照页面在本地引用原参考文件，不改变其作者与许可归属。

生成与使用方法见 `app/ALPHA-REFINEMENT.md`。固定几何/灯位改动后必须重新烘焙并执行 `check:alpha-bake`；提交时保留 PNG、坐标与 manifest 为匹配的一组。
