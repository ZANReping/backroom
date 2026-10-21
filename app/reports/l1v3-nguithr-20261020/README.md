# L1 v3 / Nguithr 接入验收

2026-10-20；当前项目 `C:/Users/ZANRe/Documents/GitHub/backroom`。实现与来源见 [接入说明](../../L1V3-NGUITHR-IMPORT.md)，机器可读汇总见 [summary.json](summary.json)。

## 已通过

| 检查 | 结果 |
| --- | --- |
| 生产构建 | `npm run build` 通过；保留构建完整日志 |
| Nguithr 实际引擎机制 | 80/80：伏击、轻／重度镇静、移动／使用／攻击锁、挣脱、喷液捕食、反制、补囊、死亡掉落、生成、换窗、存档字段不变、遮挡与墙体保护 |
| 动画 | 所有片段及循环无非有限骨骼，穿地／穿顶在原包 6cm 容差内 |
| 新增接入检查 | 49,718 个模型、UV、蒙皮权重、预算、实例释放、材质、LOD 和烘焙索引断言通过 |
| L1 分阶段加载 | 最终光照与已发布 r17 逐值相同；初始／最终几何、UV 相同，队列优先级、取消及过期结果保护通过 |
| L1 离线烘焙 | 108 个区块、11 个取景锚点指纹有效，修订仍为 17 |
| 原有回归 | L1 D 阶段内容、柱网／出口／据点／挂墙物、箱顶与快捷栏、旱虾物品缓存、实体准备／注册、着色程序生命周期均通过 |
| 相关战斗回归 | 杰瑞、派对客、旱虾通过；原有 Alt 收起流程另用实际 App 验证通过 |
| 资产 | 42 张 L1 新贴图和 1 张镇静腺图标与用户附件 SHA-256 逐一一致 |

完整命令分别保存在 `*.log`；对应入口为 `check:nguithr`、`check:nguithr-anim`、`check:l1v3-nguithr`、`check:l1-progressive`、`check:l1-offline`、`check:l1-d-import`、`check:l1-placement-fixes`、`check:l1-interactions`、`check:shrimp-item-cache`、`check:model-warmup`、`check:program-completion`、`check:entity-preparation`、`check:entity-forms`、`check:jerry`、`check:partygoers`、`check:shrimp`。

## 实际游戏

Chrome `--headless=new`，每次独立服务、调试端口、用户目录；ANGLE / NVIDIA RTX 4060 Laptop / D3D11，1920×1080，动态分辨率关闭。检查 SkinnedMesh 可见且没有 CPU 替身；没有使用 SwiftShader。

- [经典模式](final-classic/result.json)：自然场景、新植被／道具、巢、切囊、垂降、进食、休眠、完整实时伏击、键盘挣脱、镇静腺掉落、六轮生成回收。点击继续至可玩约 5.11s。
- [真实模式](final-realistic/result.json)：相同流程通过，约 6.30s。
- [最终输入与碰撞代码复验](final-input-collision/result.json)：实时伏击、键盘挣脱、掉落及回收再通过，约 6.04s。
- [额外天鹰明／暗、衔尾场景](after-realistic-20261006-scenes/result.json)：材质与光照正确加载，没有运行时或 shader 错误。
- [Alt 收起实际 App 回归](holster/desktop/result.json)：键盘收起、恢复、阻止使用／攻击、保留交互、重新绑定及原有模型预览通过。

机位、朝向、FOV、世界坐标、等待耗时、绘制调用、三角面、五轮帧间隔中位数／P95 和完整 GPU 信息均在对应 `result.json`。这些是桌面无头原生 GPU 的实际帧节奏记录，不当作 Android 真机或独立 GPU 计时器结论。

六轮回收后的资源数均保持稳定：经典模式 613 个几何、145 张纹理、90 个程序；真实模式 678 / 172 / 100。这里包括整个已加载世界和有上限的缓存，不是单只实体成本；最终复验的数字以其 JSON 为准。

### 场景与模型截图

[真实模式花园](final-realistic/garden.png) · [经典模式花园](final-classic/garden.png) · [天鹰道具](final-realistic/parking-props.png) · [明亮天鹰](after-realistic-20261006-scenes/parking-bright.png) · [暗色天鹰](after-realistic-20261006-scenes/parking-dark.png) · [衔尾施工段](after-realistic-20261006-scenes/ouroboros.png)

[巢与实体](final-input-collision/nguithr-idle.png) · [切囊](final-input-collision/nguithr-cut.png) · [垂降](final-input-collision/nguithr-descend.png) · [进食](final-input-collision/live-feeding.png) · [挣脱](final-input-collision/escaped.png) · [镇静腺](final-input-collision/sedgland-drop.png)

透明丝网的错误面片投影在首轮发现并修正：[修正前](web-shadow-before.png) / [修正后](web-shadow-after.png)。首轮还曾在刚进入进食状态时过早断言受伤；改为等待首次伤害 tick，后续实时流程均通过。`final-*` 是最终验收，首轮目录只保留排错记录。

## 进入耗时

独立的真实 Engine／Renderer 进入检查，种子 `20261020`。耗时包含地图、附近场景、模型和 GPU 准备，不含 Vite 启动、模块下载及标题页停留。

| 层级 | 本机测得 |
| --- | ---: |
| L1 | 9.45s |
| L2 | 2.34s |
| L3 | 2.52s |
| L5 | 7.08s |
| L8 | 3.89s |

五层均达到本轮十秒目标；这次只重测新增预热涉及的层级。原始数据与截图位于 [进入检查](../level-entry/l1v3-nguithr-entry/runtime.json)，完整日志为 [affected-level-entry.log](affected-level-entry.log)。

## 复现与范围

在 `app` 执行：

```powershell
npm run verify:l1v3-nguithr -- --seed=20261006 --scenes=spawn,parking-props,garden --label=repeat-realistic
npm run verify:l1v3-nguithr -- --seed=20261006 --classic --scenes=spawn,parking-props,garden --label=repeat-classic
node scripts/verify-level-entry.mjs --levels=1,2,3,5,8 --seed=20261020 --label=repeat-import-entry
node scripts/verify-holster.mjs --out=reports/l1v3-nguithr-20261020/holster-repeat
```

原型脚本 `node scripts/verify-nguithr.mjs under-real nest-real anim-descend-mid` 也已在原生 GPU 上通过；结果在 [原型报告](../nguithr/verify-result.json)。

本轮不重新声明全部参考照片的逐像素误差指标，也没有扩大到所有天气／昼夜／移动真机矩阵。群居仍为独立个体，天花板只做短程阻挡检查，没有新增复杂寻路。现有构建的大包、字体／PostCSS 和 Browserslist 提示仍见日志。QA 进程和临时浏览器目录均已清理；用户开发服务保留。
