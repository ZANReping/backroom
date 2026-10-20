# L1 箱顶、手部切换、地图和尸体闭眼验收

日期：2026-10-19。实现与复现命令见 [说明](../../L1-INTERACTIONS.md)，原始结果摘要见 [summary.json](summary.json)。本轮保留之前的 C、D 更新，没有更改生成版本、存档格式或烘焙修订。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| `check:l1-interactions` | 147 项通过：箱体模型／旋转／支撑、合批覆盖回归、流式原点缓存刷新、切换状态与地图建筑数据 |
| `check:object70` | 40 项通过，包含尸体闭眼、活体默认睁眼及原有模型／容器回归 |
| `check:l1-props` | 通过 |
| `check:seating` | 310 项通过 |
| `check:l1-offline` | 通过，修订 14，99 个原有离线区块保持有效 |
| `npm run build` | TypeScript／Vite 生产构建通过，[日志](build.log)；保留既有字体路径、Browserslist、PostCSS 和包体积警告 |
| 实际 App／真实光影 | [31 项通过](after-realistic/result.json) |
| 实际 App／经典光影 | [31 项通过](after-classic/result.json) |

专项日志保存在 [checks](checks/)。碰撞检查使用实际板条箱模型以及生产 `structColliders`、`structStandTopAt` 和 `canOccupy`；额外注册不可站立的旧合批碰撞，确认它不会再覆盖箱顶。单箱、双箱和旋转空角均有覆盖。

运行脚本进入生产 App，读取独立内存存档，以 `20261006` 开局；使用实际生成的补给箱和尸体，而非临时展示模型。验证了从周围地面跳上单箱、从上方落在双箱、走下箱子，及真实攻击、饮用、Alt 收起与快捷栏切换的优先关系。地图检查确认远处预览不修改区块、物资、实体或探索记录，关闭全开后，已缓存的未探索地形也不会被绘制。

三次运行均为 `--headless=new`、1920×1080、DPR 1、原生 RTX 4060 Laptop／ANGLE／D3D11，没有使用软件渲染。无 WebGL 上下文丢失、运行异常或实际资源加载失败，仅开发服务的 `favicon.ico` 返回 404。脚本专属的浏览器、服务端和 profile 均已清理，并核对无本轮遗留进程。

## 画面对照

| 项目 | 修改前 | 修改后 |
| --- | --- | --- |
| 箱顶 | [原箱顶视角](before-realistic/case-lid.png)；实际落地高度为 0 | [站在箱顶](after-realistic/case-lid.png)；单箱 0.68 米、双箱 1.36 米 |
| 快捷栏 | [直接更换](before-realistic/hotbar-switch.png) | [真实模式切换三帧](after-realistic/hotbar-switch.png)、[经典模式](after-classic/hotbar-switch.png) |
| 地图 | [旧地图](before-realistic/map.png) | [区域、墙柱、门与积水](after-realistic/map.png)、[经典模式](after-classic/map.png) |
| 尸体 | [原睁眼面部](before-realistic/corpse.png) | [闭眼近景](after-realistic/corpse-detail.png)、[完整视角](after-realistic/corpse.png)、[经典模式](after-classic/corpse-detail.png) |

手部三帧图按“旧物品、手部下压、新物品抬回”排列，是从实际游戏 WebGL 画面复制的连续阶段，未增加展示用模型或材质。可见切换阶段本轮约 216–233 ms，数值受帧取样间隔影响。原始时间线记录在对应 `result.json` 中。

箱顶基线明确复现了问题：合并后的网格全部被登记为 `stand:false`，玩家从上方落入箱体并到达地面。修复后的两种光影均验证了真实支撑与侧面阻挡。尸体近景使用正常蹲伏视点及 35° FOV，贴图最终解析为已有 `pool/m0-2/neutral-blink.png`。

地图的七类图例与特征符号已在实际界面核对。当前截图视口包含天鹰、跃金、花园及小径，其他区段使用同一组与 `L1_STYLE_NAMES` 对齐的样式表。没有在小地图下方追加图例。

## 数据与范围

本轮真实／经典模式的进入耗时分别约 3.22／2.10 秒，仅代表这个种子和本次运行，不含初始浏览器模块加载。远处 96×96 米视口的 16 个区块预览分别约 869／703 ms；工作在 Worker 内，不加载相应游戏窗口。原始 `map.openMs` 包含有意等待和完整验证过程，不能当作地图 UI 打开延迟。

React 复核包括：大小地图共用绘制函数、静态且有可访问名称的 SVG 图例、保留视口请求取消和缓存上限、无新增全局 UI 事件监听。普通地图按探索位图裁切，开发者全开和右键传送沿用现有入口。

两次早期脚本失败分别来自合成 Escape 事件缺少 `key` 字段，以及将游戏主画布的根节点误认为小地图容器；修复后重跑通过，原记录保存在 [Escape 诊断](baseline-escape-harness-failure.json) 和 [选择器诊断](minimap-selector-harness-failure.json)。它们不是游戏运行异常。修改前截图由本轮保存的源码快照提供，不会覆盖当前源码。

未做 Android 真机、直接触控游玩、全层级回归或长时间资源压力测试。滚轮、点击与触屏快捷栏均已核对为同一个 `player.selected` 入口；本轮实际输入验证采用数字键、快速连续切换、Alt，以及生产攻击／使用接口。联机保持封闭。
