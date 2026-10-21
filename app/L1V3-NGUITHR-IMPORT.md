# L1 v3 与 Nguithr 重制接入

2026-10-20，接入基线 `d41dafc`。实际修改位于当前项目 `app`；保留此前分阶段加载、17 版柔化阴影、物品预热、人物和界面修复。

## 来源

- 用户提供 `backroom-l1v3.zip`，SHA-256：`E70A75C4F831DF391F216648D8E006C6D64B3A3CB5475C64328CBD91CBBB2FEE`。
- 用户提供 `nguithr-remake.zip`，SHA-256：`802A0B90D69D860637E2E2B54113BE0BC45FA9A15126B1E4181AA6825936C9D5`。
- [原包说明与资产记录](assets/sources/l1v3-nguithr/README.md)。L1 底层复用扫描的作者及 CC0 许可继续见 [纹理来源](public/textures/l1/SOURCES.md)。

## L1

天鹰段增加 common、round、room、water、bright、clean、dry、dim、dark 九种外观；保留原混凝土底图、法线与烘焙，以附件纹理叠加低频色调和污渍。材质按真实大厅选取，跨区块保持一致；同一烘焙网格包含多个大厅时只按实际表面拆分索引，保留原顶点与 lightmap UV。

接入衔尾段施工材质及花园地被混合，新增垂藤、蕨类、灌木、草丛。附件的新植被原先只接在旧建筑工厂，本次另接到游戏当前使用的烘焙路径；三档 LOD 共用图集，不重新计算或重复生成建筑。

接入折叠桌、塑料椅、波纹板、百叶罩、灭火器、油漆桶和地滑牌模型，以及各势力门牌、服务牌、公告栏、Alpha 导视等。新卷帘门牌背板合入门框，维持最多四个网格批次；原通行尺寸和坐下逻辑保留。

经典和真实模式均使用新色彩、植被和道具。显式登记附加 shader 纹理，使它们随场景完成预上传，避免第一次入镜才上传。

## Nguithr

详见 [当前 Nguithr 说明](NGUITHR-REMAKE.md)。接入 58 骨骼、16 附肢蒙皮模型、可破坏的网囊、切囊／垂降／进食／回巢等程序化动画、两阶段镇静、挣脱和镇静腺物品。更新 L1／L2／L3／L5／L8 对应生成规则及图鉴内容。

接入时补齐的适配：

- 静态模型模板共享，每个实例独立持有几何、材质、骨架；四张程序贴图共享，单个实例回收不会销毁其它实例。
- 几何分步准备；在相关层级进入阶段预热模型、巢和真实 GPU 蒙皮程序。实际实体在完整巢和模型准备好后才显示。
- 个体缩放直接调整现有骨架，不在首帧重新建模。
- 透明丝网、囊和挂丝不按整片透明面投影，消除矩形黑影。
- 无限窗口平移同步运动目标，巢中心保持世界坐标；换层同时复位镇静状态和实际音频滤波。
- 天花板运动检查墙和实体结构阻挡；遮挡玩家不触发首囊，喷液猎物需要视线。
- 验收脚本改为 Windows／Linux 可选择 Chrome 的独立无头原生 GPU 流程，不默认启用 CPU 蒙皮或 SwiftShader。

## 兼容

L1 建筑生成版本仍为 6，最终烘焙修订仍为 17。108 个现有离线烘焙的建筑指纹和最终采样结果均通过回归，无需废弃已有烘焙。主存档仍为 v1，镇静及巢状态延续原包的局内内存方案；背包和既有物品 ID 不改。没有新增 npm 依赖或变更依赖版本。本轮按单人游戏验收。

## 复现

在 `app` 执行：

```powershell
npm run build
npm run check:l1v3-nguithr
npm run check:nguithr
npm run check:nguithr-anim
npm run check:l1-progressive
npm run check:l1-offline
npm run check:l1-placement-fixes
npm run verify:l1v3-nguithr -- --seed=20261006 --label=review-realistic
npm run verify:l1v3-nguithr -- --seed=20261006 --classic --label=review-classic
```

脚本创建并清理自己的 Vite 端口、CDP 端口和浏览器目录，不接管用户的 3000 服务或日常浏览器。可传 `--entity-only`、`--scenes-only` 或 `--scenes=spawn,parking-props,garden` 缩小检查范围。

原型单独检查：`node scripts/verify-nguithr.mjs under-real nest-real anim-descend-mid`，或手动打开 `proto-nguithr.html?mode=under&real=1`；动画用 `?anim=descend&t=3.8&real=1`。

[本轮截图、数据与验收范围](reports/l1v3-nguithr-20261020/README.md)。机位、世界位置、朝向、画质及每轮资源数保存在各 `result.json`；报告中的进入耗时不包括应用启动和标题页停留。
