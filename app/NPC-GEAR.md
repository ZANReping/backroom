# NPC 配饰与人物贴合

2026-10-17。帽子、饰品、眼镜、耳机、口罩、围裙、背带、腰包、制服标记及手持工具统一为人物已有的复古写实风格。角色职业特征、对话、掉落与活动范围保持既有行为。

## 实现

`renderer/characterModel.ts` 统一游戏场景和肖像工厂。四个专属人物也通过此入口装配配饰，避免旧方块附件和新版模型重复出现。静态 NPC、随机居民、BRC 工人及杰瑞信徒共用 `npcGearPlan.ts` 中的确定性配置；Tiny 的骨矛通过实体模型自己的手腕接入。

| 部位 | 贴合方式 |
|---|---|
| 帽子、镜框、耳机、口罩 | 使用当前头型的眼高、下巴、头宽及骨骼绑定坐标。帽下头发收进帽冠，保留鬓角与长发。镜腿、耳垫、口罩耳带分别定位。 |
| 围裙、背带、胸牌、口袋 | 在人物绑定姿态的实际衣服三角面上采样，并插值继承衣服的骨骼权重。衣物层保留毫米级间距。 |
| 肩章、腰带、腰包 | 按实际肩面高度、身体横截面宽度定位；跟随肩部和髋骨。 |
| 手持物 | 绑定手腕，调整握持点并弯曲手指。没有再附在上臂上摆动。 |
| 乐手吉他 | 沿用背负／演奏切换，增加双臂 IK，让按弦和拨弦握持点跟随琴身；非演奏时恢复正常动作。 |
| 手套、靴子、长袍 | 复用人物原有解剖网格；长袍前摆与围裙随腿部权重弯折，避免重复外壳。 |

新增模块：`npcGearFit.ts`（绑定姿态与衣面采样）、`npcGearGeometry.ts`（UV、蒙皮与合并）、`npcGearModels.ts`（配饰形状）、`npcGearPose.ts`（吉他双臂）、`npcBoneSpear.ts`（Tiny 骨矛）。

不透明配饰合并成一个额外蒙皮批次，共享人物骨骼和 256² 图集；独立运动的吉他另一个批次。几何和材质归模型实例所有，图集共享。销毁模型时骨架只释放一次，不会破坏其他 NPC。材质继续使用人物的 Lambert、平面法线与像素纹理，并兼容现有 Level 0 环境着色及 Level 1 光照探针。来源与生成规则见 [图集许可](public/textures/npc-gear/SOURCES.md)。

## 验证与复现

在 `app` 运行：

```powershell
npm run generate:npc-gear
npm run check:npc-gear
npm run check:humanoid-motion
npm run check:retro-avatar
npx esbuild scripts/check-npc-material-keys.ts --bundle --platform=node --format=esm --outfile=.cache/check-npc-material-keys.mjs
node .cache/check-npc-material-keys.mjs
npm run build
npm run verify:npc-gear -- review
```

最后一条创建独占端口、独占临时 profile 的 Chrome `--headless=new`，保存到 `reports/npc-gear/review/`，结束时关闭本脚本的浏览器与服务器。要求本机 Chrome 和项目依赖已安装。

覆盖 91 个注册配置、12 个 BRC 工人、3 个杰瑞信徒和 8 个随机居民，共 114 个配置；视觉目录额外使用实际 Tiny 实体模型。检查 UV、数值、蒙皮、材料、资源释放以及站立、走动、转头、坐姿、工作和演奏。单个人形最高 3,296 三角面，通常只增加一个配饰批次。

实际游戏检查使用种子 `20261006`，1920×1080、像素比 1，Alpha 基地经典／真实模式和 NPC 肖像。当前餐馆蓝图未放置乔伊，因此演奏测试仅在隔离的引擎场景中加入其真实注册定义，仍由游戏 NPC 渲染器驱动；不会修改玩家存档或餐馆布局。

结果、截图、性能边界和前后对照见 [验收记录](reports/npc-gear/README.md) 与 [对照画廊](reports/npc-gear/comparison.html)。布料采用骨骼变形而非实时布料模拟；未来新增极端动作或体型仍应重新检查接触处。
