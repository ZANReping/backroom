# 移动端任务追踪 UI

接入用户提供的 `C:/Users/ZANRe/Downloads/backroom-mobile-quest2.zip`。仅合并任务追踪与预览，保留当前商店、阵营仓库及实体 HUD 更新。

- 手机横屏宽度 ≥768 CSS 像素时，阵营追踪与主线清单纵向排列在左上状态栏旁；更窄横屏放在关卡名下方。
- 手机阵营任务可点按收起或展开，收起时保留品牌、任务名与进度。偏好存于 `localStorage['hud.factionTrackerCollapsed']`，与玩家存档分开；桌面始终显示完整追踪。
- 手机主线清单默认显示当前未完成项与完成数，点按展开完整清单，5 秒后收回；新增完成项时短暂展开 3.5 秒。再次点按可立即收回。
- 保持原有 HUD 解锁条件、MEG / 阵营任务状态、进度及存档格式。触控和键盘激活任务按钮不会把输入传给移动／攻击操作，组件卸载时清理订阅与计时器。
- 预览页：`/proto-mobile-hud.html?task=bntg&main=1&fold=1`；`task` 支持 `meg`、`bntg`、`ariane`、`jerry`、`0`。预览会写入本地显示偏好，仅在独立 QA 浏览器配置中使用。

验收截图、来源哈希及复现命令见 [接入报告](reports/mobile-quest-ui-import-20261025/README.md)。桌面触控模拟不作为 Android / iOS 真机测试结论。
