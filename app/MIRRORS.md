# 镜面反射与表面质感（2026-10-27）

已在原项目接入真实场景的平面反射，覆盖前厅玄关镜及镜柜、Level 0.2 洗手台、商人之家卫生间、通用镜子与镜面出口、L11 黑色镜面玻璃及镜中人前后碎镜。保留现有位置、碰撞、交互与存档。

按后续反馈降低镜面清晰感：共用 ambientCG Smear002 的轻度擦拭/粗糙度纹理，加入亚像素表面起伏、紧凑柔化和很弱的边缘积灰。纹理固定在镜面 UV 上，经典与真实光影均生效，HUD 保持原样。来源为 CC0，不使用背景照片代替反射。

反射中使用当前玩家的完整复古人物形象、服装和已有装备外观，随位置、朝向、步伐和蹲姿更新；坐姿复用现有骨骼姿态。第一人称手臂在捕获期间隐藏，人物完整身体只在捕获时显示。第一人称武器及物品的精细握持/攻击动作仍由原视角模型负责，当前反射人物不复制其全部动作。

桌面中/高档最多保留两种平面的缓冲，低档或窄屏/触控最多一种；每主帧最多新增一次场景捕获。分辨率随贴图质量为 256/512/1024，静止时降低刷新率，镀膜窗最高 15 Hz；同平面镜片共用画面。捕获相机按镜面开口裁剪，复用已有阴影，复原渲染目标、视口、XR 与遮挡状态。

L11 原有不透明玻璃保持合批，仅近距离 LOD 增加可见反射覆层，远景与重复 LOD 不创建镜面对象。超过预算的镜面窗沿用原有材质；不计算镜中镜及未加载世界。设置中的“反射强度”降到 0 后关闭捕获，并回收缓冲。

复现命令：

```powershell
cd E:\ZAN\backroom\app
npm run generate:mirror-surface
npm run check:mirrors
npm run verify:mirrors -- --label=mirror-realistic
npm run verify:mirrors -- --classic --label=mirror-classic
npm run build
```

贴图原图、许可与哈希见 [来源记录](assets/mirror-surface/SOURCES.md)，处理脚本为 [gen-mirror-surface.mjs](scripts/gen-mirror-surface.mjs)。截图、五轮帧时间及资源口径见 [验收报告](reports/mirror-reflections-20261027/README.md)。
