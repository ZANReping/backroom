# 快捷栏、箱沿碰撞与 L1 阴影边缘

本轮只修改 Three.js 游戏与项目说明，保留原物品、建筑生成和存档。联机继续封闭。

## 快捷栏

移除七格快捷栏内部的横向滚动容器，为选中格上移、顶部强调条和末尾一像素的外扩留出空间。避免 `overflow-x: auto` 同时裁切另一轴，以及沉浸式界面最后一格触发滚动条。窄屏使用较小间距和格宽，保留七格及原点击、触摸、快捷键逻辑。

## 箱沿与通用恢复

原因是箱顶按中心点提供支撑，而箱侧按玩家半径阻挡。慢速走出箱沿或斜向滑落时，中心已离开顶面，身体仍压着箱子；重力使身体先落入箱侧，后续水平移动被阻挡。完整圆形碰撞之外的旧方形角点还会扩大部分模型的阻挡范围。

- 箱顶、叠箱及其它可站模型统一用圆形身体轮廓与实际碰撞多边形判断支撑，跨空间索引边界也查询邻近模型。
- 保留地形和楼梯探测；模型使用已有完整圆形检测，取消位于圆外的四个角点对模型的重复阻挡。
- 增加通用重叠恢复：已嵌入模型或墙体时，从附近碰撞体边界寻找最短有效平移，最大两米，验证整个身体后才应用。不改变高度，不把深坑、虚空或普通不可落脚位置当作可自动救出的嵌入。
- 正常移动阻塞及重力更新后均可触发；静止时因模型碰撞稍晚注册产生的重叠也能恢复。坐下、攀爬、乘梯与穿墙保留各自控制。

## L1 阴影

烘焙修订升至 **17**，建筑生成版本仍为 6。旧 IndexedDB 光照缓存自动失效，玩家存档不迁移。

- 高档完整两米地面图块由 10×10 提高到 13×13 采样；图集仍为 512²，保留独立图块与线性过滤外扩。
- 对灯管实际长度和直径、灯盘两个轴采样；半影或门口透光边缘最多增加到十六条射线。地面同时积分接收像素覆盖范围，减轻低密度采样产生的矩形锯齿。
- 遮挡查询使用只返回可见性的 BVH 路径，避免额外分配命中点和法线。间接光仍保留最近命中信息与连续表面插值。
- 实体内部地面采样继续全黑，不跨墙借用亮处；保留哥特拱顶正面遮挡规则。没有新增实时灯光、阴影灯或后处理。
- 低档仍取灯具中心，不增加采样成本。高档冷生成的 CPU 成本增加，展示种子已随项目保存离线资源。

## 复现

在 `app` 中运行：

```powershell
npm run check:player-recovery
npm run check:l1-interactions
npm run check:l1-shadow-edges
npm run check:l1-bake -- --high
npm run check:l1-offline
npm run verify:hotbar-collision-shadow -- --before
npm run verify:hotbar-collision-shadow
npm run verify:hotbar-collision-shadow -- --classic
npm run build
```

`--before` 读取本轮修改前保存在 `.cache/hotbar-collision-shadow` 的源码和光照快照；这些本地基线需在修改前保存，不能由新版资源反推。`--interactions-only` 可单独复查快捷栏、触摸和箱沿，`--benchmark-only` 仅测固定光照视角。浏览器验证实际 App、独立存档和独立无头 Chrome，退出时清理所属进程与 profile。

离线资源重建命令：

```powershell
npm run prebake:l1-smooth -- --out reports/hotbar-collision-shadow/offline
```

全部区块成功后才发布；`-- --reuse` 仅复用同修订及建筑指纹一致的文件。具体截图、取景、性能和未验证范围见 [验收记录](reports/hotbar-collision-shadow/README.md)。
