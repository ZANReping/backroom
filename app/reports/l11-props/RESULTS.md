# Level 11 装饰物细化验收

日期：2026-10-13。范围为 `app` 单人 Level 11 的道具模型、UV、表面与摆放。既有城市规划、建筑、出口和搜刮 ID 保持原有版本；装饰缓存单独使用版本 3。

## 已完成的内容

- 100 种注册装饰原型共 1953 个建模零件，使用以米为单位的 UV；木纹沿板材长轴，圆柱、轮胎与圆环按周长展开。
- 家具木材、浅色施工原木和织物分别采用 ambientCG 的 Wood051、Wood092、Fabric061，包含颜色、OpenGL 法线与粗糙度。城市运行时共 15 套 CC0 PBR 表面。无新增噪点纹理。
- 增补柜体、售货机货架、电话按键、购物车网篮、自行车支撑与车轮、托盘、风扇、软垫和玻璃面；修正环形部件的轴向以及救生圈贴带穿插。
- 椅子朝桌面，墙边家具朝室内；道路两侧设施朝道路、车辆按车道取向，滨水座椅朝运河。家具避让可搜刮柜体，井盖和雨水篦子按路面高度安装。
- 保留 32 张完整的 2000 年代风格标牌，以及材质复用、区块合批和低画质路径。

资产来源与加工记录：[L11-ASSET-SOURCES.md](../../public/textures/L11-ASSET-SOURCES.md)。实现说明：[L11-PROPS.md](../../L11-PROPS.md)。

## 静态与生成检查

以下命令在 `app` 下运行并通过：

```powershell
npm run build
npm run check:l11
npm run check:l11-surfaces
npm run check:l11-meshes
npm run check:l11-dressing
npm run check:l11-props
```

构建保留既有的大包体积提示，无 TypeScript 或构建错误。`check:l11` 包括生成、迁移、任务和晋升检查。

| 检查 | 结果 |
|---|---|
| 原型与注册 | 30 种建筑、100 种装饰、32 张标牌 |
| UV 与变换 | 32 组三轴旋转角点、20 组木纹面和原木 UV 方向 |
| 碰撞对齐 | 64,228 个顶点与共享碰撞轮廓检查 |
| 朝向与摆放 | 3 个种子，含负坐标及宏区边界，11,221 处有方向语义的摆放 |
| 路面设施 | 292 处井盖 / 篦子的露出与嵌入高度检查 |
| 生成覆盖 | 两种种子共 2052 个区块，100 种装饰均能生成 |

原始数据：[prop-check.json](prop-check.json)、[mesh-check.json](mesh-check.json)、[dressing-check.json](dressing-check.json)。

## 实际游戏验证

使用脚本启动独立 Vite 端口、独立 CDP 端口和独立浏览器配置目录。检查实际 Chrome 参数含 `--headless=new`，使用隔离的内存存储，不读取或覆盖玩家存档。固定种子 20261006、1920×1080；每个道具截图记录实际实例 ID、相机位置、朝向、材质及玩家碰撞结果。

真实光照完整验收通过：

```powershell
npm run verify:l11 -- --props
```

覆盖 27 个实际生成道具近景、室内 / 混合城区视图、15 套 PBR 三通道加载、标牌画质切换、Worker 一致性、建筑入口、楼梯、地铁坡道与平台、桥梁和水岸、0 / 5 / 6 盘磁带的档案馆入口、Level 9 / 10 通路、搜刮后存读档、旧 L11 / Beta 迁移、暂停任务和晋升，以及跨宏区正常步行和三轮卸载重载。最终控制台 / 运行错误为 0。

经典光照和低画质各复核相同的 9 个道具近景及 2 个城区视图，也均通过，错误数为 0；15 套 PBR 表面三通道和 32 张标牌画质切换正常。经典光照保留原有较暗的室内表现；低画质关闭阴影及 bloom、场景灯上限 8、细节距离比例 0.55，室内日光强度为 0，室外约 3.1，没有无阴影日光透过屋顶的问题。

```powershell
npm run verify:l11 -- --props --props-only --classic --prop-filter=bus_shelter,manhole,storm_drain,pallet_stack,life_ring,sofa,bed,office_desk,exhibit_case
npm run verify:l11 -- --props --props-only --low --prop-filter=bus_shelter,manhole,storm_drain,pallet_stack,life_ring,sofa,bed,office_desk,exhibit_case
```

运行数据：[真实光照](realistic-runtime.json)、[经典光照](classic-props-runtime.json)、[低画质](low-props-runtime.json)。完整游戏功能、跨区移动和资源循环在真实光照档执行；经典 / 低画质是定点视觉与材质复核，不重复声称已覆盖全部路线。

## 性能与资源

实测浏览器 Chrome 154.0.8037.98；GPU 为 NVIDIA GeForce RTX 4060 Laptop GPU，ANGLE Direct3D11。真实光照：纹理质量 2、动态阴影开启、2 个阴影灯、16 个场景灯、bloom 开启、细节距离比例 1。

| 场景 | 帧时间中位数 | P95 | 最大值 | CPU P95 | GPU P95 |
|---|---:|---:|---:|---:|---:|
| 入城稳态 | 8.2 ms | 12.4 ms | 16.3 ms | 10.7 ms | 11.8 ms |
| 跨宏区步行 | 12.4 ms | 20.9 ms | 54.3 ms | 15.2 ms | 14.4 ms |

步行样本为 2002 帧，其中 348 帧超过 16.67 ms、11 帧超过 33.33 ms。本次稳态达到 60 FPS 目标，移动阶段仍有长帧，不能声称全程稳定 60 FPS。统计为当前机器、固定路线和无头 Chrome 下的结果。

绘制调用为采样结束帧的总渲染调用数（含阴影和后处理），不是整个区间平均值：入城 814 次 / 454,148 三角形；移动末帧 413 次 / 184,200 三角形。Three 只提供几何与纹理数量，这里不将其误作显存字节数。

| 回到相同入口后的循环 | 场景 CPU 几何 | 场景已上传 GPU 几何 | GPU 几何总数 | 场景外 GPU 几何 | 纹理 | 建筑 / 引用 |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 1128 | 726 | 743 | 17 | 77 | 7 / 7 |
| 2 | 1128 | 713 | 730 | 17 | 77 | 7 / 7 |
| 3 | 1128 | 713 | 730 | 17 | 77 | 7 / 7 |

三轮纹理归属根节点均为 33，延迟编译、几何释放和纹理释放队列均为空。相同内饰受到可见性裁剪时，GPU 上传数量会相差 13；场景 CPU 模型和场景外 GPU 数量没有增长。验证器现分别检查这两项，避免将延迟上传误判为泄漏，同时仍能识别未释放几何的增长。诊断证据保存在 `iteration-2/realistic-resources-runtime.json`。

## 视觉检查与迭代

对照 `reference/L11/11scenes.jpg` 的普通城市设施和 `11unfinishedinterior.jpg` 的施工空间，保留克制的涂装、木材、混凝土和玻璃组合；没有向环境贴入摄影噪点。模型仍采用游戏用模块化几何，并非照片级扫描模型。

- 第一轮：修正过暗原木、白色轮胎、沙发与搜刮柜体重叠、自行车货架缺少支撑；材料候选 Wood055 因深色刮痕未采用。
- 第二轮：修正井盖被沥青面覆盖、井盖压住中线和救生圈贴带穿插；定位内饰延迟上传导致的资源计数误报。
- 最终真实光照：检查全部 27 张近景，确认部件轴向、木纹、织物、玻璃、地面嵌入和主要朝向。前两轮证据分别保存在 `iteration-1` 和 `iteration-2`。

```powershell
node scripts/l11-prop-contact-sheet.mjs
```

总览：[街道与车辆](realistic-contact-street.jpg) · [商业与施工](realistic-contact-service.jpg) · [家具与滨水](realistic-contact-furniture.jpg)。总览仅缩放、排列实际截图，未修改游戏图像内容。

本轮六次 QA 运行的浏览器、Vite 服务和临时配置目录均已清理。只读所有权审计通过，没有遗留本聊天的测试进程或监听端口，详见 [cleanup-check.json](cleanup-check.json)。执行命令：

```powershell
& reports/l11-props/check-cleanup.ps1
```
