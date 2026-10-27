# 移动端任务追踪位置 + 阵营追踪可收起

基线：006f250（上一版移动端任务框）→ 本次版本见 git log
- 在 006f250 上：git apply backroom-mobile-quest2-incremental.patch
- 从 032a79a 一次应用：git apply backroom-mobile-quest2-full.patch
- 或把 overlay/ 覆盖到仓库根目录

## 改动
- 横屏且宽度 ≥768px（状态条竖排）时：MEG/阵营追踪和主线清单叠成一列，放在左上状态条和顶部关卡名之间（top 12, left 156, 宽 min(214px, 100vw-630px)）。
- 宽度 <768px（状态条横排，如 667×375）时：保持在关卡名下方偏右。
- MEG/阵营任务追踪在手机上可以点一下收成一行（品牌 · 任务名 + 进度条），再点展开；收起状态存在 localStorage `hud.factionTrackerCollapsed`，下次进游戏仍保持。
- 主线清单行为不变（默认一行，点开 5 秒后自动收回）。桌面端不变。

## 预览
proto-mobile-hud.html?task=meg&main=1&open=1&fold=1

## 验证
tsc 通过；844×390 / 915×412 / 667×375 预览无页面错误。
