# Level 1 据点实现与来源记录

## 文件入口

| 数据或功能 | 文件 |
|---|---|
| 五据点房间及坐标 | `src/game/content/settlementBlueprints.ts` |
| 房间类型及高度 | `src/game/content/settlementTypes.ts` |
| 地图、通路、碰撞、家具和居民 | `src/game/world/settlement.ts` |
| 合批建筑、房间陈设与材质 | `src/game/renderer/settlementMeshes.ts` |
| 七条路线、任务标题、设施需求 | `src/game/content/careers.ts` |
| 路线状态、现场记录、考核及奖励 | `src/game/engine/career.ts` |
| 对话设施与追踪栏 | `src/components/CareerPanel.tsx`、`CareerTracker.tsx` |
| 联机授权工位 | `src/game/net/session.ts` |

蓝图中的坐标以米计。房间门至少占两个地格，主通廊连通三个出口，受控门不作为其他公共房间的必经入口。不同房间高度由同一数组供渲染和玩家顶部碰撞读取；相邻高顶面用封板收口。希波克拉底公共通廊另有连续拱腹，诊疗与实验房间保留可清洁平顶。

家具的渲染与碰撞读取相同几何记录。装饰库存不包含随机物品；工作台以房间编号和团体确定服务，资格检查在引擎执行，不能只靠对话按钮绕过。私人物品、医疗样本和玩家寄存彼此分离。

## 免费资产

新增三套 ambientCG 1K JPG 材质，每套包含颜色、OpenGL 法线和粗糙度。另复用四套既有 ambientCG 材质，共覆盖吊顶、瓷砖、织物、混凝土、灰泥、金属及木材。所有外部纹理均从官方分发包取得并按 CC0 使用。

- [逐文件来源、许可和复用清单](../public/textures/settlements/SOURCES.md)
- [新下载资产 SHA-256、字节数及取得日期](../public/textures/settlements/manifest.json)
- [既有 L11 资产来源](../public/textures/L11-ASSET-SOURCES.md)
- [ambientCG 许可](https://docs.ambientcg.com/license/)

高频纹理使用世界坐标 UV。浅色医疗墙和地面使用 Tiles002；金属货架及设备使用 Metal032；Fabric061 仅用于布面颜色标识；木地板、护墙及桌面使用 WoodFloor051。材质与贴图共享，远处房间陈设和居民按距离裁剪，清理 NPC 时释放其私有几何、材质和气泡贴图。

未引入付费素材，也未下载或重新分发维基附图。既有程序藤叶、地被和旧涂层仍保留其原有来源说明。

## 设定参考

以下页面作为设定和空间设计参考。具体尺寸、房间组合、操作步骤与晋升任务为游戏改编，不能当作维基原文设定。

- [Level 1](https://backrooms-wiki-cn.wikidot.com/level-1)
- [Alpha 基地与附图](https://backrooms-wiki-cn.wikidot.com/base-alpha)
- [M.E.G.](https://backrooms-wiki.wikidot.com/the-m-e-g)
- [B.N.T.G.](https://backrooms-wiki-cn.wikidot.com/the-b-n-t-g)
- [交易保险库](https://backrooms-wiki-cn.wikidot.com/traders-vault)
- [阿丽亚娜之圈](https://backrooms-wiki-cn.wikidot.com/cercle-ariane)
- [阿尔戈斯之眼](https://backrooms-wiki-cn.wikidot.com/the-eyes-of-argos)
- [B.R.C.](https://backrooms-wiki-cn.wikidot.com/backrooms-remodeling-co)
- [现实清新剂](https://backrooms-wiki-cn.wikidot.com/object-32)
- [Jerry 信众](https://backrooms-wiki-cn.wikidot.com/followers-of-jerry)
- [Aiko Sato](https://backrooms-wiki-cn.wikidot.com/aiko-sato)

丰饶角独立页面未能读取，当前设计依据 Level 1 及阿尔戈斯中心页。Alpha 的大区方位参考平面图，当前游戏蓝图仍有网格化改编，并未逐像素复刻平面图。

## 复现验收

在 `app` 运行 `npm run dev`，打开 `/verifier/settlements.html`。使用五据点、房间、视角和模式按钮检查场景；“导出五据点对照图”将结果写入 `.check/settlements`。导出服务仅在本地 Vite 开发服务器中存在，限定固定文件名，不进入生产构建。验收页不调用新游戏或写入玩家存档。

`npm run check:settlements` 检查真实生成地图中的房间边界、公共出口、工作台通路和顶高；`check:careers` 检查 84 次任务提交、考核、恢复后的状态及奖励；`check:career-network` 使用内存直连验证房主授权、发送者身份、重复事件和部署距离，不等同于真实双机网络验收。

四轮重复进入据点已不再出现旧 NPC 几何逐轮累积。短时固定视角记录仅用于发现资源泄漏和回归，长时间移动、网络延迟、死亡读档、路线时长与剧情分支仍需后续验证。

完整方案剩余范围在 `info.md` 明确列出；本次材质填充和系统首版不代表全部剧情、专业任务及执法系统已完成。
