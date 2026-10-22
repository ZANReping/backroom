# L4 性能、L2/L3 地图与爆酸者接入（2026-10-22）

本轮开发目录为 E:/ZAN/backroom，只修改 app 和根说明。保留既有 L1、L4、牧蛇、近战、残缺之雾等更新；不更新 GitHub 副本、app-lite 或已冻结的联机系统。

## L4

- 静态办公设施按 16 米空间桶合批；微小部件和薄水平件不再重复参与实时阴影，墙、立柱、大型家具继续投影。
- 隐藏交互代理从大量小 Mesh 压成一个仅有位置属性的真实三角网格。保留原变换、userData 和结构引用；碰撞与坐下继续使用原建筑数据。代理合并后立即更新世界矩阵，以便首帧交互射线命中。
- 地毯、吊顶、墙的顶点细分降为满足静态受光所需的密度，保留世界 UV 和原烘焙属性。
- 仅外立面假窗的远景合并为不透明单层着色器；保留室内玻璃隔断、可开关门和黑窗行为。
- 模型合批仍分帧构建、完整后发布，取消任务会回收临时缓冲。

## L2/L3 原版地图

复用 HUD 小地图与 M 键大地图，共用 content/l23Map.ts；图例位于大地图，不放到小地图下方。L2 区分整洁、晦暗、肮脏、扭曲、狭窄、办公廊道；L3 区分照明、晦暗、狭窄、装配线、发电室、锅炉房和圣所。区域使用颜色及纹样，墙柱、门、栅栏和低矮管道另有图形标记。

使用现有结构碰撞矩形绘制细部，不把家具整块占地都画成实心墙。普通模式仅绘制已探索位置；开发者地图全开仍使用原开关及右键安全传送。预览 Worker 只生成数据，缓存有上限，不加载 Three.js 世界或刷新探索记录。

## 爆酸者

增量接入附件的犬腿人形、背部胼胝、休眠/苏醒/爬行/喷酸/结茧动画及配套 AI。仅加入 L3 自然生成池，并限制同一区块只保留一只。保留公共的圣所保护与遭遇记录。

喷酸造成少量直接伤害、灼烧和失明；面部护具能挡部分伤害。市政自来水、杏仁水以及滋水枪中的清水/杏仁水可以洗眼。低血量结茧后普通攻击无效，重击能破茧，掉落酸性胼胝，可装入滋水枪成为三份酸液。具体数值沿用附件。

模型采用两套确定性 CPU 模板、五档茧壳，分帧准备；每个实例拥有独立关节、几何、材质和实例矩阵，两张程序化皮肤/硬痂贴图共享。进入 L3 时预热本体和茧壳程序。酸液飞滴和地面积液实例化，离层清理；流式窗口平移会同步坐标。酸液模糊复用游戏后处理，染色遮罩在 WebGL 内实现，不模糊 HUD。

## 残缺者腿部碰撞

renderer/watchRender.ts 从每帧实际姿态的八条腿骨骼发布 24 段胶囊记录，core/mangledCollision.ts 以实体相对坐标检查玩家圆柱。碰撞跟随朝向、成长和抬腿高度，腿间空隙可走。移动时沿用通用嵌入恢复，腿进入玩家位置时向最近可占据位置挤出；死亡或卸载后不再阻挡。腿没有新增可站立平台。

## 来源与授权记录

- 用户提供附件：C:/Users/ZANRe/Downloads/burster-remake.zip。
- SHA-256：77328e7cefa2b925439935bd27f0f405345052c4fe16997472f0f6e8a6a5d740。
- 导入文件：renderer/bursterMesh.ts、bursterAnim.ts、bursterRender.ts、engine/bursterAI.ts 与 scripts/check-burster.ts，并逐项接入现有引擎/UI；未覆盖附件中的整份旧版引擎。
- 本地调整：分帧模板、独立克隆与释放、跨层/原点生命周期、公共圣所和图鉴流程、游戏画面专用失明效果。贴图来自附件内的确定性 Canvas 生成代码，没有下载新的外部位图或使用 Wiki 照片。
- 附件未提供独立模型作者署名或代码许可证声明，本记录不擅自将其标作开源模型。
- 设定/图鉴说明依据 [Entity 11 – 爆酸者](https://backrooms-wiki-cn.wikidot.com/entity-11)，页面署名原作者为 Kekcroc（Fandom），正文标示 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。中文页未单独标明译者；本轮核对于 2026-10-22。该设定文字授权与附件代码/模型授权分别记录，数值和动画时序属于游戏改编。

## 复现与验收

- npm run build
- npm run check:burster
- npm run check:l23-map
- npm run check:mangled-legs
- npm run check:l4-burster-integration
- npm run check:l4 / check:l4-details / check:l4-collisions / check:l4-batch-job
- npm run check:l4-region-exits / check:entity-forms / check:entity-preparation / check:seating
- npm run verify:l4-burster-maps（真实光影）；后附 -- --classic 可复核经典模式。
- npm run verify:l4-performance -- --label=repeat-realistic --all-scenes

脚本使用独立内存存档、随机空闲端口、专属 Chrome profile、--headless=new 和原生 GPU；失败也会关闭本任务进程。截图、同场景五轮数据、检查日志与环境细节见 [验收报告](reports/l4-burster-maps-20261021/REPORT.md)。测试目录名称沿用本轮开始日期 20261021，完成日期为 2026-10-22。
