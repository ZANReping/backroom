# 笑魇攻击与 L9/L10 树木更新（2026-10-16）

修改范围为 `app` 及根 `info.md`。保留工作区原有更新；联机保持冻结，`app-lite` 未修改。

## 实现

五种笑魇的中心停距与伤害边界一起收紧，保留原伤害、冷却、感知及生成规则。距离单位为米，量的是玩家与实体中心，不是牙齿到镜头的距离。

| 变种 | 旧中心停距 | 新中心停距 | 旧伤害边界 | 新伤害边界 |
|---|---:|---:|---:|---:|
| 普通 | 1.90 | 1.45 | 2.30 | 1.57 |
| 幽影 | 1.80 | 1.40 | 2.20 | 1.52 |
| 饥饿 | 2.70 | 1.95 | 3.10 | 2.07 |
| 犬形 | 2.50 | 1.70 | 2.90 | 1.82 |
| 巨型 | 3.40 | 2.70 | 3.80 | 2.82 |

动作分为 0.28 秒蓄力、0.14 秒出击、0.32 秒收势，第 0.38 秒结算一次伤害。双臂后收再前伸，下颌张开再咬合；犬形先抬起前身再扑咬。蓄力时不继续贴向玩家；命中时重新检查距离、墙体、高度和朝向。眩晕会清除待命伤害及攻击姿态。巨型保留低顶弯腰和轻微减速，饥饿型也会俯身对准玩家眼高；移除渲染器旧的额外前推位移，避免近距离面部进入镜头。

L9/L10 改用分枝树干和 L11 的独立叶片图集展开方式。圆冠、窄冠、双干、宽冠、偏冠、疏冠六类树形，各有四种确定性枝干组合；同一世界位置在区块重定位后保持外形。L9 保留原缩放，L10 保持约 7 米等高树及风动。树木位置和生成密度不变。

复用现有 CC0 树皮、叶片颜色／法线／粗糙度图，不新增下载资产。每实例三份几何、两种共享材质，接入原静态合批；树冠和分枝不参与碰撞。CPU 原型缓存上限 48 份，实例持有独立几何，贴图与材质共享。单棵 L9 为 1,714–3,600 三角面，L10 为 2,790–6,280 三角面。详见[素材与许可记录](../../public/textures/L9-L10-TREE-SOURCES.md)。

## 验证与复现

所有命令从 `app` 目录执行：

```text
npm run check:smiler-spacing
npm run check:smiler-strike
npm run check:outdoor-trees
npm run check:smilers
npm run check:smiler-integration
npm run check:smiler-forms
npm run check:l10-model-import
npm run check:l11-greenery
npm run check:static-batch-job
npm run build

node scripts/verify-smiler-trees.mjs --baseline --label=final
node scripts/verify-smiler-trees.mjs --label=final
node scripts/verify-smiler-trees.mjs --baseline --cases=l9-street,l10-field --skip-runtime --label=steady
node scripts/verify-smiler-trees.mjs --cases=l9-street,l10-field --profile-trees --label=steady
node scripts/verify-smiler-trees.mjs --classic --label=final
node scripts/verify-smiler-trees.mjs --cases=phantom-windup,phantom-impact --skip-runtime --label=eyes
node scripts/verify-smiler-trees.mjs --classic --cases=phantom-windup,phantom-impact --skip-runtime --label=eyes
node scripts/summarize-smiler-trees.mjs
```

改前代码保存在本机 `app/.cache/smiler-trees/baseline/src/game`；改前截图与数据也独立保存，重跑 `--baseline` 需要该快照。默认运行验证器测试当前代码。验证器实际加载生产 Engine、Renderer、实体 AI 与模型工厂，隔离存储，不写玩家存档。

- 停距／碰撞步进／巨型低顶／面部投影：19,780 项断言通过，覆盖站立与蹲伏、60°/75° FOV，以及 2.5、2.7、3.25 米和室外顶高。
- 攻击时序：982 项断言通过；直接运行生产 AI，覆盖 30/60/120 Hz 和 100ms 步长、每击只命中一次、后退、隔墙、高度、隐形、眩晕及撤退取消；攻击阶段保持睁眼，避免瞬间眨眼影响近战辨识。
- 树木：1,474 项断言通过；全部 48 个配方检查有限坐标、法线、叶片 UV 岛、三角面预算、高度、实例释放、材质模式与重定位稳定性。
- 现有笑魇行为／子变种／模型、L10 模型、L11 叶片及纹理校验、静态合批回归通过。对应日志在本目录。
- 生产构建通过；现有字体路径、Browserslist、PostCSS、动态导入和大包警告保留，详见 `build.log`。

## 画面与实际游戏检查

[并排截图](comparison.html)与[机器可读对照](comparison.json)。种子 `20261006`，1920×1080，DPR 1，纹理档 2，泛光开启，场景灯池 16，软阴影档 2。真实和经典模式分别验证。Chrome 启动参数包含 `--headless=new`；使用本轮独立配置目录、CDP 端口和开发服务器端口，运行记录包含参数和退出信息。

五种笑魇各取蓄力 0.24 秒和出击 0.38 秒，另取巨型室外近距离视角。对照分别使用改前／改后的实际停距。检查正面眼齿完整，犬形抬身扑咬、饥饿型俯身及巨型低顶姿态均可见。实际地图中的 AI 会从 5 米外逼近、停下并出击；记录每次实际命中距离和动画状态帧，另检查眩晕中断。

幽影的最终两张近景取自 `after-*-eyes` 补拍，验证攻击时保持睁眼；`final` 原始文件保留最初恰好闭眼的画面。并排页与截图汇总使用补拍版本，完整 JSON 保留每次运行的归属及清理记录。

树木保留 L9 夜间街景和 L10 阴天田野原场景，固定世界取景点分别为 `(5.5,27.5)` 和 `(4.5,-24.5)`，FOV 65°；精确朝向、俯仰及截图记录在各次 `runtime.json`。六树形正反面检视统一放在实际 L10 环境光下，使用生产工厂与材质，便于看清轮廓；它不是对 L9 日夜设置的修改。近景检查叶片边缘、枝干连接、树皮 UV、暗处手电和经典模式。

反复生成、删除笑魇和两层树木各三轮，检查几何、纹理、程序数量稳定。实际树木碰撞仍保持树干窄占地，叶冠不堵路。最终运行无浏览器控制台异常或资源请求错误；具体计数见 JSON。

## 性能与限制

真实光影的五轮统计（各轮中位数／P95 再取中位数）：

| 场景 | 改前中位数 / P95 | 改后中位数 / P95 | 改前 → 改后采样最大调用数 | 改前 → 改后采样最大三角面 |
|---|---:|---:|---:|---:|
| L9 街景 | 21.1 / 28.7ms | 25.1 / 33.3ms | 2,437 → 2,481 | 513,257 → 849,809 |
| L10 田野 | 4.2 / 8.4ms | 4.2 / 8.3ms | 347 → 354 | 401,719 → 455,849 |

**L9 真实光影仍未达到 60 FPS，且本轮中位数增加约 4ms。** 树木细节增加了几何及阴影开销，不能将本轮视作 L9 性能优化通过。额外的叶片隐藏、禁用叶片投影／受影、替换漫反射材质诊断没有稳定消除整个场景的长帧，结果保存在 `after-realistic-steady/runtime.json` 的 `treeProfile`。L10 在该固定视角基本持平。

真实模式的最终实际游戏回收检查中，三次移除实体后的资源均为几何 576／纹理 67／程序 122；三次移除两层树木检视实例后均为几何 299／纹理 376／程序 124。两组处于不同层级，不能直接横向比较资源量。原始记录为 [改前五轮](before-realistic-steady/runtime.json)、[改后五轮与行为](after-realistic-steady/runtime.json) 和 [经典模式](after-classic-final/runtime.json)。

自然场景在预热后固定渲染时刻，连续采样五轮；每轮至少 120 帧和 1.5 秒。CPU/GPU 计时、帧间隔中位数/P95、绘制调用、三角面和资源数均保存。场景灯阴影仍按生产逻辑依据壁钟时间分摊更新，因此单帧调用数会波动。RTX 4060 Laptop 的无头桌面结果不等于 Android 或低端显卡表现；没有重新验收全部层级进入时间、全部种子或多人功能。

经典模式用于画面／行为／回收验证，其采样与生产构建存在时间重叠，只作运行记录，不作为独立性能基准。上表真实模式的改前／改后五轮均独立运行。

早期诊断采样保留在非 `final` / `steady` 目录，不作为最终对照。未使用原型截图代替实际运行检查；也不把静态脚本通过等同于所有环境性能达标。
