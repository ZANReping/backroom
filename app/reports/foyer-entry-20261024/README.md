# 前厅标题、开场坐姿与天花板碰撞 · 2026-10-24

修改并验收原项目 `E:\ZAN\backroom` 的 `app`，保留已有工作区内容。主存档仍为 v:1，既有物品、门和剧情记录保持原样。

## 修改与实际行为

1. 主界面标题与背景使用相同的 `titleBackgroundSource(slots)` 选择结果。最近存档背景是前厅时显示“前 厅 / FRONTROOMS : PROLOGUE”；其他层级显示“后 室 / BACKROOMS : DESCENT”。桌面与横屏布局一致；故障字动画也使用当前标题，切换或卸载时回收两只计时器。

2. 新开序章在实际电脑椅上进入已完成的坐姿，使用原有骨骼、相机偏移、坐姿眼高和起身路径。移动、跳跃、蹲下或交互仍可起身，电脑可以直接使用。只在新开局设置，读档不把玩家重新拉回电脑椅；坐姿存档仍沿用系统已有的安全起身点。

3. 家中、门洞、楼道、楼栋门厅、楼梯和便利店的可见吊顶与碰撞共用建筑数据。家中净高 2.8 m，门厅 3.0 m，楼梯上方 4.6 m，单元门洞 2.6 m，便利店 3.1 m；街道、小区与巷子保持无顶。普通跳跃、蹲姿及不穿墙的开发者飞行均受实际顶面阻挡，并为相机近裁面留空间；显式开启穿墙仍允许越过。

没有新增场景网格、材质、光源或每帧几何构建；地图只增加一个生成时设置的前厅标记，顶面查询为固定建筑范围计算。没有新增第三方资产。

## 实际游戏验收

使用实际 App、原版开始/继续/暂停菜单、键盘事件和存档逻辑。浏览器独立 profile 与端口，真实 `--headless=new`，RTX 4060 Laptop / ANGLE D3D11。1920×1080，DPR 1，原生分辨率，贴图质量 2；关闭动态分辨率与动态曝光。标题页重载时保留本次 QA 浏览器的独立存档，不接触用户浏览器或存档。

| 检查 | 结果与截图 |
| --- | --- |
| 开场就坐 | [真实模式](final-realistic/02-start-seated-at-computer.png)、[经典模式](final-classic/02-start-seated-at-computer.png)。真实模型双髋/膝已弯曲，眼高约 1.27 m，准星初始命中电脑。 |
| 坐姿与交互 | [低头可见双腿](final-realistic/02b-seated-body.png)、[坐着使用电脑](final-realistic/03-computer-while-seated.png)、[按移动键起身](final-realistic/04-standing-after-key.png)。 |
| 保存退出 | [前厅背景与标题](final-realistic/08-saved-foyer-title.png)，实际场景层级 900，标题“前 厅”。 |
| 页面重载及继续 | [重载后](final-realistic/10-reloaded-foyer-title.png)仍是前厅；[继续存档](final-realistic/11-resumed-saved-position.png)回到保存位置，没有重播开场坐姿。 |
| 横屏 UI | [844×390 桌面触控模拟](final-classic/09-foyer-title-mobile-landscape.png)显示前厅标题。此项仅验证布局，不作为 Android 真机性能结论。 |
| 回到后室 | [实际进入 L0 再保存退出](final-realistic/12-backroom-title-restored.png)，背景层级 0，标题恢复“后 室”。 |
| 顶碰撞与室外 | [普通跳跃](final-realistic/05-jump-ceiling.png)、[家中飞行顶碰撞](final-realistic/06-flight-living.png)、[楼梯飞行](final-realistic/06-flight-stairs.png)、[室外继续上升](final-realistic/07-open-sky-flight.png)。相机未越过顶面。 |

真实模式实际跳跃最高脚底 1.100 m、身体顶部 2.800 m，最高相机约 2.657 m；与 2.8 m 吊顶吻合。九处飞行测试的身体顶点如下，固定子步可能提前数厘米停住：

| 实测区域 | 顶面 m | 真实模式最高身体顶 m | 经典模式最高身体顶 m |
| --- | --- | --- | --- |
| bedroom | 2.80 | 2.777 | 2.777 |
| bathroom | 2.80 | 2.777 | 2.777 |
| kitchen | 2.80 | 2.777 | 2.777 |
| living | 2.80 | 2.777 | 2.777 |
| entry | 2.80 | 2.777 | 2.777 |
| landing | 2.80 | 2.777 | 2.777 |
| lobby | 3.00 | 2.975 | 2.975 |
| stairs | 4.60 | 4.600 | 4.600 |
| store | 3.10 | 3.088 | 3.088 |

室外飞行脚底上升至 4.76 m，未被家中高度限制。两种模式均无 JS/运行时异常、无失败游戏资源，只有 favicon.ico 404；所属浏览器、服务器和临时 profile 已回收。

本次按钮到序章可操作实测真实 8.71 s / 经典 8.27 s。此项是功能脚本的一次采样，未进行帧时间性能对照，也不推断所有设备或 Android 的加载时间。

## 自动检查与复现

85 项专项检查覆盖开场坐姿、眼高、正常起身、坐姿保存恢复、12 处顶面、跳跃/蹲姿/飞行/穿墙和标题来源选择；现有序章、墙体、落地物资及座椅模型检查亦通过。

| 命令 | 结果 | 用时 | 日志 |
| --- | --- | --- | --- |
| check:foyer-entry | 通过 | 1.22 s | [日志](check-foyer-entry.log) |
| check:foyer-v2 | 通过 | 16.65 s | [日志](check-foyer-v2.log) |
| check:foyer-shell | 通过 | 0.54 s | [日志](check-foyer-shell.log) |
| check:ferren-foyer-integration | 通过 | 1.62 s | [日志](check-ferren-foyer-integration.log) |
| check:seating | 通过 | 0.71 s | [日志](check-seating.log) |
| build | 通过 | 46.41 s | [日志](build.log) |

在 `E:\ZAN\backroom\app` 执行：

```powershell
npm run check:foyer-entry
npm run check:foyer-v2
npm run check:foyer-shell
npm run check:ferren-foyer-integration
npm run check:seating
npm run build
node scripts/verify-foyer-entry.mjs --label=final-realistic
node scripts/verify-foyer-entry.mjs --classic --label=final-classic
```

原始数据：[真实模式](final-realistic/result.json)、[经典模式](final-classic/result.json)、[精简汇总](summary.json)、[源码清单与哈希](source-changes.json)。

初期 `realistic`、`realistic-final`、`realistic-accepted` 是验收脚本诊断：标题匹配字符串及带引号选择器的转义错误已修正，并提前语法检查所有静态浏览器表达式。最终通过记录只指 `final-realistic` 和 `final-classic`，没有为通过检查更改游戏标题或碰撞条件。
