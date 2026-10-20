# 笑魇优化包导入验收 · 2026-10-07

导入用户提供的 `backroom-smiler.zip`：普通、幽影、饥饿、犬形、巨型五种笑魇的程序化模型、黑火与面部动画、合成音效、变体资料及专属 AI。保留 `smiler` 实体类型、既有地图生成入口、寻路/碰撞和死亡结算。未修改联机，也未修改 app-lite 或 Godot。

## 合并与接入修复

13 个包内文件按补丁原文逐段匹配合并。`renderer.ts`、`special.ts` 包外已有修改均保留。源包说明、补丁、五张参考预览、初始比对与整合后 SHA256 见 [归档](../../assets/smiler-import/IMPORT.md)。未引入外部模型或贴图下载。

- AI 感知缓存和待生成犬群按引擎实例、地图分别持有，换层不会带入旧犬群。
- 玩家速度、记忆声源使用世界坐标，流式窗口移动不再误判奔跑或移动声源。
- 初始化变体时保留当前生命比例，避免第一次受击被初始化覆盖。
- 犬群在对应楼层检查落点；诱饵与近战检查楼层和视线，避免隔墙命中/踩灭。
- 被吞食/踩灭的地面物品登记到现有 `taken` 记录，避免区块重拼后复原；同帧删除诱饵缓存。
- 补充两项检查脚本及独立存储的浏览器验证入口。预览页补空 favicon，避免无关 404。

## 自动检查

`npm run check:smilers`：包内 22 项行为检查通过，涵盖趋光、关灯对峙、奔跑扑击、诱饵、各变体特征、重伤撤退。

`npm run check:smiler-integration`：接入检查通过，涵盖诱饵持久消耗、墙体/楼层保护、窗口平移、声源记忆、地图/引擎缓存隔离、受击初始化、犬群楼层、有限顶点和动画矩阵、实例资源所有权。

模型实测如下。网格数是单遍 mesh 数，不包含阴影及后处理的重复绘制；没有把它当作全场景绘制调用。

| 变体 | 网格数 | 三角面 |
| --- | ---: | ---: |
| 普通 | 14 | 1,014 |
| 幽影 | 10 | 930 |
| 饥饿 | 14 | 934 |
| 犬形 | 21 | 874 |
| 巨型 | 13 | 1,576 |

`npm run build` 通过（TypeScript + Vite）。第一次沙箱构建被 Windows `realpath` 权限限制阻止，在正常本机权限下复跑通过。既有字体路径、Browserslist 数据、PostCSS `from`、l11Materials 混合导入及大 chunk 警告仍存在。

额外运行的旧 `verifier/l1-smilers.ts` 在“both transition axes and maintenance orientations covered”失败：当前已重制为五区的小径布局，旧维护区采样没有覆盖它要求的四类组合。该脚本及 Level 1 生成没有被本次导入修改，此项明确不计为通过；不要用它代替当前 Level 1 的专用验收。

## 实际渲染检查

使用独立 Chrome headless 配置、RTX 4060 Laptop GPU，在生产 Three.js 渲染器中摆放实体，冻结 AI 姿态并启用手电；与正式游戏共用模型缓存、动画、材质、阴影和回收。验证器使用独立存储，不覆盖玩家存档。

- Level 2：经典和真实两种模式各检查五种变体、首次 AI 初始化后的模型替换、三轮创建/移除，均通过，运行和着色器错误为零。
- Level 3：补查五种变体与三轮回收，通过。巨型在本层有自然生成权重；Level 2 的巨型仅是测试强制摆放。
- 三轮移除后资源保持一致：Level 2 经典 `943 geometry / 135 texture / 32 program`，真实 `973 / 160 / 47`；Level 3 真实 `541 / 53 / 60`。
- 原包预览三种视图（lineup / grin / dark）与对应模型造型核对，保持原包设计。

数据：[Level 2 经典](game-classic.json)、[Level 2 真实](game-realistic.json)、[Level 3 真实](game-realistic-level3.json)。截图包括 [原型阵列](prototype-lineup.png)、[咧嘴变化](prototype-grin.png)、[暗处手电](prototype-dark.png)、[游戏经典](game-classic-common.png)、[游戏真实](game-realistic-common.png)、[Level 3 巨型](game-realistic-level3-great.png)；本目录另有各变体截图，共 18 张。

## 已知范围与限制

这是导入和兼容检查，未做完整人工追逐游玩、音效听感调音、Android 真机或五轮性能基线对照。JSON 中帧间隔包含验证器调度，不能宣称为正式帧率达标结论。保持原包局部转向寻路，不增加 A*。

原包巨型的 1.65 倍身形在低梁/密集管线处仍会与顶端结构穿插，截图已保留，尚未做按净高校准的俯身姿态。黑火顶点位移继续使用原包的普通深度阴影材质，阴影轮廓没有同步位移。包内作者和独立再分发许可没有明确声明，来源记录没有把“用户提供”标成开源许可。

## 复现

在 `app` 下执行：

```powershell
npm run check:smilers
npm run check:smiler-integration
npm run build
$env:L0_VERIFY = '1'
npm run dev -- --host 127.0.0.1 --port 3007
```

在独立 QA Chrome 中打开本地 `proto-smiler.html`，启用远程调试端口 `9238`，随后另开终端执行：

```powershell
node scripts/verify-smiler-import.mjs proto
node scripts/verify-smiler-import.mjs game classic
node scripts/verify-smiler-import.mjs game realistic
$env:SMILER_QA_LEVEL = '3'
node scripts/verify-smiler-import.mjs game realistic
```

可用 `SMILER_QA_URL` 和 `SMILER_QA_CDP` 改测试服务/调试端口。勿将日常浏览器配置目录用于自动化测试。
