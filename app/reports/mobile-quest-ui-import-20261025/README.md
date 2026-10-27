# 移动端任务追踪 UI 接入验收 · 2026-10-25

已接入原项目 `E:/ZAN/backroom`，修改限于 `app` 及根项目说明。

## 来源和合并

用户提供 `C:/Users/ZANRe/Downloads/backroom-mobile-quest2.zip`，SHA-256：`b0d3ed35fe8349fcfaf3424a5fdc56323e3b7e0f3b1b77b98aea7ee43cd87c4e`。完整包还包含旧版商店、仓库及相关报告；本轮仅合并 HUD 任务布局、阵营追踪折叠、主线紧凑清单和辅助预览，保留现有爬菌 HUD、物品图标、商店及仓库修正。未增加依赖。

- 横屏 ≥768 CSS 像素：两种任务在左侧状态栏旁纵向排列；窄横屏放在关卡名下方。
- 阵营追踪可触摸展开/收起；`hud.factionTrackerCollapsed` 保存显示偏好。MEG 及其他阵营共用该偏好，桌面保持完整追踪。
- 手机主线默认紧凑，点按展开 5 秒；新增完成项提示 3.5 秒后收起。仍遵守前厅 HUD 解锁条件。
- 补齐 44px 触控目标、键盘激活隔离、计时器及订阅清理；预览参数接入真实 BNTG / ARIANE / JERRY 任务，而非一直显示 MEG。

源包与差异在 `incoming/`，改前文件在 `before/`；[导入清单](import-manifest.json) 记录逐文件 SHA。[操作说明](../../MOBILE-QUEST-UI.md)。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 真实光影实际 App | 42 项通过，14 张截图，0 控制台／网络错误 |
| 经典光影实际 App | 42 项通过，14 张截图，0 控制台／网络错误 |
| 生产构建 `npm run build` | 通过，Vite 29.54 秒；保留项目已有大包等警告 |
| QA 回收 | 两组浏览器、开发服务均退出，独立配置目录已删除 |

测试故事：真实标题与继续游戏 → 在实际 L0 中显示已注册任务夹具 → CDP 原生触摸／键盘 → 任务状态变化与 UI 更新 → 实际 v1 存档 → 整页重载恢复。测试不修改任务结算或奖励逻辑。

覆盖 844×390、915×412、667×375、768×390、740×360、390×844，以及桌面 1920×1080。检查可见状态面板、关卡名和操作按钮不与任务框相交；任务按钮可点击，折叠偏好保留，主线默认紧凑，5 秒/3.5 秒定时收回；原生触摸不移动／旋转／攻击，Space/Enter 不触发跳跃／攻击。验证 MEG→BNTG 切换、BNTG 阶段更新、取消追踪、HUD 解锁和横竖屏反复切换后订阅数量稳定。

本轮为桌面 Chrome 触控／方向模拟，不代表 Android / iOS 真机、刘海安全区或移动 GPU 性能结论。

[汇总数据](validation-summary.json) · [真实模式完整结果](verified-realistic/runtime.json) · [经典模式完整结果](verified-classic/runtime.json) · [构建日志](build.log)

## 截图

| 场景 | 截图 |
| --- | --- |
| 改前 844×390 | [实景基线](baseline-fixed-selector/before-844x390.png) |
| 改后 844×390 | [MEG 与主线](verified-realistic/01-meg-844.png) |
| 阵营追踪收起 | [MEG 折叠](verified-realistic/02-meg-folded.png) |
| 主线完整展开 | [真实模式](verified-realistic/03-main-expanded-844.png) / [经典模式](verified-classic/03-main-expanded-844.png) |
| 667×375 窄横屏 | [任务位于状态栏下方](verified-realistic/05-meg-667x375.png) |
| 768×390 临界宽度 | [侧边任务列](verified-realistic/05-meg-768x390.png) |
| 390×844 竖屏 | [忽略竖屏提示后的布局](verified-realistic/05-meg-390x844.png) |
| BNTG 完整任务 | [TH-001](verified-realistic/07-bntg-open.png) |
| 保存重进 | [记忆折叠状态](verified-classic/08-reloaded-bntg.png) |
| 桌面 | [完整任务清单](verified-realistic/09-desktop-unchanged.png) |

主模型已查看上述关键截图，另检查过进度提示及两个灯光模式下的重载画面。早期采集保留在各诊断目录：修正了 QA 手机标题选择器、CDP Enter 字符事件、页面重载等待、可见子面板遮挡判定、屏幕方向模拟及 DOM 布尔序列化；不将这些中断记作通过。

## 复现

在 `E:/ZAN/backroom/app` 执行：

```powershell
node reports/mobile-quest-ui-import-20261025/verify.mjs --label=recheck-realistic
node reports/mobile-quest-ui-import-20261025/verify.mjs --label=recheck-classic --classic
npm run build
```

脚本创建自己的服务端口、Chrome 调试端口及配置目录，检查实际 `--headless=new` 和配置路径，再在结束时回收。每次使用独立存储，种子 `424242`，Level 0 玩家位置 `(79.5,79.5,0)`、yaw/pitch 均为 0；原生渲染、比例 100、最大像素比 1、动态分辨率关闭，分别指定真实/经典模式。帧率和 GPU 性能不属于本次 UI 验收。

辅助布局预览为 `/proto-mobile-hud.html?task=bntg&main=1&fold=1`；最终功能验收使用实际 App，该页只补查预览包本身可用。
